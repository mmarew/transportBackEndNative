const fs = require('fs');
const path = require('path');

const endPointsDir = path.join(__dirname, 'Routes', 'EndPoints');
const e2eDir = path.join(__dirname, 'E2ETests');

// 1. Extract all endpoints from Routes/EndPoints
const allEndpoints = [];

const endpointFiles = fs.readdirSync(endPointsDir).filter(f => f.endsWith('.js'));
for (const file of endpointFiles) {
  const content = fs.readFileSync(path.join(endPointsDir, file), 'utf8');
  // Simple regex to find string values that look like routes
  const routeRegex = /['"\`](\/[a-zA-Z0-9\-\_\/\:]+)['"\`]/g;
  let match;
  while ((match = routeRegex.exec(content)) !== null) {
    if (match[1].length > 1) { // ignore just '/'
      allEndpoints.push(match[1]);
    }
  }
}

const uniqueEndpoints = [...new Set(allEndpoints)].sort();

// 2. Extract all strings from E2ETests that look like endpoints
const testedEndpoints = new Set();
function scanDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      scanDir(fullPath);
    } else if (file.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const routeRegex = /['"\`](\/[a-zA-Z0-9\-\_\/\:]+)['"\`]/g;
      let match;
      while ((match = routeRegex.exec(content)) !== null) {
         testedEndpoints.add(match[1]);
      }
    }
  }
}
scanDir(e2eDir);

// 3. Compare
const missing = [];
for (const ep of uniqueEndpoints) {
  if (!testedEndpoints.has(ep)) {
    // try to check if a dynamic route matches
    // This is a naive check but helps.
    let found = false;
    for (const testEp of testedEndpoints) {
        if (testEp.includes(ep) || ep.includes(testEp)) {
            found = true; break;
        }
    }
    if (!found) {
        missing.push(ep);
    }
  }
}

console.log("Total unique route strings found in EndPoints:", uniqueEndpoints.length);
console.log("Missing or unchecked routes in E2ETests:");
missing.forEach(m => console.log(m));
