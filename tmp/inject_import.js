const fs = require("fs");
const path = require("path");
const root = process.cwd();

const NAME = process.argv[2];
const files = process.argv.slice(3);

for (const rel of files) {
  const abs = path.join(root, rel);
  let src = fs.readFileSync(abs, "utf8");
  if (!src.includes(NAME)) continue;
  const depth = rel.split("/").length - 1;
  const relPath = "../".repeat(depth) + "Utils/Constants";
  const lineRe = /const \{ ([^}]+) \} = require\((["'])((?:\.\.\/)+)Utils\/Constants\2\);/;
  const m = src.match(lineRe);
  if (m) {
    const names = m[1].split(",").map((s) => s.trim()).filter(Boolean);
    if (!names.includes(NAME)) {
      names.push(NAME);
      src = src.replace(m[0], m[0].replace(m[1], [...new Set(names)].join(", ")));
      fs.writeFileSync(abs, src);
    }
    continue;
  }
  const importLine = `const { ${NAME} } = require("${relPath}");`;
  const lines = src.split("\n");
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("require(")) idx = i;
  }
  if (idx === -1) lines.unshift(importLine);
  else lines.splice(idx + 1, 0, importLine);
  fs.writeFileSync(abs, lines.join("\n"));
  console.log("injected", rel);
}
