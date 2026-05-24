const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const generator = require("@babel/generator").default;

const targetDir = path.resolve(__dirname, "Services/ShipperRequestBatch/batchCancel");
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const srcFile = path.resolve(__dirname, "Services/ShipperRequestBatch/batchCancel.service.js");
const code = fs.readFileSync(srcFile, "utf8");
const ast = parser.parse(code, { sourceType: "module" });

let imports = [];
let functions = {};

traverse(ast, {
  VariableDeclaration(path) {
    if (path.parent.type === "Program") {
      const isRequire = path.node.declarations.some(d => 
        d.init && d.init.type === "CallExpression" && d.init.callee.name === "require"
      );
      if (isRequire) {
        imports.push(generator(path.node).code);
      } else {
        path.node.declarations.forEach(d => {
          if (d.id && d.id.name) {
            functions[d.id.name] = generator(path.node).code;
          }
        });
      }
    }
  },
  ExpressionStatement(path) {
    if (path.parent.type === "Program" && path.node.expression.type === "AssignmentExpression") {
      const left = path.node.expression.left;
      if (left.type === "MemberExpression" && left.object.name === "exports") {
        const funcName = left.property.name;
        // Turn `exports.funcName = async (...) => {...}` into `const funcName = async (...) => {...}`
        let funcCode = generator(path.node.expression.right).code;
        functions[funcName] = `const ${funcName} = ${funcCode};`;
      }
    }
  }
});

const functionMap = {
  "cancelBatch.service.js": ["cancelBatch"],
  "partialCancelBatch.service.js": ["partialCancelBatch"],
  "sendNotifications.service.js": ["sendBatchCancelNotifications"]
};

for (const [newFile, funcNames] of Object.entries(functionMap)) {
  let fileContent = `"use strict";\n\n`;
  fileContent += imports.join("\n") + "\n\n";
  
  funcNames.forEach(f => {
    if (functions[f]) {
      fileContent += functions[f] + "\n\n";
    } else {
      console.warn("Function not found: " + f);
    }
  });

  fileContent += `module.exports = {\n  ${funcNames.join(",\n  ")}\n};\n`;
  fs.writeFileSync(path.join(targetDir, newFile), fileContent);
}

// Update barrel file index.js
const indexContent = `"use strict";\n
const cancelBatch = require("./cancelBatch.service");
const partialCancelBatch = require("./partialCancelBatch.service");
const sendNotifications = require("./sendNotifications.service");

module.exports = {
  ...cancelBatch,
  ...partialCancelBatch,
  ...sendNotifications
};
`;
fs.writeFileSync(path.join(targetDir, "index.js"), indexContent);

console.log("Successfully extracted batchCancel service modules using AST.");
