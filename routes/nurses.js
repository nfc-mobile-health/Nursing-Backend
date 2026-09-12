const express = require('express');
const router = express.Router();
const Nurse = require('../models/Nurse');
const { issueOrReuse, getUsableCredentials } = require('../services/credentialStore');
const { hashPin, verifyPin, isValidPin } = require('../services/pinAuth');

// Register a nurse and issue their credential.
// Idempotent: re-registering an existing nurse returns their record and PUBLIC
// credential material only (the private key is issued exactly once).
router.post('/register', async (req, res) => {
    try {
        const { nurseId, name, age, gender, pointOfCare, contactNo, pin } = req.body;

        if (!nurseId || !name || !pointOfCare) {
            return res.status(400).json({ success: false, message: 'nurseId, name, and pointOfCare are required' });
        }

        if (pin && !isValidPin(pin)) {
            return res.status(400).json({ success: false, message: 'PIN must be at least 4 digits' });
        }

        let nurse = await Nurse.findOne({ nurseId });
        const created = !nurse;
        if (!nurse) {
            nurse = await Nurse.create({
                nurseId,
                name,
                age,
                gender,
                pointOfCare,
                contactNo,
                pin: pin ? hashPin(pin) : null
            });
        } else {
            // Existing nurse: if legacy account with no PIN, claim the provided PIN
            if (!nurse.pin && pin) {
                nurse.pin = hashPin(pin);
                await nurse.save();
                console.log(`[NURSES] Claimed PIN for legacy nurse on re-register: ${nurseId}`);
            } else if (nurse.pin && pin) {
                if (!verifyPin(pin, nurse.pin)) {
                    return res.status(401).json({
                        success: false,
                        message: 'Nurse already registered with a different PIN'
                    });
                }
            }
        }

        // Issue (or reuse) the credential. Best-effort: a CA hiccup must not block
        // user registration — the device can retry / call /rotate later.
        let credentials = null, credentialError = null;
        try {
            ({ credentials } = await issueOrReuse(nurseId, 'nurse'));
        } catch (e) {
            credentialError = e.message;
            console.error('[NURSES] Credential issuance failed:', e.message);
        }

        res.status(created ? 201 : 200).json({
            success: true,
            message: created ? 'Nurse registered' : 'Nurse already registered',
            nurse,
            credentials,
            ...(credentialError ? { credentialError } : {})
        });

    } catch (err) {
        console.error('[NURSES] Register error:', err.message);
        res.status(500).json({ success: false, message: 'Server error', detail: err.message });
    }
});

// Nurse login with PIN authentication.
// Handles legacy accounts without a stored PIN via first-login claim.
router.post('/login', async (req, res) => {
    try {
        const { nurseId, pin } = req.body;

        if (!nurseId) {
            return res.status(400).json({ success: false, message: 'nurseId is required' });
        }
        if (!pin) {
            return res.status(400).json({ success: false, message: 'PIN is required' });
        }

        const nurse = await Nurse.findOne({ nurseId });
        if (!nurse) {
            return res.status(404).json({ success: false, message: 'Nurse not found. Please register first.' });
        }

        // Handle legacy accounts without a stored PIN: claim PIN on first login
        if (!nurse.pin) {
            if (!isValidPin(pin)) {
                return res.status(400).json({ success: false, message: 'PIN must be at least 4 digits' });
            }
            nurse.pin = hashPin(pin);
            await nurse.save();
            console.log(`[NURSES] Successfully claimed PIN for legacy nurse: ${nurseId}`);
        } else {
            // Verify existing PIN
            if (!verifyPin(pin, nurse.pin)) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid PIN. Please check your PIN and try again.'
                });
            }
        }

        // Credentials returned for authorized nurse session
        let credentials = null;
        try {
            credentials = await getUsableCredentials(nurseId);
        } catch (e) {
            console.error('[NURSES] Credential fetch failed:', e.message);
        }

        res.json({
            success: true,
            message: 'Login successful',
            nurse,
            credentials
        });
    } catch (err) {
        console.error('[NURSES] Login error:', err.message);
        res.status(500).json({ success: false, message: 'Server error', detail: err.message });
    }
});

// Get nurse profile by nurseId.
// Requires PIN authentication to return credentials.
router.get('/:nurseId', async (req, res) => {
    try {
        const nurse = await Nurse.findOne({ nurseId: req.params.nurseId });
        if (!nurse) return res.status(404).json({ success: false, message: 'Nurse not found' });

        const pin = req.query.pin || req.headers['x-pin'];
        if (!pin) {
            return res.status(401).json({
                success: false,
                message: 'PIN is required to log in and retrieve credentials'
            });
        }

        if (!nurse.pin) {
            if (isValidPin(pin)) {
                nurse.pin = hashPin(pin);
                await nurse.save();
                console.log(`[NURSES] Claimed PIN for legacy nurse via GET: ${req.params.nurseId}`);
            }
        } else if (!verifyPin(pin, nurse.pin)) {
            return res.status(401).json({ success: false, message: 'Invalid PIN' });
        }

        // Best-effort: a credential lookup hiccup must not block login.
        let credentials = null;
        try {
            credentials = await getUsableCredentials(req.params.nurseId);
        } catch (e) {
            console.error('[NURSES] Credential fetch failed:', e.message);
        }

        res.json({ success: true, nurse, credentials });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
