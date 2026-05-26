const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, 'Routes');
const utilsDir = path.join(routesDir, 'utils');

if (!fs.existsSync(utilsDir)) {
  fs.mkdirSync(utilsDir);
}

const filesToRefactor = [
  "DocumentTypes.routes.js",
  "DriverRequest.routes.js",
  "Firebase.routes.js",
  "Health.routes.js",
  "Journey.routes.js",
  "JourneyDecisions.routes.js",
  "JourneyRoutePoints.routes.js",
  "JourneyStatus.routes.js",
  "Ratings.routes.js",
  "Role.routes.js"
];

const generateConstantName = (routePath, method) => {
  let name = routePath.replace(/^\/api\/(admin|user|company|vehicle|driver|shipper|dispatcher|me)\//, '');
  name = name.replace(/^\/api\//, '');
  name = name.replace(/^\//, '');
  
  // Remove params like :id
  name = name.replace(/\/:[a-zA-Z0-9_]+/g, '');
  
  // Replace slashes and hyphens with underscores
  name = name.replace(/[\/\-]/g, '_');
  
  // Convert camelCase to SNAKE_CASE
  name = name.replace(/[A-Z]/g, letter => `_${letter}`);
  
  name = name.toUpperCase();
  
  if (method) {
    name = `${method.toUpperCase()}_${name}`;
  }
  
  // Clean up double underscores
  name = name.replace(/__+/g, '_');
  name = name.replace(/^_/, '');
  name = name.replace(/_$/, '');
  
  if (!name) name = "BASE_ROUTE";
  
  return name;
};

filesToRefactor.forEach(filename => {
  const filePath = path.join(routesDir, filename);
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${filename}`);
    return;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Skip if already refactored
  if (content.includes('.utils")') || content.includes(".utils');")) {
    console.log(`Skipping ${filename}, already seems refactored.`);
    return;
  }
  
  const baseName = filename.replace('.routes.js', '');
  const objectName = baseName.replace(/[A-Z]/g, (match, offset) => (offset > 0 ? '_' : '') + match).toUpperCase() + "_ENDPOINTS";
  const utilFileName = baseName.charAt(0).toLowerCase() + baseName.slice(1) + ".utils.js";
  
  const endpoints = {};
  
  // 1. Match Router.METHOD("/path", ...)
  const routerRegex = /(?:[rR]outer|app)\.(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']/g;
  let match;
  while ((match = routerRegex.exec(content)) !== null) {
    const method = match[1];
    const routePath = match[2];
    
    // Some routes don't start with /api, we include them if they look like routes
    if (routePath.startsWith('/')) {
      let constName = generateConstantName(routePath, method);
      // Ensure unique name
      let i = 1;
      let finalConstName = constName;
      while (Object.values(endpoints).includes(finalConstName) || endpoints[finalConstName]) {
        finalConstName = `${constName}_${i}`;
        i++;
      }
      endpoints[finalConstName] = routePath;
      
      // Replace in content
      const exactMatch = `["']${routePath}["']`;
      content = content.replace(exactMatch, `${objectName}.${finalConstName}`);
    }
  }
  
  // 2. Match path: "/path" inside arrays
  const pathRegex = /path\s*:\s*["']([^"']+)["']/g;
  while ((match = pathRegex.exec(content)) !== null) {
    const routePath = match[1];
    
    // We need to guess method from context if possible, but let's just use path
    if (routePath.startsWith('/')) {
      let constName = generateConstantName(routePath);
      let i = 1;
      let finalConstName = constName;
      while (Object.values(endpoints).includes(finalConstName) || endpoints[finalConstName]) {
        finalConstName = `${constName}_${i}`;
        i++;
      }
      endpoints[finalConstName] = routePath;
      
      const exactMatch = `["']${routePath}["']`;
      content = content.replace(exactMatch, `${objectName}.${finalConstName}`);
    }
  }
  
  if (Object.keys(endpoints).length === 0) {
    console.log(`No routes found in ${filename}`);
    return;
  }
  
  // Generate utils file
  let utilsContent = `const ${objectName} = {\n`;
  for (const [key, val] of Object.entries(endpoints)) {
    utilsContent += `  ${key}: "${val}",\n`;
  }
  utilsContent += `};\n\nmodule.exports = {\n  ${objectName},\n};\n`;
  
  fs.writeFileSync(path.join(utilsDir, utilFileName), utilsContent);
  
  // Update original file with import
  const importStatement = `const { ${objectName} } = require("./utils/${utilFileName}");\n`;
  
  // Add import after the last require statement at the top
  const lastRequireIndex = content.lastIndexOf('require(');
  if (lastRequireIndex !== -1) {
    const endOfLine = content.indexOf('\n', lastRequireIndex);
    content = content.slice(0, endOfLine + 1) + importStatement + content.slice(endOfLine + 1);
  } else {
    content = importStatement + content;
  }
  
  fs.writeFileSync(filePath, content);
  console.log(`✅ Refactored ${filename}`);
});
