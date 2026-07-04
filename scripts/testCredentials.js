/**
 * Interop round-trip test for server-issued credentials — NO database required.
 *
 * Proves that what the backend hands a device is exactly what the Android
 * CryptoUtils.kt can consume. Node's `crypto` parses the same PKCS#8/SPKI DER
 * that Java's KeyFactory does, and offers the same cipher suites, so it is a
 * faithful stand-in for the device here.
 *
 * Checks:
 *   1. privateKey (b64) parses as PKCS#8 DER      -> Java PKCS8EncodedKeySpec
 *   2. publicKey  (b64) parses as SPKI  DER       -> Java X509EncodedKeySpec
 *   3. keypair matches (public derived from private == returned public)
 *   4. SHA256withRSA sign/verify round-trip       -> CryptoUtils.rsaSign/rsaVerify
 *   5. RSA/ECB/PKCS1Padding encrypt/decrypt        -> CryptoUtils.rsaEncrypt/rsaDecrypt
 *   6. certificate is CA-signed and its key == returned public key
 *   7. the Mongo `store` object persists the private key (privKeyB64) so a wiped
 *      device can re-provision at login
 *
 * Run:  npm run test:creds   (needs ca/ present — run `npm run generate-ca` first)
 */
const crypto = require('crypto');
const forge = require('node-forge');
const { issueCredential, getCA } = require('../services/credentialService');

let failures = 0;
function check(name, cond, extra) {
    if (cond) {
        console.log(`  ✅ ${name}`);
    } else {
        failures++;
        console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`);
    }
}

console.log('Interop round-trip test — issuing a test credential (nurse42)\n');

let cred;
try {
    cred = issueCredential('nurse42', 'nurse');
} catch (e) {
    console.error('FATAL: could not issue credential:', e.message);
    console.error('Did you run `npm run generate-ca` first?');
    process.exit(1);
}

const { store, credentials } = cred;
const privDer = Buffer.from(credentials.privateKey, 'base64');
const pubDer = Buffer.from(credentials.publicKey, 'base64');

// 1 + 2: the two key specs the device uses.
let privKeyObj, pubKeyObj;
try {
    privKeyObj = crypto.createPrivateKey({ key: privDer, format: 'der', type: 'pkcs8' });
    check('privateKey parses as PKCS#8 DER (PKCS8EncodedKeySpec)', true);
} catch (e) {
    check('privateKey parses as PKCS#8 DER (PKCS8EncodedKeySpec)', false, e.message);
}
try {
    pubKeyObj = crypto.createPublicKey({ key: pubDer, format: 'der', type: 'spki' });
    check('publicKey parses as SPKI DER (X509EncodedKeySpec)', true);
} catch (e) {
    check('publicKey parses as SPKI DER (X509EncodedKeySpec)', false, e.message);
}

if (privKeyObj && pubKeyObj) {
    // 3: the public key derived from the private matches the returned public key.
    const derivedPub = crypto.createPublicKey(privKeyObj)
        .export({ format: 'der', type: 'spki' }).toString('base64');
    check('keypair matches (derived public == returned public)',
        derivedPub === credentials.publicKey);

    // 4: SHA256withRSA (Java) == RSA-SHA256 (Node), PKCS#1 v1.5 signature.
    const msg = Buffer.from('challenge-84713', 'utf8');
    const sig = crypto.sign('RSA-SHA256', msg, privKeyObj);
    check('SHA256withRSA sign/verify round-trip', crypto.verify('RSA-SHA256', msg, pubKeyObj, sig));

    // 5: RSA/ECB/PKCS1Padding (Android) == RSAES-PKCS1-V1_5.
    // Node 22 refuses PKCS#1 v1.5 *private decryption* (Bleichenbacher hardening),
    // but Android's Cipher supports it — so we exercise this path via node-forge,
    // which implements PKCS#1 v1.5 identically to Java. This mirrors the NFC
    // handshake where the reader RSA-encrypts the AES session key to the peer.
    const forgePub = forge.pki.publicKeyFromPem(pubKeyObj.export({ format: 'pem', type: 'spki' }));
    const forgePriv = forge.pki.privateKeyFromPem(privKeyObj.export({ format: 'pem', type: 'pkcs1' }));
    const secret = 'aes-session-key-16';
    const ciphertext = forgePub.encrypt(secret, 'RSAES-PKCS1-V1_5');
    const decrypted = forgePriv.decrypt(ciphertext, 'RSAES-PKCS1-V1_5');
    check('RSA/ECB/PKCS1Padding encrypt/decrypt round-trip', decrypted === secret);
}

// 6: certificate is CA-signed and carries the same public key.
try {
    const { caCert } = getCA();
    const cert = forge.pki.certificateFromPem(credentials.certificate);
    const caVerified = caCert.verify(cert); // throws or returns false if not CA-signed
    check('certificate is signed by our CA', caVerified === true);

    const certPubB64 = forge.util.encode64(
        forge.asn1.toDer(forge.pki.publicKeyToAsn1(cert.publicKey)).getBytes());
    check('certificate public key == returned public key', certPubB64 === credentials.publicKey);

    const cn = cert.subject.getField('CN');
    check("certificate CommonName == ownerId ('nurse42')", cn && cn.value === 'nurse42');
} catch (e) {
    check('certificate is signed by our CA', false, e.message);
}

// 7: the store persists the private key (privKeyB64) and it matches the one
// returned to the device — this is what lets a wiped device re-provision.
check('Mongo store persists the private key (privKeyB64)',
    !!store.privKeyB64 && store.privKeyB64 === credentials.privateKey);
check('Mongo store has public material (pubKeyB64, certPem, serialNumber)',
    !!store.pubKeyB64 && !!store.certPem && !!store.serialNumber);

console.log('');
if (failures === 0) {
    console.log('ALL CHECKS PASSED ✅  — server credentials are Android-compatible.');
    process.exit(0);
} else {
    console.log(`${failures} CHECK(S) FAILED ❌`);
    process.exit(1);
}
