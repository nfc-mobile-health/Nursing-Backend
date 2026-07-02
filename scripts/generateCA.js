/**
 * One-time CA bootstrap for the HealthSecure credential system.
 *
 * Generates a fresh self-signed Certifying Authority (CA):
 *   - ca/ca-private-key.pem   SECRET. Never commit, never leave the server.
 *   - ca/ca-certificate.pem   Public. Shipped to devices (assets) and returned in
 *                             the registration response as `caCertificate`.
 *
 * Run once:   npm run generate-ca
 *
 * WARNING: Regenerating the CA invalidates EVERY certificate ever issued by the
 * old CA. If you regenerate, you must re-bundle the new ca-certificate.pem into
 * both Android apps' assets/ and every device must re-register. The guard below
 * refuses to overwrite an existing CA so this cannot happen by accident.
 *
 * Design ref: CREDENTIALS_AND_STORAGE_PLAN.md §3.6, CREDENTIALS_DESIGN.md Step 1.
 */
const forge = require('node-forge');
const fs = require('fs');
const path = require('path');

const caDir = path.join(__dirname, '..', 'ca');
const keyPath = path.join(caDir, 'ca-private-key.pem');
const certPath = path.join(caDir, 'ca-certificate.pem');

if (!fs.existsSync(caDir)) {
    fs.mkdirSync(caDir);
}

// Never overwrite an existing CA by accident.
if (fs.existsSync(keyPath)) {
    console.log('CA already exists at ca/ca-private-key.pem.');
    console.log('Delete the ca/ folder manually only if you intend to regenerate.');
    console.log('WARNING: Regenerating the CA invalidates ALL issued certificates.');
    process.exit(0);
}

console.log('Generating CA key pair (2048-bit RSA)... this takes a few seconds.\n');

const caKeys = forge.pki.rsa.generateKeyPair(2048);
const caCert = forge.pki.createCertificate();

caCert.publicKey = caKeys.publicKey;
caCert.serialNumber = '01';

caCert.validity.notBefore = new Date();
caCert.validity.notAfter = new Date();
caCert.validity.notAfter.setFullYear(caCert.validity.notBefore.getFullYear() + 10);

// Self-signed: subject == issuer.
const caAttrs = [
    { name: 'commonName', value: 'HealthSecure-CA' },
    { name: 'organizationName', value: 'DTU Research' },
    { name: 'countryName', value: 'IN' }
];
caCert.setSubject(caAttrs);
caCert.setIssuer(caAttrs);

caCert.setExtensions([
    { name: 'basicConstraints', cA: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true },
    { name: 'subjectKeyIdentifier' }
]);

// A CA is self-signed with its own private key.
caCert.sign(caKeys.privateKey, forge.md.sha256.create());

fs.writeFileSync(keyPath, forge.pki.privateKeyToPem(caKeys.privateKey));
fs.writeFileSync(certPath, forge.pki.certificateToPem(caCert));

console.log('CA generated successfully.\n');
console.log('Files created:');
console.log('  ca/ca-private-key.pem  <- SECRET. gitignored. Never commit / never share.');
console.log('  ca/ca-certificate.pem  <- Public. Copy into BOTH apps\' assets/.\n');
console.log('Next steps:');
console.log('  1. Copy ca/ca-certificate.pem -> NursingDevice/app/src/main/assets/tca-certificate.pem (replace)');
console.log('  2. Copy ca/ca-certificate.pem -> Aggregator/app/src/main/assets/     (add, new file)');
console.log('  3. On Render, provide the CA via secret env vars (see .env.example): CA_PRIVATE_KEY_PEM / CA_CERT_PEM\n');
console.log('=== ca-certificate.pem (public — safe to copy) ===\n');
console.log(forge.pki.certificateToPem(caCert));
console.log('==================================================');
