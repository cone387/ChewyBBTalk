const preset = require('jest-expo/jest-preset');
module.exports = {
  preset: 'jest-expo',
  testTimeout: 20000,
  testMatch: ['<rootDir>/integration/**/*.integration.tsx'],
  transformIgnorePatterns: preset.transformIgnorePatterns.map(pattern => pattern.replace('|react-native|', '|immer|redux|reselect|react-redux|@reduxjs/toolkit|react-native|')),
};
