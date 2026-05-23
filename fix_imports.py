import os

files = [
    "Services/ShipperRequestBatch/batchRead.service.js",
    "Services/ShipperRequestBatch/batchUpdate.service.js",
    "Services/ShipperRequestBatch/batchCancel.service.js",
    "Services/ShipperRequestBatch/batchCreate.service.js",
    "Services/ShipperRequestBatch/batchDelete.service.js"
]

for f in files:
    if not os.path.exists(f): continue
    with open(f, "r") as file:
        content = file.read()
    
    # Literals to remove
    content = content.replace('const AppError = require("../../Utils/AppError");\n', "")
    content = content.replace('const { currentDate } = require("../../Utils/CurrentDate");\n', "")
    content = content.replace('const { journeyStatusMap } = require("../../Utils/ListOfSeedData");\n', "")
    content = content.replace('const messageTypes = require("../../Utils/MessageTypes");\n', "")
    content = content.replace('const logger = require("../../Utils/logger");\n', "")
    
    # Handle the Notifications block which might span lines
    content = content.replace('const {\n  sendSocketIONotificationToCompany,\n  sendSocketIONotificationToDriver,\n  sendSocketIONotificationToShipper,\n} = require("../../Utils/Notifications");\n', "")
    content = content.replace('const { sendFCMNotificationToUser } = require("../Firebase.service");\n', "")
    content = content.replace('const { createCanceledJourney } = require("../CanceledJourneys.service");\n', "")
    content = content.replace('const { getData } = require("../../CRUD/Read/ReadData");\n', "")
    
    # Handle CompanyHelper
    content = content.replace('  findOne,\n', "")
    content = content.replace('  paginate,\n', "")
    content = content.replace('  paginatedQuery,\n', "")
    
    # Handle batchHelper
    content = content.replace('const { UPDATABLE_COLS, assertCompanyCancellationReason } = require("./batchHelper");\n', "")
    content = content.replace('const { UPDATABLE_COLS } = require("./batchHelper");\n', "")
    content = content.replace('const { assertCompanyCancellationReason } = require("./batchHelper");\n', "")
    
    with open(f, "w") as file:
        file.write(content)
