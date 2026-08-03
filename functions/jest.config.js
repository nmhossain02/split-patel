module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testTimeout: 20_000,
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/../src/$1',
  },
};
