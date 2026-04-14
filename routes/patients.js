const express = require('express');
const router = express.Router();
const Patient = require('../models/Patient');

// Register a patient. If patientId already exists, return the existing record.
router.post('/register', async (req, res) => {
    try {
        const { patientId, name, age, gender, bloodType, contactNo } = req.body;

        if (!patientId || !name) {
            return res.status(400).json({ success: false, message: 'patientId and name are required' });
        }

        const existing = await Patient.findOne({ patientId });
        if (existing) {
            return res.json({ success: true, message: 'Patient already registered', patient: existing });
        }

        const patient = await Patient.create({ patientId, name, age, gender, bloodType, contactNo });
        res.status(201).json({ success: true, message: 'Patient registered', patient });

    } catch (err) {
        console.error('[PATIENTS] Register error:', err.message);
        res.status(500).json({ success: false, message: 'Server error', detail: err.message });
    }
});

// Get patient profile with their full details history populated.
router.get('/:patientId', async (req, res) => {
    try {
        const patient = await Patient.findOne({ patientId: req.params.patientId })
            .populate({ path: 'details', options: { sort: { createdAt: -1 } } });

        if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });
        res.json({ success: true, patient });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
