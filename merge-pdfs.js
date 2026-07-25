const { PDFDocument } = require("pdf-lib");
const fs = require("fs");
const path = require("path");

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png"]);

async function embedImage(doc, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const bytes = fs.readFileSync(filePath);
  let img;
  if (ext === ".png") {
    img = await doc.embedPng(bytes);
  } else {
    img = await doc.embedJpg(bytes);
  }
  const { width, height } = img.scale(1);
  const page = doc.addPage([width, height]);
  page.drawImage(img, { x: 0, y: 0, width, height });
}

async function mergeFiles(inputPaths, outputPath) {
  const merged = await PDFDocument.create();

  for (const filePath of inputPaths) {
    const ext = path.extname(filePath).toLowerCase();
    const base = path.basename(filePath);

    if (ext === ".pdf") {
      const bytes = fs.readFileSync(filePath);
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const indices = doc.getPageIndices();
      const copied = await merged.copyPages(doc, indices);
      copied.forEach((page) => merged.addPage(page));
      console.log(`  ✓ ${base} (${indices.length} pages)`);
    } else if (IMAGE_EXTS.has(ext)) {
      await embedImage(merged, filePath);
      console.log(`  ✓ ${base} (image)`);
    } else {
      console.warn(`  ⚠ Skipping unsupported file: ${base}`);
    }
  }

  const mergedBytes = await merged.save();
  fs.writeFileSync(outputPath, mergedBytes);
  console.log(`\n✅ Merged PDF saved to: ${outputPath}`);
}

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log("Usage: node merge-pdfs.js <output.pdf> <input1.pdf> [input2.pdf ...]");
  process.exit(1);
}

const [output, ...inputs] = args;

for (const f of inputs) {
  if (!fs.existsSync(f)) {
    console.error(`File not found: ${f}`);
    process.exit(1);
  }
}

console.log(`Merging ${inputs.length} PDF(s)...`);
mergeFiles(inputs, output).catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});