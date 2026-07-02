# Credential Generation — Review & Testing Guide (Phase 1)

This is the reviewer/tester companion for the server-side credential generation added to `Nursing-Backend/`. It covers **what changed**, **how to run it**, **what to check**, and the **verification already run**.

Design source: `../CREDENTIALS_AND_STORAGE_PLAN.md` (Part A) and `CREDENTIALS_DESIGN.md`.

---

## 1. What changed

| File | Change |
|------|--------|
| `package.json` | + `node-forge` dep; + scripts `generate-ca`, `test:creds` |
| `scripts/generateCA.js` | **NEW** — one-time CA bootstrap (RSA-2048 self-signed, 10-yr, `HealthSecure-CA`) |
| `services/credentialService.js` | **NEW** — pure crypto: keygen + export (PKCS#8/SPKI base64-DER) + CA-sign X.509; loads CA from env or `ca/` |
| `services/credentialStore.js` | **NEW** — DB-aware `issueOrReuse` / `forceIssue` (idempotency policy) |
| `models/Credential.js` | **NEW** — Mongo schema, **public material only** (no private key field) |
| `routes/credentials.js` | **NEW** — `GET /ca`, `GET /verify/:ownerId`, `GET /:ownerId`, `POST /revoke`, `POST /rotate` |
| `routes/nurses.js` | issue-or-reuse credential on register; response gains `credentials` |
| `routes/patients.js` | issue-or-reuse credential on register; response gains `credentials` |
| `server.js` | mounts `/api/credentials` (drops `/api/certificates`); CA-presence boot check; updated boot log |
| `models/Certificate.js`, `routes/certificates.js` | **DELETED** — placeholders superseded |
| `.gitignore` | + `ca/` (CA private key must never be committed) |
| `.env.example` | **NEW** — documents `MONGODB_URI`, `PORT`, and CA env vars for Render |
| `scripts/testCredentials.js` | **NEW** — DB-free interop round-trip test |

**Not touched:** records/reports routes, existing Nurse/Patient models (Patient keeps its `certId` field, now unused — can be renamed later).

---

## 2. Key design guarantees (what reviewers should confirm)

1. **The private key is never stored.** `Credential.js` has no private field; the DB check in §4 confirms the persisted doc. The private key appears **only** in the register/rotate HTTP response, once.
2. **Idempotent registration.** Re-registering an existing owner returns **public material only** — no new keypair, no private key. Only `POST /api/credentials/rotate` regenerates.
3. **Android wire-format.** Keys are **base64-DER**: private = PKCS#8, public = SPKI. Certificate is PEM. This matches `CryptoUtils.kt` (`PKCS8EncodedKeySpec` / `X509EncodedKeySpec` / cert factory). Proven by the interop test.
4. **CA is the crown jewel.** `ca/` is gitignored; in production the CA is injected via env vars (`CA_PRIVATE_KEY_PEM`/`CA_CERT_PEM` or `*_B64`), never committed.
5. **Registration is resilient.** If the CA is missing, user registration still succeeds; the response carries `credentials: null` + a `credentialError` string instead of failing.

---

## 3. How to run it

### 3.1 First-time setup
```bash
cd Nursing-Backend
npm install                 # pulls node-forge
npm run generate-ca         # creates ca/ca-private-key.pem + ca/ca-certificate.pem (once)
```
> Re-running `generate-ca` is a no-op — it refuses to overwrite an existing CA (regenerating would invalidate every issued cert).

### 3.2 Automated interop test (no DB needed)
```bash
npm run test:creds
```
Expected: 10 green checks ending in `ALL CHECKS PASSED ✅`.

### 3.3 Run the server
```bash
# .env must have MONGODB_URI (Atlas or local). Then:
npm run dev        # or: npm start
```
Boot log should show `🔐 CA loaded — credential issuance enabled.` and `✅ MongoDB connected`.

> Tip for local end-to-end testing without touching Atlas: run a throwaway Mongo and override the URI:
> ```bash
> mongod --dbpath /tmp/creds-mongo --port 27018 &
> MONGODB_URI="mongodb://127.0.0.1:27018/creds_test" PORT=3999 node server.js
> ```

---

## 4. Manual endpoint checks (curl)

Assuming the server is on `http://localhost:3000`:

```bash
# 1. Register a nurse — first time returns the FULL credential set (incl. privateKey)
curl -s -X POST localhost:3000/api/nurses/register \
  -H 'content-type: application/json' \
  -d '{"nurseId":"nurse42","name":"Alice","pointOfCare":"hospital"}'
#   => { success, nurse, credentials:{ privateKey, publicKey, certificate, caCertificate } }

# 2. Register the SAME nurse again — idempotent, NO privateKey
curl -s -X POST localhost:3000/api/nurses/register \
  -H 'content-type: application/json' \
  -d '{"nurseId":"nurse42","name":"Alice","pointOfCare":"hospital"}'
#   => credentials has publicKey/certificate/caCertificate but NO privateKey

# 3. Public material (never private)
curl -s localhost:3000/api/credentials/nurse42

# 4. Validity
curl -s localhost:3000/api/credentials/verify/nurse42        # => { valid:true, role:"nurse" }

# 5. CA certificate (device trust anchor)
curl -s localhost:3000/api/credentials/ca                     # => { caCertificate:"-----BEGIN CERTIFICATE-----..." }

# 6. Rotate (lost-key flow) — returns a NEW privateKey
curl -s -X POST localhost:3000/api/credentials/rotate \
  -H 'content-type: application/json' -d '{"ownerId":"nurse42"}'

# 7. Revoke, then verify shows invalid
curl -s -X POST localhost:3000/api/credentials/revoke \
  -H 'content-type: application/json' -d '{"ownerId":"nurse42","reason":"lost device"}'
curl -s localhost:3000/api/credentials/verify/nurse42        # => { valid:false, reason:"Revoked" }

# 8. Patient path (role becomes "patient" in the cert)
curl -s -X POST localhost:3000/api/patients/register \
  -H 'content-type: application/json' -d '{"patientId":"p001","name":"Bob"}'
```

### Confirm no private key in Mongo
```bash
# via mongosh (adjust db name)
mongosh "$MONGODB_URI" --eval 'db.credentials.findOne({ownerId:"nurse42"})'
# The document must contain pubKeyB64, certPem, serialNumber, issuedAt, expiresAt,
# isRevoked, role — and NO private key of any kind.
```

---

## 5. Verification already performed (2026-07-02)

Run locally against a throwaway Mongo, all green:

**`npm run test:creds` — interop (10/10):**
- privateKey parses as PKCS#8 DER (Java `PKCS8EncodedKeySpec`)
- publicKey parses as SPKI DER (Java `X509EncodedKeySpec`)
- derived public == returned public (keypair integrity)
- `SHA256withRSA` sign/verify round-trip (matches `CryptoUtils.rsaSign/rsaVerify`)
- `RSA/ECB/PKCS1Padding` encrypt/decrypt round-trip (matches `rsaEncrypt/rsaDecrypt`)
- certificate is CA-signed; cert public key == returned public key; CN == ownerId
- Mongo `store` object has no private key

**Endpoint smoke (12/12):** register (full creds) · idempotent re-register (no privateKey, same cert) · GET public (no privateKey) · verify valid · `/ca` PEM · rotate (new privateKey, different cert) · revoke → verify invalid · patient register.

**DB inspection:** persisted `credentials` doc fields = `ownerId, role, pubKeyB64, certPem, serialNumber, issuedAt, expiresAt, isRevoked, revokedAt` — **no private key**.

> Note on Node 22: the interop test performs the PKCS#1 v1.5 decrypt via node-forge because Node 22 disabled `privateDecrypt` with `RSA_PKCS1_PADDING` (a Node hardening). Android's `Cipher("RSA/ECB/PKCS1Padding")` is unaffected — this is a test-harness detail, not an interop problem.

---

## 6. Deployment note (Render)

`ca/` is gitignored and Render's filesystem is ephemeral, so **do not** rely on committing/generating `ca/` there. Instead:
1. Run `npm run generate-ca` locally once.
2. Copy the contents of `ca/ca-private-key.pem` and `ca/ca-certificate.pem` into Render env vars `CA_PRIVATE_KEY_PEM` and `CA_CERT_PEM` (multi-line secrets), or the `*_B64` base64 variants.
3. The same `ca-certificate.pem` must be bundled into both Android apps' `assets/` (Phase 3) so devices can verify peers offline.

---

## 7. Follow-ups (later phases — not in this PR)

- **Phase 2:** device stores the returned `credentials` in SQLCipher-encrypted Room (CAD: creds only; Aggregator: whole DB), key = PIN+id PBKDF2. Parse the new `credentials` field in `NurseRepository` / `PatientRepository`.
- **Phase 3:** NFC mutual auth loads `Kpri` from the encrypted store and adds a cert-exchange step (verify peer cert vs `caCertificate`), replacing the hardcoded keys. Re-bundle the new CA cert into both apps' assets.
