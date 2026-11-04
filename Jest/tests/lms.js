const { isValidPasswordLength } = require('./validators');
class LMS {
  constructor() { this.users = new Map(); }
  registerUser(u, p) { this.users.set(u, p); }
  login(u, p) { if (!isValidPasswordLength(p)) return false; return this.users.get(u) === p; }
}
module.exports = LMS;
