# Nursing-Backend

Node.js/Express REST API. Handles nurse/patient registration, structured nursing visit records, and certificate metadata storage. MongoDB on Atlas. Deployed on Render.com.

## Prerequisites

- Node.js 18+
- npm
- MongoDB Atlas free cluster (or local MongoDB)

## Setup

```bash
cd Nursing-Backend
npm install

# Create the .env file
cp .env.example .env    # if it exists, otherwise create manually:
```

Create a file named `.env` in `Nursing-Backend/`:
```
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/nursing_reports
PORT=3000
```

**Getting your MongoDB URI:**
1. Go to [mongodb.com/atlas](https://www.mongodb.com/atlas) → create a free cluster
2. Click **Connect** → **Drivers** → copy the connection string
3. Replace `<password>` with your database user's password
4. In **Network Access**, add `0.0.0.0/0` to allow connections from any IP

```bash
# Start server
npm start           # node server.js — for production
npm run dev         # nodemon — auto-restarts on file changes (development)

# Verify it's working
curl http://localhost:3000/health
# → {"status":"OK","timestamp":"..."}
```

## Project Structure

```
Nursing-Backend/
├── server.js              Entry point — DB connection, route mounting, legacy /api/reports
├── models/
│   ├── Nurse.js           Mongoose schema for nurses
│   ├── Patient.js         Mongoose schema for patients (includes details[] array)
│   ├── Record.js          Mongoose schema for structured visit records
│   ├── Detail.js          Lightweight visit summary embedded in Patient.details[]
│   └── Certificate.js     Patient device cert registry (no private keys stored)
├── routes/
│   ├── nurses.js          POST /api/nurses/register, GET /api/nurses/:nurseId
│   ├── patients.js        POST /api/patients/register, GET /api/patients/:patientId
│   ├── records.js         POST /api/records, GET /api/records/:patientId[/latest]
│   └── certificates.js    POST /api/certificates, GET /api/certificates/:patientId
├── package.json
└── .env                   Not committed — contains MONGODB_URI
```

## API Reference

### Nurses

**Register a nurse** — idempotent (re-registering returns existing record)
```
POST /api/nurses/register
Content-Type: application/json

{
  "nurseId":     "NURSE_001",       // required, must be unique
  "name":        "Jane Doe",        // required
  "age":         32,                // optional
  "gender":      "Female",          // optional
  "pointOfCare": "hospital",        // required — enum: homecare | first_responder | ambulance | hospital
  "contactNo":   "9876543210"       // optional
}

→ { "success": true, "message": "Nurse registered", "nurse": { ... } }
```

**Get nurse by ID**
```
GET /api/nurses/:nurseId

→ { "success": true, "nurse": { "nurseId": "NURSE_001", "name": "Jane Doe", ... } }
```

### Patients

**Register a patient** — idempotent
```
POST /api/patients/register
Content-Type: application/json

{
  "patientId": "1712490000000",   // required — timestamp string generated on device
  "name":      "John Doe",        // required
  "age":       45,                // optional
  "gender":    "Male",            // optional
  "bloodType": "O+",              // optional
  "contactNo": "9123456789"       // optional
}

→ { "success": true, "message": "Patient registered", "patient": { ... } }
```

**Get patient with visit history**
```
GET /api/patients/:patientId

→ {
    "success": true,
    "patient": {
      "patientId": "1712490000000",
      "name": "John Doe",
      "details": [                      ← populated Detail documents, newest first
        {
          "nurseId": "NURSE_001",
          "bp": "120/80",
          "hr": 72,
          "temp": 98.6,
          "recordId": "..."             ← ref to full Record document
        }
      ],
      "certId": null
    }
  }
```

### Records

**Submit a structured nursing visit record**  
Called by `SyncRepository.syncLatestRecord()` in the Aggregator after parsing the received `.txt` file.  
Automatically creates a `Detail` summary and appends it to `Patient.details[]`.

```
POST /api/records
Content-Type: application/json

{
  "patientId": "1712490000000",   // required
  "nurseId":   "NURSE_001",       // required
  "date":      "2026-04-07",      // required — yyyy-MM-dd
  "time":      "14:30",           // optional — HH:mm
  "bp":        "120/80",          // optional — blood pressure
  "hr":        72,                // optional — heart rate (bpm)
  "rr":        16,                // optional — respiratory rate (breaths/min)
  "temp":      98.6,              // optional — body temperature (°F)
  "obs":       "Patient stable",  // optional — observations/description
  "med":       "Paracetamol 500mg" // optional — medication
}

→ { "success": true, "message": "Record saved", "recordId": "..." }
```

**Get all records for a patient** (newest first)
```
GET /api/records/:patientId

→ { "success": true, "count": 2, "records": [ { ... }, { ... } ] }
```

**Get latest record for a patient**
```
GET /api/records/:patientId/latest

→ { "success": true, "record": { "bp": "120/80", "hr": 72, ... } }
```

### Certificates

Stores certificate metadata only. Private keys are **never** sent here — they stay on the device.  
`certId` is the serial number issued by `tca-server`.

```
POST /api/certificates
Content-Type: application/json

{
  "certId":    "abc123serial",     // required — from TCA server
  "patientId": "1712490000000",    // required
  "pubKey":    "<base64 DER>",     // required — device's RSA public key
  "issuedAt":  "2026-04-07T00:00:00Z",
  "expiresAt": "2027-04-07T00:00:00Z"
}

→ { "success": true, "certificate": { ... } }
```

```
GET /api/certificates/:patientId

→ { "success": true, "certificate": { "certId": "...", "pubKey": "...", "isRevoked": false } }
```

### Legacy

**Raw file sync** — kept for backward compatibility with older Aggregator builds
```
POST /api/reports
Content-Type: application/json

{
  "deviceId":   "android_id",
  "date":       "2026-04-07",
  "fileName":   "medical_data_John_Doe.txt",
  "content":    "<full file text as string>",
  "receivedAt": "2026-04-07T14:30:00Z"
}
```

### Health Check
```
GET /health → { "status": "OK", "timestamp": "..." }
```

## MongoDB Schemas

```
Nurse:        nurseId (unique), name, age, gender, pointOfCare, contactNo, timestamps
Patient:      patientId (unique), name, age, gender, bloodType, contactNo, details[], certId, timestamps
Record:       patientId, nurseId, date, time, bp, hr, rr, temp, obs, med, timestamps
Detail:       patientId, nurseId, bp, hr, temp, recordId (→ Record), timestamps
Certificate:  certId (unique), patientId, pubKey, issuedAt, expiresAt, isRevoked, timestamps
```

## Testing the API

```bash
# Register nurse
curl -X POST http://localhost:3000/api/nurses/register \
  -H "Content-Type: application/json" \
  -d '{"nurseId":"NURSE_001","name":"Jane Doe","pointOfCare":"hospital"}'

# Register patient
curl -X POST http://localhost:3000/api/patients/register \
  -H "Content-Type: application/json" \
  -d '{"patientId":"1712490000000","name":"John Doe","age":45,"gender":"Male","bloodType":"O+"}'

# Submit record
curl -X POST http://localhost:3000/api/records \
  -H "Content-Type: application/json" \
  -d '{"patientId":"1712490000000","nurseId":"NURSE_001","date":"2026-04-07","bp":"120/80","hr":72,"rr":16,"temp":98.6}'

# Get patient with visit history
curl http://localhost:3000/api/patients/1712490000000
```

## Deployment (Render.com)

Production URL: `https://nursing-backend-vp5o.onrender.com`

**Render settings:**
- Build command: `npm install`
- Start command: `node server.js`
- Environment variable: add `MONGODB_URI` in Render's dashboard

**Free tier note:** Render spins down inactive instances after ~15 minutes. The first request after inactivity takes 30–60 seconds (cold start). The Aggregator's `SyncCloudActivity` detects this as `WAKING_UP` status and tells the user to wait.

## Common Issues

| Error | Cause | Fix |
|-------|-------|-----|
| `MongoServerError: Authentication failed` | Wrong credentials in `MONGODB_URI` | Check username/password in Atlas → Database Access |
| `ECONNREFUSED` | Server not running | Run `node server.js` |
| `Network timeout` from Aggregator | Render cold start | Wait 60s, Aggregator will show "Server is starting up" |
| Duplicate records on re-sync | Re-uploading same file | Expected for now — deduplication not yet implemented |
