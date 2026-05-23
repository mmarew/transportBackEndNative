import os, re

files = [
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

for f in files:
    if not os.path.exists(f): continue
    with open(f, "r") as file:
        lines = file.readlines()
    
    for i in range(len(lines)):
        # Only touch imports area (first 25 lines)
        if i > 25: break
        
        for t in tokens:
            lines[i] = re.sub(r'const\s+' + t + r'\s*=\s*require\([^)]+\);\s*', '', lines[i])
            lines[i] = re.sub(r'const\s*\{\s*' + t + r'\s*\}\s*=\s*require\([^)]+\);\s*', '', lines[i])
            lines[i] = re.sub(r'([\s\{,])' + t + r'\s*,?', r'\1', lines[i])
            
        lines[i] = re.sub(r',\s*,', ',', lines[i])
        lines[i] = re.sub(r'\{\s*,', '{', lines[i])
        lines[i] = re.sub(r',\s*\}', '}', lines[i])
        lines[i] = re.sub(r'const\s*\{\s*\}\s*=\s*require\([^)]+\);\s*', '', lines[i])
        
    with open(f, "w") as file:
        file.write("".join(lines))
