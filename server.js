const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Large limit for report content
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nursing_reports')
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Report Schema
const reportSchema = new mongoose.Schema({
  deviceId: { type: String, required: true },
  date: { type: String, required: true }, // yyyy-MM-dd
  fileName: { type: String, required: true },
  content: { type: String, required: true },
  receivedAt: { type: String }
}, { timestamps: true });

const Report = mongoose.model('Report', reportSchema);

// API Routes
app.post('/api/reports', async (req, res) => {
  try {
    const { deviceId, date, fileName, content, receivedAt } = req.body;

    // Basic validation
    if (!deviceId || !date || !fileName || !content) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: deviceId, date, fileName, content'
      });
    }

    const report = new Report({
      deviceId,
      date,
      fileName,
      content,
      receivedAt
    });

    const savedReport = await report.save();

    res.json({
      success: true,
      message: 'Report stored successfully',
      id: savedReport._id.toString()
    });
  } catch (error) {
    console.error('Error saving report:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 POST /api/reports to sync reports`);
});

