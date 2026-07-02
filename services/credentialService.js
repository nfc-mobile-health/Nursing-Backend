/**
 * credentialService — the ONLY place per-user keys and certificates are born.
 *
 * Responsibilities:
 *   1. Load the CA (private key + cert) once, from env (prod) or ca/ files (dev).
 *   2. Generate a fresh RSA-2048 keypair per user.
 *   3. Export the keys in the EXACT formats the Android CryptoUtils.kt expects:
 *        - private key -> PKCS#8 DER -> base64   (Java PKCS8EncodedKeySpec)
 *        - public  key -> SPKI   DER -> base64   (Java X509EncodedKeySpec)
 *   4. Build + CA-sign an X.509 certificate (SHA-256, 1-year validity).
 *
 * The private key is returned to the caller ONCE and is NEVER persisted here.
 *
 * Design ref: CREDENTIALS_AND_STORAGE_PLAN.md §3.3, CREDENTIALS_DESIGN.md Step 3/3a.
 */
const forge = require('node-forge');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// CA loading (cached after first load)
// ---------------------------------------------------------------------------
let _ca = null;

function normalizePem(pem) {
    // dotenv keeps literal "\n"; turn those into real newlines so forge can parse.
    return pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem;
}

/**
 * Load the CA in priority order:
 *   1. CA_PRIVATE_KEY_PEM / CA_CERT_PEM   (raw PEM env, prod/Render)
 *   2. CA_PRIVATE_KEY_B64 / CA_CERT_B64   (base64 of the PEM)
 *   3. ca/ca-private-key.pem / ca/ca-certificate.pem   (local dev files)
 */
function loadCA() {
    let privPem = process.env.CA_PRIVATE_KEY_PEM;
    let certPem = process.env.CA_CERT_PEM;

    if (!privPem && process.env.CA_PRIVATE_KEY_B64) {
        privPem = Buffer.from(process.env.CA_PRIVATE_KEY_B64, 'base64').toString('utf8');
    }
    if (!certPem && process.env.CA_CERT_B64) {
        certPem = Buffer.from(process.env.CA_CERT_B64, 'base64').toString('utf8');
    }

    const keyPath = path.join(__dirname, '..', 'ca', 'ca-private-key.pem');
    const certPath = path.join(__dirname, '..', 'ca', 'ca-certificate.pem');
    if (!privPem && fs.existsSync(keyPath)) privPem = fs.readFileSync(keyPath, 'utf8');
    if (!certPem && fs.existsSync(certPath)) certPem = fs.readFileSync(certPath, 'utf8');

    if (!privPem || !certPem) {
        throw new Error(
            'CA not found. Run `npm run generate-ca` locally, or set ' +
            'CA_PRIVATE_KEY_PEM / CA_CERT_PEM (or *_B64) env vars in production.'
        );
    }

    privPem = normalizePem(privPem);
    certPem = normalizePem(certPem);

    return {
        caPrivateKey: forge.pki.privateKeyFromPem(privPem),
        caCert: forge.pki.certificateFromPem(certPem),
        caCertPem: certPem
    };
}

function getCA() {
    if (!_ca) _ca = loadCA();
    return _ca;
}

/** True if the CA can be loaded — used by server.js for a boot-time check. */
function isCaAvailable() {
    try { getCA(); return true; } catch { return false; }
}

/** Return the public CA certificate PEM (for the /api/credentials/ca route). */
function getCaCertPem() {
    return getCA().caCertPem;
}

// ---------------------------------------------------------------------------
// Credential issuance
// ---------------------------------------------------------------------------

// Random, positive serial. Leading "00" keeps the ASN.1 integer positive.
function generateSerial() {
    return '00' + Date.now().toString(16) + Math.floor(Math.random() * 0xFFFFFF).toString(16);
}

/**
 * Generate a keypair + CA-signed certificate for one user.
 *
 * @param {string} ownerId  nurseId or patientId (becomes the cert CommonName)
 * @param {string} role     'nurse' | 'patient'
 * @returns {{ store: object, credentials: object }}
 *   store:       persist this in Mongo (public material only — NO private key)
 *   credentials: return this to the device ONCE (includes the private key)
 */
function issueCredential(ownerId, role) {
    const { caPrivateKey, caCert, caCertPem } = getCA();

    // 1. Fresh RSA-2048 keypair.
    const keys = forge.pki.rsa.generateKeyPair(2048);

    // 2. Export in device-readable formats.
    //    Private: wrap PKCS#1 in PKCS#8 so Java's PKCS8EncodedKeySpec accepts it.
    const pkcs8 = forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(keys.privateKey));
    const privateKeyB64 = forge.util.encode64(forge.asn1.toDer(pkcs8).getBytes());
    //    Public: publicKeyToAsn1 == SubjectPublicKeyInfo (SPKI) for X509EncodedKeySpec.
    const spki = forge.pki.publicKeyToAsn1(keys.publicKey);
    const publicKeyB64 = forge.util.encode64(forge.asn1.toDer(spki).getBytes());

    // 3. Build + CA-sign the certificate.
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = generateSerial();

    const now = new Date();
    const expiry = new Date(now);
    expiry.setFullYear(now.getFullYear() + 1);
    if (expiry.getDate() !== now.getDate()) expiry.setDate(0); // handle Feb 29 etc.
    cert.validity.notBefore = now;
    cert.validity.notAfter = expiry;

    cert.setSubject([
        { name: 'commonName', value: String(ownerId) },
        { name: 'organizationName', value: String(role) },
        { name: 'countryName', value: 'IN' }
    ]);
    cert.setIssuer(caCert.subject.attributes);
    cert.setExtensions([
        { name: 'basicConstraints', cA: false },
        { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
        { name: 'subjectKeyIdentifier' },
        {
            name: 'authorityKeyIdentifier',
            keyIdentifier: caCert.generateSubjectKeyIdentifier().getBytes()
        }
    ]);
    cert.sign(caPrivateKey, forge.md.sha256.create());
    const certPem = forge.pki.certificateToPem(cert);

    return {
        // -> MongoDB (public only, never the private key)
        store: {
            pubKeyB64: publicKeyB64,
            certPem,
            serialNumber: cert.serialNumber,
            issuedAt: now,
            expiresAt: expiry
        },
        // -> device response (private key included, ONCE)
        credentials: {
            privateKey: privateKeyB64,
            publicKey: publicKeyB64,
            certificate: certPem,
            caCertificate: caCertPem
        }
    };
}

module.exports = { issueCredential, getCaCertPem, isCaAvailable, getCA };
