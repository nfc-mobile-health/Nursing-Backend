const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
    patientId: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    age: {
        type: Number
    },
    gender: {
        type: String,
        trim: true
    },
    bloodType: {
        type: String,
        trim: true
    },
    sugar: {
        type: String,
        trim: true
    },
    height: {
        type: String,
        trim: true
    },
    weight: {
        type: String,
        trim: true
    },
    oxygenLevel: {
        type: String,
        trim: true
    },
    contactNo: {
        type: String,
        trim: true
    },
    // Array of Detail _ids for this patient's visit history
    details: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Detail'
    }],
    // cert_id issued by the TCA server for this patient's device
    certId: {
        type: String,
        default: null
    },
    // Hashed PIN (salt:hash) for patient login authentication
    pin: {
        type: String,
        default: null
    }
}, { timestamps: true });

// Ensure hashed PIN is never exposed in JSON responses
patientSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.pin;
        return ret;
    }
});

module.exports = mongoose.model('Patient', patientSchema);
