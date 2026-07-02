const express = require('express');
const router = express.Router();
const Credential = require('../models/Credential');
const { getCaCertPem } = require('../services/credentialService');
const { forceIssue } = require('../services/credentialStore');

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Public CA certificate — devices use this to verify peers.
// Defined before /:ownerId so "ca" isn't swallowed as an ownerId.
router.get('/ca', (req, res) => {
    try {
        res.json({ success: true, caCertificate: getCaCertPem() });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Verify a credential's usability (expiry + revocation).
router.get('/verify/:ownerId', async (req, res) => {
    try {
        const cred = await Credential.findOne({ ownerId: req.params.ownerId });
        if (!cred) return res.status(404).json({ success: false, valid: false, reason: 'Not registered' });
        if (cred.isRevoked) return res.json({ success: true, valid: false, reason: 'Revoked' });
        if (cred.expiresAt <= new Date()) return res.json({ success: true, valid: false, reason: 'Expired' });
        res.json({ success: true, valid: true, role: cred.role });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Public material for one owner (NEVER the private key).
router.get('/:ownerId', async (req, res) => {
    try {
        const cred = await Credential.findOne({ ownerId: req.params.ownerId });
        if (!cred) return res.status(404).json({ success: false, message: 'No credential found' });
        res.json({
            success: true,
            credential: {
                ownerId: cred.ownerId,
                role: cred.role,
                publicKey: cred.pubKeyB64,
                certificate: cred.certPem,
                caCertificate: getCaCertPem(),
                serialNumber: cred.serialNumber,
                issuedAt: cred.issuedAt,
                expiresAt: cred.expiresAt,
                isRevoked: cred.isRevoked
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Revoke a credential (lost-device flow).
router.post('/revoke', async (req, res) => {
    try {
        const { ownerId, reason } = req.body;
        if (!ownerId) return res.status(400).json({ success: false, message: 'ownerId is required' });

        const cred = await Credential.findOneAndUpdate(
            { ownerId },
            { isRevoked: true, revokedAt: new Date() },
            { new: true }
        );
        if (!cred) return res.status(404).json({ success: false, message: 'Credential not found' });

        console.log(`[CREDENTIALS] Revoked: ${ownerId} (${reason || 'no reason'})`);
        res.json({ success: true, message: `Credential revoked for ${ownerId}` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Rotate — force a fresh keypair + cert, return the new private key ONCE.
// Used when a device lost its key (re-register alone won't regenerate).
router.post('/rotate', async (req, res) => {
    try {
        const { ownerId } = req.body;
        let { role } = req.body;
        if (!ownerId) return res.status(400).json({ success: false, message: 'ownerId is required' });

        if (!role) {
            const existing = await Credential.findOne({ ownerId });
            role = existing?.role;
        }
        if (!['nurse', 'patient'].includes(role)) {
            return res.status(400).json({ success: false, message: "role ('nurse'|'patient') is required" });
        }

        const credentials = await forceIssue(ownerId, role);
        console.log(`[CREDENTIALS] Rotated: ${ownerId} (${role})`);
        res.json({ success: true, message: 'Credential rotated', credentials });
    } catch (err) {
        console.error('[CREDENTIALS] Rotate error:', err.message);
        res.status(500).json({ success: false, message: 'Server error', detail: err.message });
    }
});

module.exports = router;
