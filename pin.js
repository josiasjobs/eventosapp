// PIN format: exactly 4 digits. Kept free of DB imports so tests can load it.
function isValidPin(pin) {
  return typeof pin === 'string' && /^\d{4}$/.test(pin);
}

module.exports = { isValidPin };
