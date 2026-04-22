// jest.config.mjs
/** @type {import('jest').Config} */
const config = {
  projects: [
    {
      displayName: 'node',
      preset: 'ts-jest',
      testEnvironment: 'node',
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^server-only$': '<rootDir>/tests/__mocks__/server-only.ts',
      },
      setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
      testMatch: [
        '<rootDir>/tests/api/**/*.test.ts',
        '<rootDir>/tests/server/**/*.test.ts',
        '<rootDir>/tests/fixtures/**/*.test.ts',
        '<rootDir>/tests/lib/**/*.test.ts',
      ],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx', esModuleInterop: true } }],
        '^.+\\.js$': ['ts-jest', { tsconfig: { jsx: 'react-jsx', esModuleInterop: true } }],
      },
      transformIgnorePatterns: ['/node_modules/(?!(superjson|copy-anything|is-what)/)'],
    },
    {
      displayName: 'jsdom',
      preset: 'ts-jest',
      testEnvironment: 'jsdom',
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
      },
      setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
      testMatch: [
        '<rootDir>/tests/components/**/*.test.tsx',
        '<rootDir>/tests/lib/store-clear-email.test.tsx',
      ],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx', esModuleInterop: true } }],
        '^.+\\.js$': ['ts-jest', { tsconfig: { jsx: 'react-jsx', esModuleInterop: true } }],
      },
      transformIgnorePatterns: ['/node_modules/(?!(superjson|copy-anything|is-what)/)'],
    },
  ],
}
export default config
