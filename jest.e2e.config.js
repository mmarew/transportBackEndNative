module.exports = {
  testEnvironment: "node",
  setupFiles: ["<rootDir>/tests/setup.js"],
  setupFilesAfterEnv: ["<rootDir>/tests/setupAfterEnv.js"],
  testMatch: ["**/__tests__/e2e/**/*.e2e.test.js"],
  verbose: true,
  forceExit: true,
  // Sequential execution is critical — E2E phases depend on shared state
  maxWorkers: 1,
  // E2E tests need generous timeout (DB reset + full flow takes minutes)
  testTimeout: 120_000,
};
