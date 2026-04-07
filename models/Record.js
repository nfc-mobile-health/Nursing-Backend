const mongoose = require('mongoose');

// A full nursing visit record — one per form submission from NursingDevice.
const recordSchema = new mongoose.Schema({
    patientId: {
        type: String,
        required: true,
        trim: true
    },
    nurseId: {
        type: String,
        required: true,
        trim: true
    },
    date: {
        type: String,   // yyyy-MM-dd
        required: true
    },
    time: {
        type: String    // HH:mm
    },
    bp: {
        type: String    // e.g. "120/80"
    },
    hr: {
        type: Number    // beats per minute
    },
    rr: {
        type: Number    // breaths per minute (respiratory rate)
    },
    temp: {
        type: Number    // body temperature
    },
    obs: {
        type: String    // observations / description
    },
    med: {
        type: String    // medication
    }
}, { timestamps: true });

module.exports = mongoose.model('Record', recordSchema);
