const express = require('express');
const router = express.Router();
const Nurse = require('../models/Nurse');
const { issueOrReuse, getUsableCredentials } = require('../services/credentialStore');

// Register a nurse and issue their credential.
// Idempotent: re-registering an existing nurse returns their record and PUBLIC
// credential material only (the private key is issued exactly once).
router.post('/register', async (req, res) => {
    try {
        const { nurseId, name, age, gender, pointOfCare, contactNo } = req.body;

        if (!nurseId || !name || !pointOfCare) {
            return res.status(400).json({ success: false, message: 'nurseId, name, and pointOfCare are required' });
        }

        let nurse = await Nurse.findOne({ nurseId });
        const created = !nurse;
        if (!nurse) {
            nurse = await Nurse.create({ nurseId, name, age, gender, pointOfCare, contactNo });
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

// Get nurse profile by nurseId (login). Also returns the stored credentials
// (incl. private key) so a device that cleared its data can re-provision.
router.get('/:nurseId', async (req, res) => {
    try {
        const nurse = await Nurse.findOne({ nurseId: req.params.nurseId });
        if (!nurse) return res.status(404).json({ success: false, message: 'Nurse not found' });

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
