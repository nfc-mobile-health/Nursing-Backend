const mongoose = require('mongoose');

/**
 * Per-user credential — PUBLIC material only.
 *
 * Replaces the old placeholder Certificate.js. Holds the public key + the
 * CA-signed certificate for a nurse or patient device. The matching PRIVATE key
 * is generated on the server, returned to the device once, and is NEVER stored
 * here.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │  There is deliberately NO privateKey field.   │
 *   │  If you ever see one here, that's a security   │
 *   │  bug — remove it.                              │
 *   └──────────────────────────────────────────────┘
 *
 * Design ref: CREDENTIALS_AND_STORAGE_PLAN.md §3.2, CREDENTIALS_DESIGN.md Step 2.
 */
const credentialSchema = new mongoose.Schema({
    // Join key across Nurse / Patient. Equals nurseId or patientId, and is the
    // certificate's CommonName.
    ownerId: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        index: true
    },
    role: {
        type: String,
        enum: ['nurse', 'patient'],
        required: true
    },
    // Base64 of the public key in SPKI DER form (Android X509EncodedKeySpec).
    pubKeyB64: {
        type: String,
        required: true
    },
    // CA-signed X.509 certificate, PEM.
    certPem: {
        type: String,
        required: true
    },
    serialNumber: {
        type: String,
        required: true,
        unique: true
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
    },
    revokedAt: {
        type: Date,
        default: null
    }
}, { timestamps: true });

/** A credential is usable if it is neither revoked nor expired. */
credentialSchema.methods.isValid = function () {
    return !this.isRevoked && this.expiresAt > new Date();
};

module.exports = mongoose.model('Credential', credentialSchema);
