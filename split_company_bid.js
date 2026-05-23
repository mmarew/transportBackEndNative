const fs = require("fs");
const path = require("path");

const sourceFile = path.join(__dirname, "Services/CompanyBid.service.js");
const targetDir = path.join(__dirname, "Services/CompanyBid");
const sourceCode = fs.readFileSync(sourceFile, "utf8");

const commonImports = `"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../../Utils/CurrentDate");
const AppError = require("../../Utils/AppError");
const {
  db,
  findOne,
  paginate,
  paginatedQuery,
} = require("../CompanyHelper.service");
const logger = require("../../Utils/logger");
const {
  reportCompanyCommissionEvasion,
} = require("../CommissionEvasion.service");
const { sendFCMNotificationToUser } = require("../Firebase.service");
const { sendSocketIONotificationToCompany } = require("../../Utils/Notifications");
const messageTypes = require("../../Utils/MessageTypes");
const { journeyStatusMap, usersRoles } = require("../../Utils/ListOfSeedData");`;

function getFunctionBody(funcName, followingFuncName = null) {
  let startStr = `exports.${funcName} =`;
  let startIndex = sourceCode.indexOf(startStr);
    
  if (startIndex === -1) {throw new Error(`Could not find ${funcName}`);}
    
  let blockStartIndex = startIndex;
  const commentSearchLine = sourceCode.lastIndexOf("/**", startIndex);
  const regularCommentSearchLine = sourceCode.lastIndexOf("//", startIndex);
    
  // Check if there is a JSDoc comment or a regular comment right above the function
  if (commentSearchLine !== -1 && !sourceCode.substring(commentSearchLine, startIndex).includes("exports.")) {
    blockStartIndex = commentSearchLine;
  } else if (regularCommentSearchLine !== -1 && !sourceCode.substring(regularCommentSearchLine, startIndex).includes("exports.")) {
    // Find the start of the contiguous regular comments block
    let currentLineStart = regularCommentSearchLine;
    while (currentLineStart > 0) {
      let prevCommentLine = sourceCode.lastIndexOf("//", currentLineStart - 1);
      if (prevCommentLine !== -1 && !sourceCode.substring(prevCommentLine, currentLineStart).includes("\n\n")) {
        currentLineStart = prevCommentLine;
      } else {
        break;
      }
    }
    blockStartIndex = currentLineStart;
  }

  let endIndex = sourceCode.length;
  if (followingFuncName) {
    let nextStartStr = `exports.${followingFuncName} =`;
    let nextIndex = sourceCode.indexOf(nextStartStr);
        
    if (nextIndex !== -1) {
      const nextDocComment = sourceCode.lastIndexOf("/**", nextIndex);
      const nextRegComment = sourceCode.lastIndexOf("//", nextIndex);
            
      let bestComment = -1;
            
      if (nextDocComment > startIndex && !sourceCode.substring(nextDocComment, nextIndex).includes("exports.")) {
        bestComment = nextDocComment;
      } 
            
      if (nextRegComment > startIndex && !sourceCode.substring(nextRegComment, nextIndex).includes("exports.")) {
        // trace back contiguous regular comments
        let currentLineStart = nextRegComment;
        while (currentLineStart > startIndex) {
          let prevCommentLine = sourceCode.lastIndexOf("//", currentLineStart - 1);
          if (prevCommentLine > startIndex && !sourceCode.substring(prevCommentLine, currentLineStart).includes("\\n\\n")) {
            currentLineStart = prevCommentLine;
          } else {
            break;
          }
        }
                
        if (bestComment === -1 || currentLineStart < bestComment) {
          bestComment = currentLineStart;
        }
      }
            
      if (bestComment !== -1) {
        endIndex = bestComment;
      } else {
        endIndex = nextIndex;
      }
    }
  }
    
  // Also strip "exports." and make it "const"
  let content = sourceCode.substring(blockStartIndex, endIndex).trim();
  content = content.replace(`exports.${funcName} =`, `const ${funcName} =`);
  return content;
}

// Extract all functions
const submitBid = getFunctionBody("submitBid", "getAvailableRequests");
const getAvailableRequests = getFunctionBody("getAvailableRequests", "getGroupedBids");
const getGroupedBids = getFunctionBody("getGroupedBids", "getBidsSummary");
const getBidsSummary = getFunctionBody("getBidsSummary", "getBids");
const getBids = getFunctionBody("getBids", "updateBidStatus");
const updateBidStatus = getFunctionBody("updateBidStatus", "deleteBid");
const deleteBid = getFunctionBody("deleteBid", "markCancellationAsSeen");
const markCancellationAsSeen = getFunctionBody("markCancellationAsSeen");

// Define a common export template generator
const makeFile = (name, content, exportsArray) => {
  const exportLine = `\nmodule.exports = {\n  ${exportsArray.join(",\\n  ")}\n};\n`;
  fs.writeFileSync(path.join(targetDir, name), commonImports + "\n\n" + content + exportLine);
};

// Create the modular files
makeFile("bidCreate.service.js", submitBid, ["submitBid"]);

makeFile("bidRead.service.js", 
  [getAvailableRequests, getGroupedBids, getBidsSummary, getBids].join("\n\n"), 
  ["getAvailableRequests", "getGroupedBids", "getBidsSummary", "getBids"]
);

makeFile("bidUpdate.service.js", 
  [updateBidStatus, markCancellationAsSeen].join("\n\n"), 
  ["updateBidStatus", "markCancellationAsSeen"]
);

makeFile("bidDelete.service.js", deleteBid, ["deleteBid"]);

// Write index.js (the barrel)
const indexCode = `"use strict";

const bidCreate = require("./bidCreate.service");
const bidRead = require("./bidRead.service");
const bidUpdate = require("./bidUpdate.service");
const bidDelete = require("./bidDelete.service");

module.exports = {
  ...bidCreate,
  ...bidRead,
  ...bidUpdate,
  ...bidDelete,
};
`;

fs.writeFileSync(path.join(targetDir, "index.js"), indexCode);

console.log("Successfully split the CompanyBid service.");
