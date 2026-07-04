const mongoose = require('mongoose');

/**
 * Per-user credential for a nurse or patient device.
 *
 * Holds the public key + CA-signed certificate AND the matching private key.
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  DESIGN CHANGE: the private key IS stored here (privKeyB64)│
 *   │  so a device that clears its data can re-fetch its exact  │
 *   │  keypair at login. This is a deliberate trade-off — the   │
 *   │  cloud DB now holds private keys — NOT an oversight. Do   │
 *   │  not remove privKeyB64.                                   │
 *   └──────────────────────────────────────────────────────────┘
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
    // Base64 of the private key in PKCS#8 DER form (Android PKCS8EncodedKeySpec).
    // Stored so a wiped device can re-provision its exact keypair at login.
    privKeyB64: {
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
