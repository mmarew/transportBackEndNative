const { spawnSync } = require("child_process");
const fs = require("fs");
const r = spawnSync("npx", ["eslint", ".", "-f", "json"], { maxBuffer: 1e9 });
const results = JSON.parse(r.stdout.toString());
const buckets = {};
for (const res of results) {
  if (res.messages.length === 0) continue;
  const src = fs.readFileSync(res.filePath, "utf8").split("\n");
  for (const m of res.messages) {
    if (m.ruleId !== "no-magic-numbers") continue;
    const match = m.message.match(/No magic number: (.+)/);
    if (!match) continue;
    const v = match[1].trim();
    const lineContent = src[m.line - 1] ? src[m.line - 1].trim() : "";
    const rel = res.filePath.replace(process.cwd() + "/", "");
    (buckets[v] = buckets[v] || []).push(`${rel}:${m.line}:${m.column}  ${lineContent}`);
  }
}
const sorted = Object.entries(buckets).sort((a, b) => b[1].length - a[1].length);
for (const [v, items] of sorted) {
  console.log(`\n### ${v} (${items.length})`);
  for (const it of items.slice(0, 12)) console.log(it);
  if (items.length > 12) console.log(`... and ${items.length - 12} more`);
}
