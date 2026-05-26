const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, 'Routes');

// 1. Update all imports in Routes directory
const routeFiles = fs.readdirSync(routesDir);

routeFiles.forEach(file => {
  if (file.endsWith('.routes.js')) {
    const filePath = path.join(routesDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace require("./utils/something.utils") with require("./EndPoints/something.utils")
    const updatedContent = content.replace(
      /require\(["']\.\/utils\/(.+?\.utils)["']\)/g,
      'require("./EndPoints/$1")'
    );
    
    if (content !== updatedContent) {
      try {
        fs.writeFileSync(filePath, updatedContent);
        console.log(`Updated ${file}`);
      } catch(e) {
        console.error(`Failed to update ${file}: ${e.message}`);
      }
    }
  }
});

// 2. Update Auth routes
const authDir = path.join(routesDir, 'auth');
if (fs.existsSync(authDir)) {
  const authFiles = fs.readdirSync(authDir);
  authFiles.forEach(file => {
    if (file.endsWith('.routes.js')) {
      const filePath = path.join(authDir, file);
      let content = fs.readFileSync(filePath, 'utf8');
      
      // Replace require("../utils/something.utils") with require("../EndPoints/something.utils")
      const updatedContent = content.replace(
        /require\(["']\.\.\/utils\/(.+?\.utils)["']\)/g,
        'require("../EndPoints/$1")'
      );
      
      if (content !== updatedContent) {
        try {
          fs.writeFileSync(filePath, updatedContent);
          console.log(`Updated auth/${file}`);
        } catch(e) {
          console.error(`Failed to update auth/${file}: ${e.message}`);
        }
      }
    }
  });
}

console.log('✅ Refactoring complete!');
