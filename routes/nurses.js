const express = require('express');
const router = express.Router();
const Nurse = require('../models/Nurse');

// Register a nurse. If nurseId already exists, return the existing record.
router.post('/register', async (req, res) => {
    try {
        const { nurseId, name, age, gender, pointOfCare, contactNo } = req.body;

        if (!nurseId || !name || !pointOfCare) {
            return res.status(400).json({ success: false, message: 'nurseId, name, and pointOfCare are required' });
        }

        const existing = await Nurse.findOne({ nurseId });
        if (existing) {
            return res.json({ success: true, message: 'Nurse already registered', nurse: existing });
        }

        const nurse = await Nurse.create({ nurseId, name, age, gender, pointOfCare, contactNo });
        res.status(201).json({ success: true, message: 'Nurse registered', nurse });

    } catch (err) {
        console.error('[NURSES] Register error:', err.message);
        res.status(500).json({ success: false, message: 'Server error', detail: err.message });
    }
});

// Get nurse profile by nurseId.
router.get('/:nurseId', async (req, res) => {
    try {
        const nurse = await Nurse.findOne({ nurseId: req.params.nurseId });
        if (!nurse) return res.status(404).json({ success: false, message: 'Nurse not found' });
        res.json({ success: true, nurse });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
