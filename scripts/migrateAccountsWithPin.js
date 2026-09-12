/**
 * Migration & Inspection utility for legacy accounts without a stored PIN.
 *
 * Usage:
 *   node scripts/migrateAccountsWithPin.js                    # Inspect and report count of unpinned accounts
 *   node scripts/migrateAccountsWithPin.js --set-default-pin=1234  # Optional: batch set a default PIN
 */
const mongoose = require('mongoose');
require('dotenv').config();

const Patient = require('../models/Patient');
const Nurse = require('../models/Nurse');
const { hashPin, isValidPin } = require('../services/pinAuth');

async function main() {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/nursing_reports';
    console.log(`Connecting to MongoDB at: ${mongoUri.replace(/:([^:@]+)@/, ':****@')} ...`);

    try {
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB.\n');
    } catch (err) {
        console.error('❌ Failed to connect to MongoDB:', err.message);
        process.exit(1);
    }

    // Inspect patients
    const totalPatients = await Patient.countDocuments();
    const unpinnedPatients = await Patient.find({
        $or: [{ pin: null }, { pin: { $exists: false } }, { pin: '' }]
    });

    // Inspect nurses
    const totalNurses = await Nurse.countDocuments();
    const unpinnedNurses = await Nurse.find({
        $or: [{ pin: null }, { pin: { $exists: false } }, { pin: '' }]
    });

    console.log('--- Database PIN Status ---');
    console.log(`Patients : ${totalPatients} total, ${unpinnedPatients.length} without PIN`);
    console.log(`Nurses   : ${totalNurses} total, ${unpinnedNurses.length} without PIN\n`);

    // Check if CLI specified --set-default-pin
    const pinArg = process.argv.find(arg => arg.startsWith('--set-default-pin='));
    if (pinArg) {
        const defaultPin = pinArg.split('=')[1];
        if (!isValidPin(defaultPin)) {
            console.error('❌ Error: Specified default PIN must be at least 4 digits/characters');
            await mongoose.disconnect();
            process.exit(1);
        }

        const hashed = hashPin(defaultPin);
        console.log(`Applying default PIN (${defaultPin}) to all unpinned accounts...`);

        if (unpinnedPatients.length > 0) {
            const pRes = await Patient.updateMany(
                { $or: [{ pin: null }, { pin: { $exists: false } }, { pin: '' }] },
                { $set: { pin: hashed } }
            );
            console.log(`✅ Updated ${pRes.modifiedCount} patients.`);
        }

        if (unpinnedNurses.length > 0) {
            const nRes = await Nurse.updateMany(
                { $or: [{ pin: null }, { pin: { $exists: false } }, { pin: '' }] },
                { $set: { pin: hashed } }
            );
            console.log(`✅ Updated ${nRes.modifiedCount} nurses.`);
        }

        console.log('\nMigration complete.');
    } else {
        console.log('ℹ️  No --set-default-pin argument provided.');
        console.log('ℹ️  The backend automatically supports "First-Login PIN Claiming":');
        console.log('   When legacy users log in with their PIN on the app, the backend will');
        console.log('   automatically hash and save their PIN on the fly with zero downtime.');
    }

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
}

main().catch(err => {
    console.error('Error during migration run:', err);
    process.exit(1);
});
