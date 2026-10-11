/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/../tsconfig.json',
        useESM: false,
      },
    ],
  },
  // Do not transform node_modules — Jest 30 handles @nestjs/* ESM packages via
  // Node v24.9+ sync-evaluate support when run with --experimental-vm-modules.
  // See: https://jestjs.io/docs/ecmascript-modules#require-of-esm
  transformIgnorePatterns: ['node_modules/'],
  moduleFileExtensions: ['js', 'json', 'ts'],
  coverageDirectory: '../coverage',
  collectCoverageFrom: ['**/*.(t|j)s'],
};
