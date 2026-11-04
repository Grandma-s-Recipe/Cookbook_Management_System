const LMS = require('./lms');
const { isValidPasswordLength } = require('./validators');

describe('LMS login: password length', () => {
  let lms;
  beforeEach(() => {
    lms = new LMS();
    lms.registerUser('student01', 'Pass123!');
  });
  afterEach(() => { lms = null; });

  test('password too short fails', () => {
    expect(lms.login('student01', 'abc')).toBe(false);
  });
  test('password of valid length succeeds', () => {
    expect(lms.login('student01', 'Pass123!')).toBe(true);
  });
  test('password too long fails', () => {
    const longPassword = 'a'.repeat(25);
    expect(lms.login('student01', longPassword)).toBe(false);
  });
});

test.each([
  ['just below min (7)',  'a'.repeat(7),  false],
  ['at min (8)',          'a'.repeat(8),  true],
  ['at max (20)',         'a'.repeat(20), true],
  ['just above max (21)', 'a'.repeat(21), false],
])('password length %s', (label, password, expected) => {
  expect(isValidPasswordLength(password)).toBe(expected);
});
