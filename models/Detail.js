const mongoose = require('mongoose');

// Lightweight visit summary stored inside Patient.details[].
// Points back to the full Record for complete data.
const detailSchema = new mongoose.Schema({
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
    bp: {
        type: String
    },
    hr: {
        type: Number
    },
    temp: {
        type: Number
    },
    // Reference to the full Record document
    recordId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Record',
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Detail', detailSchema);
