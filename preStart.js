const killPort = require("kill-port");
// Use your app's port. 3000 is just an example.
const port = process.env.PORT || 3000;

killPort(port, "tcp")
  .then(() => {
    console.log(`Port ${port} successfully freed. Starting your app...`);
    // Now, require your main application file
    require("./App.js"); // Change this to your main file (e.g., app.js, index.js)
  })
  .catch((err) => {
    console.error(`Could not free port ${port}:`, err.message);
    console.log("Attempting to start the app anyway...");
    require("./App.js");
  });
