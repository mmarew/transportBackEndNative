import os

files = [
    "Services/Journey/journeyCreate.service.js",
    "Services/Journey/journeyDelete.service.js",
    "Services/Journey/journeyRead.service.js",
    "Services/Journey/journeyUpdate.service.js"
]

tokens = [
  "uuidv4", "transactionStorage", "performJoinSelect", "getUserByFilterDetailed", 
  "usersRoles", "getVehicles", "currentDate", "toDateOnly", "getDriverRequestByRequestId", 
  "getShipperRequestByShipperRequestId", "createJourney", "getCompletedJourneyCountsByDate", 
  "getAllJourneys", "getJourneyByJourneyUniqueId", "searchCompletedJourneyByUserData", 
  "getOngoingJourney", "getAllCompletedJourneys", "getJourneys", "journeyStatusMap", "updateJourney"
]

import re
for f in files:
    if not os.path.exists(f): continue
    with open(f, "r") as file:
        content = file.read()
    
    for t in tokens:
        content = re.sub(r'const\s+' + t + r'\s*=\s*require\([^)]+\);\s*', '', content)
        content = re.sub(r'const\s*\{\s*' + t + r'\s*\}\s*=\s*require\([^)]+\);\s*', '', content)
        # remove token from inside multi-line destructuring
        content = re.sub(r'([\s\{,])' + t + r'\s*,?', r'\1', content)
        content = re.sub(r'([\s\{,])' + t + r'\s*,?', r'\1', content)
        
    content = re.sub(r',\s*,', ',', content)
    content = re.sub(r'\{\s*,', '{', content)
    content = re.sub(r',\s*\}', '}', content)
    content = re.sub(r'const\s*\{\s*\}\s*=\s*require\([^)]+\);\s*', '', content)
    
    with open(f, "w") as file:
        file.write(content)
