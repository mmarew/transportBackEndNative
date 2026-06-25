const assert = {
  Eq(actual, expected, msg) {
    if (actual !== expected) {
      throw new Error(msg || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  },
  NotEq(actual, expected, msg) {
    if (actual === expected) {
      throw new Error(msg || `Expected !== ${JSON.stringify(expected)}, but got the same value`);
    }
  },
  Truthy(value, msg) {
    if (!value) {
      throw new Error(msg || `Expected truthy, got ${JSON.stringify(value)}`);
    }
  },
  Falsy(value, msg) {
    if (value) {
      throw new Error(msg || `Expected falsy, got ${JSON.stringify(value)}`);
    }
  },
  Exists(value, msg) {
    if (value === null || value === undefined) {
      throw new Error(msg || `Expected value to exist, got ${value}`);
    }
  },
  StatusCode(res, expected, msg) {
    const code = res?.status || res?.statusCode;
    if (code !== expected) {
      throw new Error(msg || `Expected status ${expected}, got ${code}`);
    }
  },
  DeepEq(actual, expected, msg) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a !== b) {
      throw new Error(msg || `Objects differ.\nActual:   ${a}\nExpected: ${b}`);
    }
  },
  Rejects(fn, msg) {
    return fn().then(
      () => { throw new Error(msg || "Expected function to reject, but it resolved"); },
      () => {},
    );
  },
};

module.exports = { assert };
