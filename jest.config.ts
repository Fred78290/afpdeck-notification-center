/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */

export default {
    transform: {
        '^.+\\.ts?$': 'ts-jest',
    },
    clearMocks: true,
    collectCoverage: true,
    coverageDirectory: 'coverage',
    coverageProvider: 'v8',
	testEnvironment: 'node',
	preset: 'ts-jest',
    testMatch: ['**/tests/unit/*.test.ts'],
	transformIgnorePatterns: ['/dist/.+\\.js'],
	verbose: true
};
