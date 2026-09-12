const mongoose = require('mongoose');

const nurseSchema = new mongoose.Schema({
    nurseId: {
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
    pointOfCare: {
        type: String,
        enum: ['homecare', 'first_responder', 'ambulance', 'hospital'],
        required: true
    },
    contactNo: {
        type: String,
        trim: true
    },
    // Hashed PIN (salt:hash) for nurse login authentication
    pin: {
        type: String,
        default: null
    }
}, { timestamps: true });

// Ensure hashed PIN is never exposed in JSON responses
nurseSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.pin;
        return ret;
    }
});

module.exports = mongoose.model('Nurse', nurseSchema);
