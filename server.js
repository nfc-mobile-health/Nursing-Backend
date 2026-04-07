const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nursing_reports')
    .then(() => console.log('✅ MongoDB connected'))
    .catch(err => {
        console.error('❌ MongoDB connection error:', err);
        process.exit(1);
    });

// --- New routes ---
app.use('/api/nurses',       require('./routes/nurses'));
app.use('/api/patients',     require('./routes/patients'));
app.use('/api/records',      require('./routes/records'));
app.use('/api/certificates', require('./routes/certificates'));

// --- Legacy /api/reports — kept for Aggregator backward compatibility ---
// The Aggregator's SyncRepository.kt posts raw text file content here.
// Do not remove until the Android app is updated to use /api/records.
const reportSchema = new mongoose.Schema({
    deviceId:   { type: String, required: true },
    date:       { type: String, required: true },
    fileName:   { type: String, required: true },
    content:    { type: String, required: true },
    receivedAt: { type: String }
}, { timestamps: true });

const Report = mongoose.model('Report', reportSchema);

app.post('/api/reports', async (req, res) => {
    try {
        const { deviceId, date, fileName, content, receivedAt } = req.body;

        if (!deviceId || !date || !fileName || !content) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: deviceId, date, fileName, content'
            });
        }

        const report = await new Report({ deviceId, date, fileName, content, receivedAt }).save();

        res.json({ success: true, message: 'Report stored successfully', id: report._id.toString() });

    } catch (err) {
        console.error('Error saving report:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log('\nEndpoints:');
    console.log(`  POST  /api/nurses/register`);
    console.log(`  GET   /api/nurses/:nurseId`);
    console.log(`  POST  /api/patients/register`);
    console.log(`  GET   /api/patients/:patientId`);
    console.log(`  POST  /api/records`);
    console.log(`  GET   /api/records/:patientId`);
    console.log(`  GET   /api/records/:patientId/latest`);
    console.log(`  POST  /api/certificates`);
    console.log(`  GET   /api/certificates/:patientId`);
    console.log(`  POST  /api/reports  (legacy)`);
    console.log(`  GET   /health`);
});
