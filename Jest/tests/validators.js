const isValidPasswordLength = (p) => p.length >= 8 && p.length <= 20;
module.exports = { isValidPasswordLength };
