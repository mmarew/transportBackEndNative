const fs = require("fs");
const path = require("path");
const root = process.cwd();

const DEFAULT = "PAGINATION.DEFAULT_PAGE_SIZE";
const MAX = "PAGINATION.MAX_PAGE_SIZE";

const replaces = [
  [/\|\| 10\), 100\)/g, `|| ${DEFAULT}), ${MAX})`],
  [/\|\| 10, 100\)/g, `|| ${DEFAULT}, ${MAX})`],
  [/Math\.max\(1, parseInt\(limit\)\), 100\)/g, `Math.max(1, parseInt(limit)), ${MAX})`],
  [/limit: limit \|\| 10,/g, `limit: limit || ${DEFAULT},`],
  [/limit: req\.query\.limit \? parseInt\(req\.query\.limit\) : 10,/g, `limit: req.query.limit ? parseInt(req.query.limit) : ${DEFAULT},`],
  [/limit: parseInt\(query\?\.limit\) \|\| 10,/g, `limit: parseInt(query?.limit) || ${DEFAULT},`],
  [/const limit = req\.query\.limit \|\| 10;/g, `const limit = req.query.limit || ${DEFAULT};`],
  [/const defaultLimit = Number\(filters\.defaultLimit\) \|\| 10;/g, `const defaultLimit = Number(filters.defaultLimit) || ${DEFAULT};`],
  [/limit: statusResult\?\.pagination\?\.limit \|\| 10,/g, `limit: statusResult?.pagination?.limit || ${DEFAULT},`],
  [/\.slice\(0, 10\);/g, `.slice(0, ${DEFAULT});`],
  [/for \(let i = 0; i < 10; i\+\+\)/g, `for (let i = 0; i < ${DEFAULT}; i++)`],
  [/\.max\(100\)\.default\(10\)/g, `.max(${MAX}).default(${DEFAULT})`],
  [/\.max\(100\)\.default\(100\)/g, `.max(${MAX}).default(${MAX})`],
  [/\.max\(100\)\.default\(20\)/g, `.max(${MAX}).default(PAGINATION.BATCH_DEFAULT_PAGE_SIZE)`],
];

const files = process.argv.slice(2);
const modified = [];

for (const rel of files) {
  const abs = path.join(root, rel);
  let src = fs.readFileSync(abs, "utf8");
  let changed = false;
  for (const [re, to] of replaces) {
    if (re.test(src)) {
      src = src.replace(re, to);
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(abs, src);
    modified.push(rel);
  }
}

function ensureImport(rel) {
  const abs = path.join(root, rel);
  let src = fs.readFileSync(abs, "utf8");
  if (!/PAGINATION/.test(src)) return;
  const depth = rel.split("/").length - 1;
  const relPath = "../".repeat(depth) + "Utils/Constants";
  const lineRe = /const \{ ([^}]+) \} = require\((["'])((?:\.\.\/)+)Utils\/Constants\2\);/;
  const m = src.match(lineRe);
  if (m) {
    const names = m[1].split(",").map((s) => s.trim()).filter(Boolean);
    if (names.includes("PAGINATION")) return;
    names.push("PAGINATION");
    const newLine = m[0].replace(m[1], [...new Set(names)].join(", "));
    src = src.replace(m[0], newLine);
  } else {
    const importLine = `const { PAGINATION } = require("${relPath}");`;
    const lines = src.split("\n");
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("require(")) idx = i;
    }
    if (idx === -1) {
      lines.unshift(importLine);
    } else {
      lines.splice(idx + 1, 0, importLine);
    }
    src = lines.join("\n");
  }
  fs.writeFileSync(abs, src);
}

for (const rel of modified) ensureImport(rel);
console.log("modified:", modified.length);
console.log(modified.join("\n"));
