/**
 * credentialStore — DB-aware issuance helpers shared by the register routes and
 * the credentials routes. Keeps the "issue vs. reuse" policy in one place.
 *
 * credentialService = pure crypto (keygen + cert).  credentialStore = crypto + Mongo.
 */
const Credential = require('../models/Credential');
const { issueCredential, getCaCertPem } = require('./credentialService');

/**
 * Force a brand-new keypair + cert and persist the PUBLIC part (upsert).
 * Returns the full credentials incl. the private key (returned to device once).
 */
async function forceIssue(ownerId, role) {
    const { store, credentials } = issueCredential(ownerId, role);
    await Credential.findOneAndUpdate(
        { ownerId },
        { ownerId, role, ...store, isRevoked: false, revokedAt: null },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return credentials;
}

/**
 * Idempotent issuance used at registration.
 *   - VALID credential already exists -> return PUBLIC material only (no private key).
 *   - otherwise (missing / expired / revoked) -> generate a new one.
 *
 * @returns {{ reused: boolean, credentials: object }}
 */
async function issueOrReuse(ownerId, role) {
    const existing = await Credential.findOne({ ownerId });
    if (existing && existing.isValid()) {
        return {
            reused: true,
            credentials: {
                publicKey: existing.pubKeyB64,
                certificate: existing.certPem,
                caCertificate: getCaCertPem()
                // no privateKey — only ever returned at first issue / rotate
            }
        };
    }
    return { reused: false, credentials: await forceIssue(ownerId, role) };
}

module.exports = { issueOrReuse, forceIssue };
