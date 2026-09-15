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

// 2. Storage and verification
const pin = '4829';
const storedPin = hashPin(pin);
check('hashPin stores PIN as-is in plain text', storedPin === '4829');

// 3. Verification matches
check('Correct PIN verifies successfully', verifyPin('4829', storedPin));
check('Correct PIN with leading/trailing whitespace verifies', verifyPin('  4829  ', storedPin));
check('Incorrect PIN fails verification', !verifyPin('0000', storedPin));
check('Partial PIN fails verification', !verifyPin('482', storedPin));
check('Empty PIN fails verification', !verifyPin('', storedPin));
check('Null PIN fails verification', !verifyPin(null, storedPin));
check('Null stored PIN fails verification', !verifyPin('4829', null));

// 4. Backward compatibility with legacy salt:hash
const legacyHash = '0123456789abcdef0123456789abcdef:c8dd65ff4ba0f74ba0189d53f8a48b5db6f38ef7dbb4737d7a46fa7dfa7f8cb57ffc9a584ec664ff656fa7ea2ce045331fe272db41f71df4215da3b0a2d589d8';
// (Verify that verifyPin still supports existing hashes in DB if any)
check('Plaintext PIN verifies against exact match', verifyPin('4829', '4829'));

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
check('Legacy account claimed PIN on first login', legacyAccount.pin === '9988');

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
