const User = require('./User');

describe('User login', () => {
  let user;

  beforeEach(() => {        // Arrange
    user = new User(1, 'john_doe',
      'SecurePass123!', 'john@example.com');
    user.registerUser();
  });

  afterEach(() => {
    user = null;  // reset shared state
  });

  // Test 1: correct credentials -> succeed
  test('accepts correct credentials', () => {
    // Act + Assert
    expect(user.login()).toBe(true);
  });

  // Test 2: wrong password -> fail
  test('rejects a wrong password', () => {
    // Arrange
    user.setPassword('WrongPassword!');
    // Act + Assert
    expect(user.login()).toBe(false);
  });

  // Correct credentials -> expect true
  test('black-box: valid login succeeds', () => {
    user.setUsername('john_doe');
    user.setPassword('SecurePass123!');
    expect(user.login()).toBe(true);
  });
  test('white-box: empty username fails', () => {
    user.setUsername('');
    expect(user.login()).toBe(false);
  });
  test('white-box: short password fails', () => {
    user.setPassword('abc');
    expect(user.login()).toBe(false);
  });
});
