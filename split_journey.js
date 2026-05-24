const fs = require("fs");
const path = require("path");

const sourceFile = path.join(__dirname, "Services/Journey.service.js");
const targetDir = path.join(__dirname, "Services/Journey");
const sourceCode = fs.readFileSync(sourceFile, "utf8");

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const commonImports = `"use strict";

const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { transactionStorage } = require("../Utils/TransactionContext");
const { performJoinSelect } = require("../CRUD/Read/ReadData");
const AppError = require("../Utils/AppError");
const { getUserByFilterDetailed } = require("./User.service");
const { journeyStatusMap, usersRoles } = require("../Utils/ListOfSeedData");
const { getVehicles } = require("./Vehicle.service");
const { currentDate, toDateOnly } = require("../Utils/CurrentDate");
`;

function getFunctionBody(funcName, followingFuncName = null, isExport = false) {
  // Determine the start string based on how it's declared
  let startStr = `const ${funcName} =`;
  let startIndex = sourceCode.indexOf(startStr);
    
  if (startIndex === -1) {
    startStr = `async function ${funcName}(`;
    startIndex = sourceCode.indexOf(startStr);
  }
    
  if (startIndex === -1 && isExport) {
    startStr = `exports.${funcName} =`;
    startIndex = sourceCode.indexOf(startStr);
  }

  if (startIndex === -1) {throw new Error(`Could not find ${funcName}`);}
    
  // Find the start of the JSDoc block or comment preceding it, if any
  let blockStartIndex = startIndex;
  const commentSearchLine = sourceCode.lastIndexOf("//", startIndex);
  if (commentSearchLine !== -1 && !sourceCode.substring(commentSearchLine, startIndex).includes("\\n\\n")) {
    // If there's a comment right above it
    blockStartIndex = commentSearchLine;
  }

  let endIndex = sourceCode.length;
  if (followingFuncName) {
    let nextStartStr = `const ${followingFuncName} =`;
    let nextIndex = sourceCode.indexOf(nextStartStr);
    if (nextIndex === -1) {nextIndex = sourceCode.indexOf(`async function ${followingFuncName}(`);}
    if (nextIndex === -1 && followingFuncName === "module.exports") {nextIndex = sourceCode.indexOf(`module.exports = {`);}
        
    if (nextIndex !== -1) {
      const nextComment = sourceCode.lastIndexOf("//", nextIndex);
      if (nextComment !== -1 && nextComment > startIndex && !sourceCode.substring(nextComment, nextIndex).includes("\\n\\n")) {
        endIndex = nextComment;
      } else {
        endIndex = nextIndex;
      }
    }
  } else {
    // Find module.exports
    const modExp = sourceCode.indexOf("module.exports = {");
    if (modExp !== -1) {endIndex = modExp;}
  }
    
  return sourceCode.substring(blockStartIndex, endIndex).trim();
}

// Extract the helper 'query'
const query = getFunctionBody("query", "createJourney");

// Extract all functions
const createJourney = getFunctionBody("createJourney", "getAllJourneys");
const getAllJourneys = getFunctionBody("getAllJourneys", "getJourneyByJourneyUniqueId");
const getJourneyByJourneyUniqueId = getFunctionBody("getJourneyByJourneyUniqueId", "updateJourney");
const updateJourney = getFunctionBody("updateJourney", "deleteJourney");
const deleteJourney = getFunctionBody("deleteJourney", "getCompletedJourneyCountsByDate");
const getCompletedJourneyCountsByDate = getFunctionBody("getCompletedJourneyCountsByDate", "getDriverRequestByRequestId");
const getDriverRequestByRequestId = getFunctionBody("getDriverRequestByRequestId", "getShipperRequestByShipperRequestId");
const getShipperRequestByShipperRequestId = getFunctionBody("getShipperRequestByShipperRequestId", "searchCompletedJourneyByUserData");
const searchCompletedJourneyByUserData = getFunctionBody("searchCompletedJourneyByUserData", "getOngoingJourney");
const getOngoingJourney = getFunctionBody("getOngoingJourney", "getAllCompletedJourneys");
const getAllCompletedJourneys = getFunctionBody("getAllCompletedJourneys", "getJourneys");
const getJourneys = getFunctionBody("getJourneys", "module.exports");

// Write journeyHelper.js
const helperContent = commonImports + "\\n\\n" + query + "\\n\\n" + getDriverRequestByRequestId + "\\n\\n" + getShipperRequestByShipperRequestId + "\\n\\n" +
  "module.exports = { query, getDriverRequestByRequestId, getShipperRequestByShipperRequestId };\\n";
fs.writeFileSync(path.join(targetDir, "journeyHelper.js"), helperContent);

const helperImport = 'const { query, getDriverRequestByRequestId, getShipperRequestByShipperRequestId } = require("./journeyHelper");\\n\\n';

// Write journeyCreate.service.js
fs.writeFileSync(path.join(targetDir, "journeyCreate.service.js"), commonImports + helperImport + createJourney + "\\n");

// Write journeyUpdate.service.js
fs.writeFileSync(path.join(targetDir, "journeyUpdate.service.js"), commonImports + helperImport + updateJourney + "\\n");

// Write journeyDelete.service.js
fs.writeFileSync(path.join(targetDir, "journeyDelete.service.js"), commonImports + helperImport + deleteJourney + "\\n");

// Write journeyRead.service.js
const readContent = commonImports + helperImport + getAllJourneys + "\\n\\n" + getJourneyByJourneyUniqueId + "\\n\\n" +
  getCompletedJourneyCountsByDate + "\\n\\n" + searchCompletedJourneyByUserData + "\\n\\n" + getOngoingJourney + "\\n\\n" +
  getAllCompletedJourneys + "\\n\\n" + getJourneys + "\\n";
fs.writeFileSync(path.join(targetDir, "journeyRead.service.js"), readContent);

// Write index.js
const indexCode = "\"use strict\";\\n\\n" +
"const journeyCreate = require(\"./journeyCreate.service\");\\n" +
"const journeyRead = require(\"./journeyRead.service\");\\n" +
"const journeyUpdate = require(\"./journeyUpdate.service\");\\n" +
"const journeyDelete = require(\"./journeyDelete.service\");\\n" +
"const journeyHelper = require(\"./journeyHelper\");\\n\\n" +
"module.exports = {\\n" +
"  createJourney: journeyCreate.createJourney,\\n" +
"  getAllJourneys: journeyRead.getAllJourneys,\\n" +
"  getJourneyByJourneyUniqueId: journeyRead.getJourneyByJourneyUniqueId,\\n" +
"  updateJourney: journeyUpdate.updateJourney,\\n" +
"  deleteJourney: journeyDelete.deleteJourney,\\n" +
"  getCompletedJourneyCountsByDate: journeyRead.getCompletedJourneyCountsByDate,\\n" +
"  searchCompletedJourneyByUserData: journeyRead.searchCompletedJourneyByUserData,\\n" +
"  getOngoingJourney: journeyRead.getOngoingJourney,\\n" +
"  getAllCompletedJourneys: journeyRead.getAllCompletedJourneys,\\n" +
"  getJourneys: journeyRead.getJourneys,\\n" +
"  getDriverRequestByRequestId: journeyHelper.getDriverRequestByRequestId,\\n" +
"  getShipperRequestByShipperRequestId: journeyHelper.getShipperRequestByShipperRequestId,\\n" +
"};\\n";

fs.writeFileSync(path.join(targetDir, "index.js"), indexCode);

console.warn("Successfully split the Journey file into modular services.");
