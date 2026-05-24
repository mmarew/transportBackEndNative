const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generator = require('@babel/generator').default;

const targetDir = path.resolve(__dirname, 'Services/RoleDocumentRequirements');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const srcFile = path.resolve(__dirname, 'Services/RoleDocumentRequirements.service.js');
const code = fs.readFileSync(srcFile, 'utf8');
const ast = parser.parse(code, { sourceType: 'module' });

let imports = [];
let functions = {};

traverse(ast, {
  VariableDeclaration(path) {
    if (path.parent.type === 'Program') {
      const isRequire = path.node.declarations.some(d => 
        d.init && d.init.type === 'CallExpression' && d.init.callee.name === 'require'
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
  FunctionDeclaration(path) {
    if (path.parent.type === 'Program') {
      if (path.node.id && path.node.id.name) {
        functions[path.node.id.name] = generator(path.node).code;
      }
    }
  }
});

const functionMap = {
  'create.service.js': ['createMapping'],
  'read.service.js': ['getRoleDocumentRequirements'],
  'update.service.js': ['updateMapping'],
  'delete.service.js': ['deleteMapping'],
  'requirements.service.js': ['driversDocumentVehicleRequirement', 'entityDocumentRequirement']
};

for (const [newFile, funcNames] of Object.entries(functionMap)) {
  let fileContent = `"use strict";\n\n`;
  fileContent += imports.join('\n') + '\n\n';
  
  funcNames.forEach(f => {
    if (functions[f]) {
      fileContent += functions[f] + '\n\n';
    } else {
      console.warn("Function not found: " + f);
    }
  });

  fileContent += `module.exports = {\n  ${funcNames.join(',\n  ')}\n};\n`;
  fs.writeFileSync(path.join(targetDir, newFile), fileContent);
}

// Update barrel file index.js
const indexContent = `"use strict";\n
const createService = require("./create.service");
const readService = require("./read.service");
const updateService = require("./update.service");
const deleteService = require("./delete.service");
const requirementsService = require("./requirements.service");

module.exports = {
  ...createService,
  ...readService,
  ...updateService,
  ...deleteService,
  ...requirementsService
};
`;
fs.writeFileSync(path.join(targetDir, 'index.js'), indexContent);

console.log("Successfully extracted RoleDocumentRequirements service modules using AST.");
