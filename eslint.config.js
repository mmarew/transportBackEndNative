/**
 * ESLint Configuration (Flat Config Format for ESLint 9.x)
 * Enhanced for Node.js Backend with MySQL
 */

const nodePlugin = require("eslint-plugin-n").default;

module.exports = [
  {
    ignores: [
      "node_modules/**",
      "logs/**",
      "coverage/**",
      "*.log",
      "uploads/**",
      "dist/**",
      "build/**",
      ".git/**",
      "*.min.js",
      "ecosystem.config.js",
      "vercel.json",
      "Utils/socketService.js", // ESM syntax (React Native file)
    ],
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        module: "readonly",
        require: "readonly",
        exports: "readonly",
        global: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        crypto: "readonly",
        randomUUID: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        setImmediate: "readonly",
        clearImmediate: "readonly",
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        jest: "readonly",
      },
    },
    plugins: {
      n: nodePlugin,
    },
    rules: {
      // Basic JavaScript rules
      "no-undef": "error",
      "n/no-missing-require": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-debugger": "error",
      "no-empty": ["error", { allowEmptyCatch: true }],
      eqeqeq: ["error", "always"],
      curly: ["error", "all"],
      "no-unused-vars": ["error"],
      indent: ["error", 2],
      quotes: [
        "error",
        "double",
        { avoidEscape: true, allowTemplateLiterals: true },
      ],
      semi: ["error", "always"],

      // Node.js specific rules
      "no-buffer-constructor": "error", // Use Buffer.from() instead
      "no-new-require": "error",
      "no-process-exit": "off", // Allow process.exit() in scripts and error handlers
      "no-unused-expressions": "error",

      // Async/await patterns (important for database operations)
      // Note: Some async functions may not need await (e.g., Express route handlers, event handlers)
      "require-await": "off", // Disabled - many async functions are used for consistency even without await
      "no-return-await": "off", // Disabled - return await can be intentional for proper error stack traces

      // Code quality rules (relaxed for existing codebase)
      // "complexity": ["warn", { max: 20 }], // Keep functions reasonably simple (relaxed from 15)
      // "max-depth": ["warn", { max: 6 }], // Avoid deeply nested code (relaxed from 5)
      // "max-nested-callbacks": ["warn", { max: 5 }], // Common issue with callbacks (relaxed from 4)
      // "max-lines-per-function": ["warn", { max: 200, skipBlankLines: true, skipComments: true }], // Relaxed from 150
      // "max-params": ["warn", { max: 7 }], // Limit parameters in functions (relaxed from 6)
      "max-lines": ["warn", { max: 500, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // Database-specific configuration
    files: [
      "**/Database/**/*.js",
      "**/database/**/*.js",
      "**/CRUD/**/*.js",
      "**/Middleware/Database.config.js",
      "**/Services/**/*.service.js",
    ],
    rules: {
      // More strict rules for database layer
      "no-console": ["error", { allow: ["warn", "error"] }], // No console in database layer
      // "max-lines-per-function": ["warn", { max: 150, skipBlankLines: true, skipComments: true }], // Relaxed from 100
      // "max-params": ["warn", { max: 6 }], // Limit parameters in database methods (relaxed from 5)
      // "complexity": ["warn", { max: 18 }], // Keep database functions simpler (relaxed from 12)
      // Allow common database variable names
      "no-unused-vars": [
        "error",
        {
          varsIgnorePattern: "^(pool|connection|transaction|conn)$",
          argsIgnorePattern: "^(err|error|result|rows|fields|conn|connection)$",
        },
      ],
    },
  },
  {
    // Test files configuration
    files: ["**/*.test.js", "**/tests/**/*.js"],
    rules: {
      "no-console": "off",
      "max-lines-per-function": "off",
      complexity: "off",
      "max-params": "off",
      "require-await": "off",
      "no-return-await": "off",
    },
  },
  {
    // Configuration files
    files: [
      "*.config.js",
      "ecosystem.config.js",
      "jest.config.js",
      "eslint.config.js",
    ],
    rules: {
      "no-magic-numbers": "off",
      "max-lines-per-function": "off",
    },
  },
  {
    // Seed scripts and error handlers - allow process.exit()
    files: [
      "seed*.js",
      "**/ProcessErrorHandlers.js",
      "**/Worker.config.js",
      "App.js",
    ],
    rules: {
      "no-process-exit": "off",
      "require-await": "off",
      "max-lines-per-function": "off",
      complexity: "off",
    },
  },
];
