/**
 * ESLint Configuration (Flat Config Format for ESLint 9.x)
 * Industry Standard Setup for Node.js Backend with MySQL
 */

const js = require("@eslint/js");
const nodePlugin = require("eslint-plugin-n").default;
const promisePlugin = require("eslint-plugin-promise");
const securityPlugin = require("eslint-plugin-security");
const eslintConfigPrettier = require("eslint-config-prettier");

module.exports = [
  // 1. Core Recommended Rules
  js.configs.recommended,

  // 2. Plugins Recommended Rules
  promisePlugin.configs["flat/recommended"],
  securityPlugin.configs.recommended,
  nodePlugin.configs["flat/recommended"],

  // 3. Global Ignores
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
      "scratch/**", // Ignore temp scripts
      // One-time refactor/migration scripts
      "refactor_endpoints.js",
      "refactor_routes_batch2.js",
      "refactor_routes_batch3.js",
      "industry_refactor.js",
      "fix_lint.js",
      "fix_requires.js",
      "split_company_bid.js",
    ],
  },

  // 4. Base JS rules and globals
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
      
      // Node.js specific rules
      "no-buffer-constructor": "error", // Use Buffer.from() instead
      "n/no-process-exit": "off", // Handled manually below
      "no-unused-expressions": "error",

      // Async/await patterns (important for database operations)
      "require-await": "off", // Disabled - many async functions are used for consistency even without await
      "no-return-await": "off", // Disabled - return await can be intentional for proper error stack traces

      // Code quality rules
      "max-lines": ["warn", { max: 500, skipBlankLines: true, skipComments: true }],
      
      // Security overrides if needed
      "security/detect-object-injection": "off", // Sometimes noisy in legacy backends
      "security/detect-non-literal-fs-filename": "warn"
    },
  },
  
  // 5. Database-specific configuration
  {
    files: [
      "**/Database/**/*.js",
      "**/database/**/*.js",
      "**/CRUD/**/*.js",
      "**/Middleware/Database.config.js",
      "**/Services/**/*.service.js",
    ],
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }], // No console in database layer
      "no-unused-vars": [
        "error",
        {
          varsIgnorePattern: "^(pool|connection|transaction|conn)$",
          argsIgnorePattern: "^(err|error|result|rows|fields|conn|connection)$",
        },
      ],
    },
  },

  // 6. Test files configuration
  {
    files: ["**/*.test.js", "**/tests/**/*.js"],
    rules: {
      "no-console": "off",
      "max-lines-per-function": "off",
      complexity: "off",
      "max-params": "off",
      "require-await": "off",
      "no-return-await": "off",
      "n/no-unpublished-require": "off",
      "n/no-extraneous-require": "off",
      "n/hashbang": "off"
    },
  },

  // 7. Configuration files
  {
    files: [
      "*.config.js",
      "ecosystem.config.js",
      "jest.config.js",
      "eslint.config.js",
    ],
    rules: {
      "no-magic-numbers": "off",
      "max-lines-per-function": "off",
      "n/no-unpublished-require": "off",
    },
  },

  // 7.5 Disable node unsupported features globally (since async_hooks is fine in modern Node)
  {
    rules: {
      "n/no-unsupported-features/node-builtins": "off"
    }
  },

  // 8. Seed scripts and error handlers
  {
    files: [
      "seed*.js",
      "**/ProcessErrorHandlers.js",
      "**/Worker.config.js",
      "App.js",
    ],
    rules: {
      "n/no-process-exit": "off",
      "require-await": "off",
      "max-lines-per-function": "off",
      complexity: "off",
    },
  },

  // 9. Prettier Config (MUST BE LAST)
  // This turns off all formatting-related rules in ESLint so Prettier can handle them
  eslintConfigPrettier,
];
