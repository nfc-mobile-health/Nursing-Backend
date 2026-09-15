const crypto = require('crypto');

/**
 * Validates that a PIN is a string of at least 4 characters/digits.
 *
 * @param {any} pin
 * @returns {boolean}
 */
function isValidPin(pin) {
    return typeof pin === 'string' && pin.trim().length >= 4;
}

/**
 * Stores the PIN as-is in plain text without hashing.
 *
 * @param {string} pin
 * @returns {string} Plaintext trimmed PIN
 */
function hashPin(pin) {
    if (!isValidPin(pin)) {
        throw new Error('PIN must be a string of at least 4 digits/characters');
    }
    return pin.trim();
}

/**
 * Verifies a candidate PIN against a stored PIN.
 * Compares directly as plain text. Also supports legacy 'salt:hash' scrypt format.
 *
 * @param {string} pin
 * @param {string} storedPin
 * @returns {boolean}
 */
function verifyPin(pin, storedPin) {
    if (!pin || !storedPin || typeof pin !== 'string' || typeof storedPin !== 'string') {
        return false;
    }
    const cleanPin = pin.trim();
    const cleanStored = storedPin.trim();

    // Direct plain text comparison
    if (cleanPin === cleanStored) {
        return true;
    }

    // Backward compatibility with legacy 'salt:hash' format if already present in DB
    const parts = cleanStored.split(':');
    if (parts.length === 2) {
        const [salt, originalHash] = parts;
        try {
            const candidateHash = crypto.scryptSync(cleanPin, salt, 64).toString('hex');
            const origBuf = Buffer.from(originalHash, 'hex');
            const candBuf = Buffer.from(candidateHash, 'hex');
            if (origBuf.length === candBuf.length && crypto.timingSafeEqual(origBuf, candBuf)) {
                return true;
            }
        } catch (_) {}
    }

    return false;
}

module.exports = {
    isValidPin,
    hashPin,
    verifyPin
};
