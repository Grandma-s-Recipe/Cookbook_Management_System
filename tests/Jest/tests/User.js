class User {
  constructor(id, username, password, email) { Object.assign(this, { id, username, password, email }); }
  registerUser() { this.storedUser = this.username; this.storedPass = this.password; return true; }
  setUsername(u) { this.username = u; }
  setPassword(p) { this.password = p; }
  login() {
    if (this.username === '') { return false; }
    if (this.password.length < 8) { return false; }
    return this.username === this.storedUser && this.password === this.storedPass;
  }
}
module.exports = User;
