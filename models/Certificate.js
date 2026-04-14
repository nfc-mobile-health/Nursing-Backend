const mongoose = require('mongoose');

// Stores the patient device's certificate reference.
// The actual certificate is issued by the TCA server (tca-server/).
// Private keys are NEVER stored here — they live only on the device.
const certificateSchema = new mongoose.Schema({
    // Serial number assigned by the TCA server
    certId: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    patientId: {
        type: String,
        required: true,
        trim: true
    },
    // Base64-encoded public key sent by the device
    pubKey: {
        type: String,
        required: true
    },
    issuedAt: {
        type: Date,
        required: true
    },
    expiresAt: {
        type: Date,
        required: true
    },
    isRevoked: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

module.exports = mongoose.model('Certificate', certificateSchema);
