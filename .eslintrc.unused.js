const fs = require("fs");
const base = JSON.parse(fs.readFileSync("./.eslintrc.json", "utf8"));
module.exports = {
  ...base,
  plugins: [...(base.plugins || []), "unused-imports"],
  rules: {
    ...base.rules,
    "no-unused-vars": "off",
    "unused-imports/no-unused-imports": "error",
    "unused-imports/no-unused-vars": "off"
  }
};
