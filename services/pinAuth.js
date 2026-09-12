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
 * Hashes a PIN using scrypt with a cryptographically secure random salt.
 * Returns in format 'salt:hash'.
 *
 * @param {string} pin
 * @returns {string} salt:hash
 */
function hashPin(pin) {
    if (!isValidPin(pin)) {
        throw new Error('PIN must be a string of at least 4 digits/characters');
    }
    const cleanPin = pin.trim();
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(cleanPin, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

/**
 * Verifies a candidate PIN against a stored 'salt:hash' string.
 * Uses timingSafeEqual to guard against timing analysis attacks.
 *
 * @param {string} pin
 * @param {string} storedHash
 * @returns {boolean}
 */
function verifyPin(pin, storedHash) {
    if (!pin || !storedHash || typeof pin !== 'string' || typeof storedHash !== 'string') {
        return false;
    }
    const parts = storedHash.split(':');
    if (parts.length !== 2) {
        return false;
    }
    const [salt, originalHash] = parts;
    try {
        const candidateHash = crypto.scryptSync(pin.trim(), salt, 64).toString('hex');
        const origBuf = Buffer.from(originalHash, 'hex');
        const candBuf = Buffer.from(candidateHash, 'hex');
        if (origBuf.length !== candBuf.length) {
            return false;
        }
        return crypto.timingSafeEqual(origBuf, candBuf);
    } catch (err) {
        return false;
    }
}

module.exports = {
    isValidPin,
    hashPin,
    verifyPin
};
