const fs = require('fs');
const path = require('path');

const lintOutput = JSON.parse(fs.readFileSync(path.join(__dirname, '../tmp/lint-results.json'), 'utf8'));

// Provide mappings for common variables
const importMappings = {
  currentDate: 'Utils/CurrentDate.js',
  AppError: 'Utils/AppError.js',
  journeyStatusMap: 'Utils/ListOfSeedData.js',
  usersRolesList: 'Utils/ListOfSeedData.js',
  messageTypes: 'Utils/MessageTypes.js',
  pool: 'Middleware/Database.config.js',
  uuidv4: 'uuid',
  logger: 'Utils/logger.js',
  sendSocketIONotificationToCompany: 'Utils/Notifications.js',
  sendSocketIONotificationToDriver: 'Utils/Notifications.js',
  sendSocketIONotificationToShipper: 'Utils/Notifications.js',
  sendSocketIONotificationToAdmin: 'Utils/Notifications.js',
  sendFCMNotificationToUser: 'Utils/Notifications.js',
  
  // Helpers
  paginate: 'Services/CompanyHelper.service.js',
  paginatedQuery: 'Services/CompanyHelper.service.js',
  findOne: 'Services/CompanyHelper.service.js',
  
  // CRUD
  getData: 'CRUD/Read/ReadData.js',
  insertData: 'CRUD/Create/CreateData.js',
  updateData: 'CRUD/Update/UpdateData.js',
  deleteData: 'CRUD/Delete/DeleteData.js',
  getUserByUserUniqueId: 'CRUD/Read/ReadData.js',
  
  // Attached Documents
  getAttachedDocumentByUniqueId: 'Services/AttachedDocuments/read.service.js',

  // Canceled Journeys
  assertCompanyCancellationReason: 'Services/CanceledJourneys/cancelHelper.service.js',
  createCanceledJourney: 'Services/CanceledJourneys/cancelCreate.service.js',

  // User Balances
  prepareAndCreateNewBalance: 'Services/UserBalance.service/UserBalance.create.service.js',
  getDriverLastBalanceByUserUniqueId: 'Services/UserBalance.service/UserBalance.get.service.js',
  
  // Driver Requests
  cancelDriverRequest: 'Services/DriverRequest/cancelDriverRequest.service.js',
  releaseConflictingOffers: 'Services/DriverRequest/helpers.service.js',
  activeRequestId: 'Services/DriverRequest/helpers.service.js',
  
  // User Subscriptions
  getUserSubscriptionsWithFilters: 'Services/UserSubscription/read.service.js',
  updateUserSubscriptionByUniqueId: 'Services/UserSubscription/update.service.js',
  
  // Deposits
  getUserDeposit: 'Services/UserDeposit/read.service.js',
  fetchDepositData: 'Services/UserDeposit/read.service.js',
  createUserDeposit: 'Services/UserDeposit/create.service.js',
  getUpdateFields: 'Services/UserDeposit/update.service.js',

  // Delinquency
  getUserDelinquencies: 'Services/UserDelinquency/read.service.js',
  checkAndApplyAutomaticBan: 'Services/UserDelinquency/ban.service.js',
  
  // Commissions
  getCommissionsByCommissionUniqueId: 'Services/CommissionRates.service.js',
  
  // Others
  UPDATABLE_COLS: 'Services/ShipperRequestBatch/batchHelper.service.js',
  performJoinSelect: 'CRUD/Read/ReadData.utils.js',
};

const defaultExportMap = {
  AppError: true,
  logger: true,
  messageTypes: true,
  uuidv4: false, // const { v4: uuidv4 } = require('uuid')
};

// Map file paths to the imports they need to add
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
        // Remove .js extension for imports
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
      
      // Prevent duplicate imports
      if (!content.includes(requirePath) && !content.includes(`const ${variable}`) && !content.includes(`{ ${variable} }`)) {
        importsToAdd.push(importStatement);
      }
    }
  });

  if (importsToAdd.length > 0) {
    // Insert after "use strict"
    const lines = content.split('\\n');
    let insertIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('"use strict"') || lines[i].includes("'use strict'")) {
        insertIdx = i + 1;
        break;
      }
    }
    
    // Add imports
    lines.splice(insertIdx, 0, '', ...importsToAdd);
    fs.writeFileSync(filePath, lines.join('\\n'));
    console.log(`Updated ${path.basename(filePath)} with ${importsToAdd.length} imports`);
  }
});

console.log('Automated import fixing complete.');
