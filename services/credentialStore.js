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
 *   - VALID credential already exists -> return it (incl. the stored private key).
 *   - otherwise (missing / expired / revoked) -> generate a new one.
 *
 * @returns {{ reused: boolean, credentials: object }}
 */
async function issueOrReuse(ownerId, role) {
    const existing = await Credential.findOne({ ownerId });
    if (existing && existing.isValid()) {
        return { reused: true, credentials: toDeviceCredentials(existing) };
    }
    return { reused: false, credentials: await forceIssue(ownerId, role) };
}

/**
 * Shape a stored Credential doc into the device-facing credentials object
 * (the same shape forceIssue / issueCredential return). Includes the private key.
 */
function toDeviceCredentials(cred) {
    return {
        privateKey: cred.privKeyB64,
        publicKey: cred.pubKeyB64,
        certificate: cred.certPem,
        caCertificate: getCaCertPem()
    };
}

/**
 * Fetch a usable stored credential for login/re-provisioning.
 * Returns the device-facing credentials (incl. private key), or null if there is
 * no credential or it is revoked/expired.
 */
async function getUsableCredentials(ownerId) {
    const cred = await Credential.findOne({ ownerId });
    if (!cred || !cred.isValid()) return null;
    return toDeviceCredentials(cred);
}

module.exports = { issueOrReuse, forceIssue, getUsableCredentials };
