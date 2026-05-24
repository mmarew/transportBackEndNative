const fs = require('fs');
const path = require('path');

const lintOutput = JSON.parse(fs.readFileSync(path.join(__dirname, '../tmp/lint-results.json'), 'utf8'));

// Provide mappings for common variables
const importMappings = {
  findOne: 'Services/CompanyHelper.service.js',
  paginate: 'Services/CompanyHelper.service.js',
  paginatedQuery: 'Services/CompanyHelper.service.js',
  inProgressSlots: 'Services/ShipperRequestBatch/batchHelper.js',
  assertCompanyCancellationReason: 'Services/ShipperRequestBatch/batchHelper.js',
  UPDATABLE_COLS: 'Services/ShipperRequestBatch/batchHelper.js',
  prepareAndCreateNewBalance: 'Services/UserBalance.service/UserBalance.create.service.js',
  updateData: 'CRUD/Update/UpdateData.js',
  uuidv4: 'uuid',
  db: 'Services/CompanyHelper.service.js' // Some might need this
};

const defaultExportMap = {
  uuidv4: false
};

const filesToUpdate = new Map();

lintOutput.forEach(file => {
  const filePath = file.filePath;
  const missingVars = new Set();
  
  file.messages.forEach(msg => {
    if (msg.ruleId === 'no-undef') {
      const match = msg.message.match(/'([^']+)' is not defined/);
      if (match) missingVars.add(match[1]);
    }
  });

  if (missingVars.size > 0) {
    filesToUpdate.set(filePath, missingVars);
  }
});

filesToUpdate.forEach((missingVars, filePath) => {
  let content = fs.readFileSync(filePath, 'utf8');
  const dirName = path.dirname(filePath);
  const rootDir = path.join(__dirname, '..');
  
  const importsToAdd = [];

  missingVars.forEach(variable => {
    if (importMappings[variable]) {
      const targetPath = importMappings[variable];
      
      let requirePath;
      if (targetPath === 'uuid') {
        requirePath = 'uuid';
      } else {
        const absoluteTargetPath = path.join(rootDir, targetPath);
        requirePath = path.relative(dirName, absoluteTargetPath);
        if (!requirePath.startsWith('.')) {
          requirePath = './' + requirePath;
        }
        requirePath = requirePath.replace(/\.js$/, '');
      }

      let importStatement;
      if (variable === 'uuidv4') {
        importStatement = `const { v4: uuidv4 } = require("${requirePath}");`;
      } else if (defaultExportMap[variable]) {
        importStatement = `const ${variable} = require("${requirePath}");`;
      } else {
        importStatement = `const { ${variable} } = require("${requirePath}");`;
      }
      
      if (!content.includes(requirePath) && !content.includes(`const ${variable}`) && !content.includes(`{ ${variable} }`)) {
        importsToAdd.push(importStatement);
      }
    }
  });

  if (importsToAdd.length > 0) {
    const lines = content.split('\n');
    let insertIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('"use strict"') || lines[i].includes("'use strict'")) {
        insertIdx = i + 1;
        break;
      }
    }
    
    lines.splice(insertIdx, 0, '', ...importsToAdd);
    fs.writeFileSync(filePath, lines.join('\n'));
    console.log(`Updated ${path.basename(filePath)} with ${importsToAdd.length} imports`);
  }
});

// Also manually fix scoping bugs that aren't imports:
// Services/UserBalance.service/UserBalance.get.service.js: replace err with error
const rootDir = path.join(__dirname, '..');
const userBalanceGetPath = path.join(rootDir, 'Services/UserBalance.service/UserBalance.get.service.js');
if (fs.existsSync(userBalanceGetPath)) {
  let userBalanceContent = fs.readFileSync(userBalanceGetPath, 'utf8');
  if (userBalanceContent.includes('logger.error("Error retrieving user balance", err);')) {
    userBalanceContent = userBalanceContent.replace('logger.error("Error retrieving user balance", err);', 'logger.error("Error retrieving user balance", error);');
    fs.writeFileSync(userBalanceGetPath, userBalanceContent);
    console.log('Fixed err to error in UserBalance.get.service.js');
  }
}

// Services/UserDelinquency/ban.service.js: replace query with db().query
const userBanPath = path.join(rootDir, 'Services/UserDelinquency/ban.service.js');
if (fs.existsSync(userBanPath)) {
  let userBanContent = fs.readFileSync(userBanPath, 'utf8');
  if (userBanContent.includes('const [rows] = await query(')) {
    userBanContent = userBanContent.replace('const [rows] = await query(', 'const { db } = require("../CompanyHelper.service");\nconst [rows] = await db().query(');
    fs.writeFileSync(userBanPath, userBanContent);
    console.log('Fixed query to db().query in ban.service.js');
  }
}

// Services/UserDelinquency/create.service.js: replace query with db().query
const userDelCreatePath = path.join(rootDir, 'Services/UserDelinquency/create.service.js');
if (fs.existsSync(userDelCreatePath)) {
  let userDelCreateContent = fs.readFileSync(userDelCreatePath, 'utf8');
  if (userDelCreateContent.includes('const [result] = await query(')) {
    userDelCreateContent = userDelCreateContent.replace('const [result] = await query(', 'const { db } = require("../CompanyHelper.service");\nconst [result] = await db().query(');
    fs.writeFileSync(userDelCreatePath, userDelCreateContent);
    console.log('Fixed query to db().query in create.service.js');
  }
}

console.log('Automated import fixing phase 2 complete.');
