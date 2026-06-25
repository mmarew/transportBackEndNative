const fs = require('fs');
const path = require('path');

const postmanFile = path.join(__dirname, 'TransportHttp-RESTAPI.postman_collection.json');
const e2eDir = path.join(__dirname, 'E2ETests');

const postmanData = JSON.parse(fs.readFileSync(postmanFile, 'utf8'));

// Recursive function to extract all request URLs from Postman collection
const postmanRoutes = new Set();
const routeDetails = [];

function extractUrls(item) {
    if (item.request) {
        if (item.request.url && item.request.url.raw) {
            let url = item.request.url.raw;
            // Remove {{url}} variable
            url = url.replace('{{url}}', '');
            // Some urls might have trailing/leading slashes, standardizing it
            if (url.includes('?')) url = url.split('?')[0]; // remove query params
            
            // Convert Postman path variables like :id or {{id}} to standard :param
            url = url.replace(/{{[^}]+}}/g, ':param');
            // Remove trailing slashes
            if (url.endsWith('/')) url = url.slice(0, -1);
            
            const method = item.request.method.toUpperCase();
            const routeStr = `${method} ${url}`;
            if (!postmanRoutes.has(routeStr)) {
                postmanRoutes.add(routeStr);
                routeDetails.push({ method, url, name: item.name });
            }
        }
    } else if (item.item) {
        item.item.forEach(extractUrls);
    }
}
postmanData.item.forEach(extractUrls);

// Now extract all endpoints that are currently tested in E2ETests
// We will look for axios.get, axios.post, etc.
const testedRoutes = new Set();
function scanE2EDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            scanE2EDir(fullPath);
        } else if (file.endsWith('.js')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            // very naive extraction of axios calls
            const axiosRegex = /axios\.(get|post|put|patch|delete)\(\s*(?:`([^`]+)`|([^,]+))/gi;
            let match;
            while ((match = axiosRegex.exec(content)) !== null) {
                const method = match[1].toUpperCase();
                let urlStr = match[2] || match[3];
                // clean up string concats
                if (urlStr) {
                   testedRoutes.add(`${method} ${urlStr}`);
                }
            }
        }
    }
}
scanE2EDir(e2eDir);

// Now diff
console.log(`Found ${routeDetails.length} requests in Postman`);
const untested = [];
for (const route of routeDetails) {
    // Check if the route.url exists in any of the testedRoutes strings loosely
    let isTested = false;
    for (const tested of testedRoutes) {
        // Just checking if the path appears in the axios call
        const cleanUrl = route.url.replace(/:param/g, ''); // strip params for loose match
        if (tested.includes(cleanUrl)) {
            isTested = true;
            break;
        }
    }
    if (!isTested) {
        untested.push(`[${route.method}] ${route.url} - ${route.name}`);
    }
}

console.log(`Found ${untested.length} untested endpoints.`);
const guidePath = path.join(e2eDir, 'E2E_GUIDE.md');
const markdownContent = `\n\n## 🚀 Untested Endpoints Roadmap (Auto-Generated)\n\nThe following endpoints were found in Postman but are not yet covered by the E2E suite:\n\n\`\`\`text\n${untested.join('\\n')}\n\`\`\`\n`;
fs.appendFileSync(guidePath, markdownContent);
console.log("Successfully appended untested routes to E2E_GUIDE.md!");
