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
    }
}, { timestamps: true });

module.exports = mongoose.model('Nurse', nurseSchema);
