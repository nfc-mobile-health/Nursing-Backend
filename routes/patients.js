const express = require('express');
const router = express.Router();
const Patient = require('../models/Patient');
const { issueOrReuse, getUsableCredentials } = require('../services/credentialStore');
const { hashPin, verifyPin, isValidPin } = require('../services/pinAuth');

// Register a patient and issue their credential.
// Idempotent: re-registering an existing patient returns their record and PUBLIC
// credential material only (the private key is issued exactly once).
router.post('/register', async (req, res) => {
    try {
        const { patientId, name, age, gender, bloodType, sugar, height, weight, oxygenLevel, spo2, contactNo, pin } = req.body;
        const resolvedOxygen = oxygenLevel || spo2;

        if (!patientId || !name) {
            return res.status(400).json({ success: false, message: 'patientId and name are required' });
        }

        if (pin && !isValidPin(pin)) {
            return res.status(400).json({ success: false, message: 'PIN must be at least 4 digits' });
        }

        let patient = await Patient.findOne({ patientId });
        const created = !patient;
        if (!patient) {
            patient = await Patient.create({
                patientId,
                name,
                age,
                gender,
                bloodType,
                sugar,
                height,
                weight,
                oxygenLevel: resolvedOxygen,
                contactNo,
                pin: pin ? hashPin(pin) : null
            });
        } else {
            // Existing patient: if legacy account with no PIN, claim the provided PIN
            if (!patient.pin && pin) {
                patient.pin = hashPin(pin);
                await patient.save();
                console.log(`[PATIENTS] Claimed PIN for legacy patient on re-register: ${patientId}`);
            } else if (patient.pin && pin) {
                if (!verifyPin(pin, patient.pin)) {
                    return res.status(401).json({
                        success: false,
                        message: 'Patient already registered with a different PIN'
                    });
                }
            }
        }

        // Issue (or reuse) the credential. Best-effort: a CA hiccup must not block
        // user registration — the device can retry / call /rotate later.
        let credentials = null, credentialError = null;
        try {
            ({ credentials } = await issueOrReuse(patientId, 'patient'));
        } catch (e) {
            credentialError = e.message;
            console.error('[PATIENTS] Credential issuance failed:', e.message);
        }

        res.status(created ? 201 : 200).json({
            success: true,
            message: created ? 'Patient registered' : 'Patient already registered',
            patient,
            credentials,
            ...(credentialError ? { credentialError } : {})
        });

    } catch (err) {
        console.error('[PATIENTS] Register error:', err.message);
        res.status(500).json({ success: false, message: 'Server error', detail: err.message });
    }
});

// Patient login with PIN authentication.
// Handles legacy accounts without a stored PIN via first-login claim.
router.post('/login', async (req, res) => {
    try {
        const { patientId, pin } = req.body;

        if (!patientId) {
            return res.status(400).json({ success: false, message: 'patientId is required' });
        }
        if (!pin) {
            return res.status(400).json({ success: false, message: 'PIN is required' });
        }

        const patient = await Patient.findOne({ patientId })
            .populate({ path: 'details', options: { sort: { createdAt: -1 } } });

        if (!patient) {
            return res.status(404).json({ success: false, message: 'Patient ID not found. Please register first.' });
        }

        // Handle legacy accounts without a stored PIN: claim PIN on first login
        if (!patient.pin) {
            if (!isValidPin(pin)) {
                return res.status(400).json({ success: false, message: 'PIN must be at least 4 digits' });
            }
            patient.pin = hashPin(pin);
            await patient.save();
            console.log(`[PATIENTS] Successfully claimed PIN for legacy patient: ${patientId}`);
        } else {
            // Verify existing PIN
            if (!verifyPin(pin, patient.pin)) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid PIN. Please check your PIN and try again.'
                });
            }
        }

        // Credentials returned for authorized patient session
        let credentials = null;
        try {
            credentials = await getUsableCredentials(patientId);
        } catch (e) {
            console.error('[PATIENTS] Credential fetch failed:', e.message);
        }

        res.json({
            success: true,
            message: 'Login successful',
            patient,
            credentials
        });
    } catch (err) {
        console.error('[PATIENTS] Login error:', err.message);
        res.status(500).json({ success: false, message: 'Server error', detail: err.message });
    }
});

// Get patient profile with their full details history populated.
// If valid PIN is provided, returns stored credentials (incl. private key).
// If no PIN provided, returns public patient data without credentials (e.g. for NursingDevice lookups).
router.get('/:patientId', async (req, res) => {
    try {
        const patient = await Patient.findOne({ patientId: req.params.patientId })
            .populate({ path: 'details', options: { sort: { createdAt: -1 } } });

        if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });

        const pin = req.query.pin || req.headers['x-pin'];
        let credentials = null;

        if (pin) {
            if (!patient.pin) {
                if (isValidPin(pin)) {
                    patient.pin = hashPin(pin);
                    await patient.save();
                    console.log(`[PATIENTS] Claimed PIN for legacy patient via GET: ${req.params.patientId}`);
                }
            } else if (!verifyPin(pin, patient.pin)) {
                return res.status(401).json({ success: false, message: 'Invalid PIN' });
            }

            try {
                credentials = await getUsableCredentials(req.params.patientId);
            } catch (e) {
                console.error('[PATIENTS] Credential fetch failed:', e.message);
            }
        }

        res.json({ success: true, patient, credentials });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
