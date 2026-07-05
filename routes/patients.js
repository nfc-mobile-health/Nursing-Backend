const express = require('express');
const router = express.Router();
const Patient = require('../models/Patient');
const { issueOrReuse, getUsableCredentials } = require('../services/credentialStore');

// Register a patient and issue their credential.
// Idempotent: re-registering an existing patient returns their record and PUBLIC
// credential material only (the private key is issued exactly once).
router.post('/register', async (req, res) => {
    try {
        const { patientId, name, age, gender, bloodType, contactNo } = req.body;

        if (!patientId || !name) {
            return res.status(400).json({ success: false, message: 'patientId and name are required' });
        }

        let patient = await Patient.findOne({ patientId });
        const created = !patient;
        if (!patient) {
            patient = await Patient.create({ patientId, name, age, gender, bloodType, contactNo });
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

// Get patient profile with their full details history populated (login).
// Also returns the stored credentials (incl. private key) so an Aggregator that
// cleared its data can re-provision — mirrors the nurse login route.
router.get('/:patientId', async (req, res) => {
    try {
        const patient = await Patient.findOne({ patientId: req.params.patientId })
            .populate({ path: 'details', options: { sort: { createdAt: -1 } } });

        if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });

        // Best-effort: a credential lookup hiccup must not block login.
        let credentials = null;
        try {
            credentials = await getUsableCredentials(req.params.patientId);
        } catch (e) {
            console.error('[PATIENTS] Credential fetch failed:', e.message);
        }

        res.json({ success: true, patient, credentials });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
