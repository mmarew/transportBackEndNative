const fs = require("fs");

const lintResults = JSON.parse(fs.readFileSync("lint-results.json", "utf8"));

lintResults.forEach(fileResult => {
  if (fileResult.errorCount === 0) {return;}
  const filePath = fileResult.filePath;
  if (!fs.existsSync(filePath)) {return;}
  
  let lines = fs.readFileSync(filePath, "utf8").split("\n");
  let modified = false;

  fileResult.messages.forEach(msg => {
    if (msg.ruleId === "no-unused-vars") {
      const match = msg.message.match(/'([^']+)' is assigned a value but never used/);
      if (match) {
        const varName = match[1];
        const lineIdx = msg.line - 1;
        
        let line = lines[lineIdx];
        
        if (new RegExp("const\\s+" + varName + "\\s*=\\s*require").test(line)) {
          lines[lineIdx] = "";
          modified = true;
        }
        else if (new RegExp("const\\s*\\{\\s*" + varName + "\\s*\\}\\s*=\\s*require").test(line)) {
          lines[lineIdx] = "";
          modified = true;
        }
        else {
          let oldLine = lines[lineIdx];
          lines[lineIdx] = lines[lineIdx].replace(new RegExp("\\b" + varName + "\\b\\s*,?"), "");
          lines[lineIdx] = lines[lineIdx].replace(/\{\s*,/, "{");
          lines[lineIdx] = lines[lineIdx].replace(/,\s*\}/, "}");
          lines[lineIdx] = lines[lineIdx].replace(/,\s*,/, ",");
            
          if (oldLine !== lines[lineIdx]) {modified = true;}
        }
      }
    }
  });

  if (modified) {
    let newContent = lines.join("\n");
    newContent = newContent.replace(/const\s*\{\s*\}\s*=\s*require\([^)]+\);/g, "");
    newContent = newContent.replace(/const\s*\{\s*\}\s*=\s*require[^{}]*;/g, "");
    fs.writeFileSync(filePath, newContent);
  }
});
