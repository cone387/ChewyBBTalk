module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.(ts|tsx)$': ['babel-jest', {
      configFile: './babel.config.js',
      // Resolve lazy imports through Jest so native module mocks also cover OTA/auth flows.
      plugins: ['@babel/plugin-transform-modules-commonjs', '@babel/plugin-transform-dynamic-import'],
    }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|react-navigation|@react-navigation/.*|@reduxjs/toolkit)',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
  coverageDirectory: 'coverage/unit',
  coverageReporters: ['text-summary', 'json-summary', 'json', 'lcov', 'html'],
};
