const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, 'Routes');
const endpointsDir = path.join(routesDir, 'EndPoints');

// 1. Rename *.utils.js to *.endpoints.js
if (fs.existsSync(endpointsDir)) {
  const endpointFiles = fs.readdirSync(endpointsDir);
  endpointFiles.forEach(file => {
    if (file.endsWith('.utils.js')) {
      const newFileName = file.replace('.utils.js', '.endpoints.js');
      fs.renameSync(
        path.join(endpointsDir, file),
        path.join(endpointsDir, newFileName)
      );
      console.log(`Renamed ${file} to ${newFileName}`);
    }
  });
}

// 2. Update all imports in Routes directory
const routeFiles = fs.readdirSync(routesDir);

routeFiles.forEach(file => {
  if (file.endsWith('.routes.js')) {
    const filePath = path.join(routesDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace require("./utils/something.utils") with require("./EndPoints/something.endpoints")
    const updatedContent = content.replace(
      /require\(["']\.\/utils\/(.+?)\.utils["']\)/g,
      'require("./EndPoints/$1.endpoints")'
    );
    
    if (content !== updatedContent) {
      fs.writeFileSync(filePath, updatedContent);
      console.log(`Updated ${file}`);
    }
  }
});

// 3. Update Auth routes
const authDir = path.join(routesDir, 'auth');
if (fs.existsSync(authDir)) {
  const authFiles = fs.readdirSync(authDir);
  authFiles.forEach(file => {
    if (file.endsWith('.routes.js')) {
      const filePath = path.join(authDir, file);
      let content = fs.readFileSync(filePath, 'utf8');
      
      // Replace require("../utils/something.utils") with require("../EndPoints/something.endpoints")
      const updatedContent = content.replace(
        /require\(["']\.\.\/utils\/(.+?)\.utils["']\)/g,
        'require("../EndPoints/$1.endpoints")'
      );
      
      if (content !== updatedContent) {
        fs.writeFileSync(filePath, updatedContent);
        console.log(`Updated auth/${file}`);
      }
    }
  });
}

console.log('✅ Refactoring complete!');
