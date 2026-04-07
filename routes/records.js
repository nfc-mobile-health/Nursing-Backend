const express = require('express');
const router = express.Router();
const Record = require('../models/Record');
const Detail = require('../models/Detail');
const Patient = require('../models/Patient');

// Submit a structured nursing visit record.
// Called by the Aggregator after receiving a form from NursingDevice.
// Also creates a Detail summary and appends it to the Patient's details[].
router.post('/', async (req, res) => {
    try {
        const { patientId, nurseId, date, time, bp, hr, rr, temp, obs, med } = req.body;

        if (!patientId || !nurseId || !date) {
            return res.status(400).json({ success: false, message: 'patientId, nurseId, and date are required' });
        }

        // Create the full record.
        const record = await Record.create({ patientId, nurseId, date, time, bp, hr, rr, temp, obs, med });

        // Create a lightweight detail summary.
        const detail = await Detail.create({
            patientId,
            nurseId,
            bp,
            hr,
            temp,
            recordId: record._id
        });

        // Append detail to patient's history (non-blocking if patient not registered yet).
        await Patient.findOneAndUpdate(
            { patientId },
            { $push: { details: detail._id } }
        );

        res.status(201).json({ success: true, message: 'Record saved', recordId: record._id });

    } catch (err) {
        console.error('[RECORDS] Post error:', err.message);
        res.status(500).json({ success: false, message: 'Server error', detail: err.message });
    }
});

// Get all records for a patient, newest first.
router.get('/:patientId', async (req, res) => {
    try {
        const records = await Record.find({ patientId: req.params.patientId }).sort({ createdAt: -1 });
        res.json({ success: true, count: records.length, records });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Get the most recent record for a patient.
router.get('/:patientId/latest', async (req, res) => {
    try {
        const record = await Record.findOne({ patientId: req.params.patientId }).sort({ createdAt: -1 });
        if (!record) return res.status(404).json({ success: false, message: 'No records found' });
        res.json({ success: true, record });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
