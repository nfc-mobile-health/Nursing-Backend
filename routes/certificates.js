const express = require('express');
const router = express.Router();
const Certificate = require('../models/Certificate');
const Patient = require('../models/Patient');

// Store a certificate reference for a patient.
// The actual certificate is issued by the TCA server — this just records the link.
// The device keeps its private key; only certId and pubKey are sent here.
router.post('/', async (req, res) => {
    try {
        const { certId, patientId, pubKey, issuedAt, expiresAt } = req.body;

        if (!certId || !patientId || !pubKey || !issuedAt || !expiresAt) {
            return res.status(400).json({
                success: false,
                message: 'certId, patientId, pubKey, issuedAt, and expiresAt are required'
            });
        }

        const existing = await Certificate.findOne({ certId });
        if (existing) {
            return res.json({ success: true, message: 'Certificate already registered', certificate: existing });
        }

        const certificate = await Certificate.create({
            certId,
            patientId,
            pubKey,
            issuedAt: new Date(issuedAt),
            expiresAt: new Date(expiresAt)
        });

        // Link certId to the patient record.
        await Patient.findOneAndUpdate({ patientId }, { certId });

        res.status(201).json({ success: true, message: 'Certificate registered', certificate });

    } catch (err) {
        console.error('[CERTIFICATES] Post error:', err.message);
        res.status(500).json({ success: false, message: 'Server error', detail: err.message });
    }
});

// Get certificate info for a patient.
router.get('/:patientId', async (req, res) => {
    try {
        const certificate = await Certificate.findOne({ patientId: req.params.patientId });
        if (!certificate) return res.status(404).json({ success: false, message: 'No certificate found' });
        res.json({ success: true, certificate });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
