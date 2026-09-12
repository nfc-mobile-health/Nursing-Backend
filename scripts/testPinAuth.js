const { hashPin, verifyPin, isValidPin } = require('../services/pinAuth');

let failures = 0;
function check(name, cond, extra) {
    if (cond) {
        console.log(`  ✅ ${name}`);
    } else {
        failures++;
        console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`);
    }
}

console.log('Testing PIN Authentication & Hashing Service\n');

// 1. Validation checks
check('Valid 4-digit PIN is accepted', isValidPin('1234'));
check('Valid 6-digit PIN is accepted', isValidPin('123456'));
check('Valid alphanumeric PIN is accepted', isValidPin('pass12'));
check('PIN with < 4 characters rejected', !isValidPin('123'));
check('Empty PIN rejected', !isValidPin(''));
check('Whitespace-only PIN rejected', !isValidPin('   '));
check('Null PIN rejected', !isValidPin(null));
check('Undefined PIN rejected', !isValidPin(undefined));
check('Number instead of string PIN rejected', !isValidPin(1234));

// 2. Hashing and verification
const pin = '4829';
const hash = hashPin(pin);
check('hashPin produces salt:hash format', typeof hash === 'string' && hash.includes(':') && hash.split(':').length === 2);

const [salt, hexHash] = hash.split(':');
check('Salt is 32 hex chars (16 bytes)', salt.length === 32);
check('Hash is 128 hex chars (64 bytes scrypt output)', hexHash.length === 128);

// 3. Verification matches
check('Correct PIN verifies successfully', verifyPin('4829', hash));
check('Correct PIN with leading/trailing whitespace verifies', verifyPin('  4829  ', hash));
check('Incorrect PIN fails verification', !verifyPin('0000', hash));
check('Partial PIN fails verification', !verifyPin('482', hash));
check('Empty PIN fails verification', !verifyPin('', hash));
check('Null PIN fails verification', !verifyPin(null, hash));
check('Null hash fails verification', !verifyPin('4829', null));
check('Corrupted hash fails verification', !verifyPin('4829', 'corrupted'));

// 4. Salting uniqueness
const hash2 = hashPin(pin);
check('Different salt generated for same PIN', hash !== hash2);
check('Both different hashes verify correctly against same PIN', verifyPin(pin, hash) && verifyPin(pin, hash2));

// 5. Legacy Account Simulation (First-Login Claim)
console.log('\nTesting Legacy Account Claim Simulation');
const legacyAccount = {
    patientId: 'P100',
    name: 'Legacy Patient',
    pin: null
};

check('Legacy account starts with no PIN', legacyAccount.pin === null);

// Login attempt 1 on legacy account: claims PIN
const userEnteredPin = '9988';
if (!legacyAccount.pin) {
    if (isValidPin(userEnteredPin)) {
        legacyAccount.pin = hashPin(userEnteredPin);
    }
}
check('Legacy account claimed PIN on first login', typeof legacyAccount.pin === 'string' && legacyAccount.pin.includes(':'));

// Login attempt 2: correct PIN verifies
check('Subsequent login with correct PIN succeeds', verifyPin('9988', legacyAccount.pin));

// Login attempt 3: incorrect PIN rejected
check('Subsequent login with incorrect PIN fails', !verifyPin('1111', legacyAccount.pin));

if (failures === 0) {
    console.log('\n🎉 ALL PIN AUTH TESTS PASSED!');
    process.exit(0);
} else {
    console.error(`\n💥 ${failures} TEST(S) FAILED!`);
    process.exit(1);
}
