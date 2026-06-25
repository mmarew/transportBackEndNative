const killPort = require("kill-port");
const logger = require("./Utils/logger");
const Config = require("./Utils/Config");
// Use your app's port. 3000 is just an example.
const port = Config.PORT;

killPort(port, "tcp")
  .then(() => {
    // Now, require your main application file
    require("./App.js"); // Change this to your main file (e.g., app.js, index.js)
    return true;
  })
  .catch((err) => {
    logger.warn("Error killing port, continuing anyway", { port, error: err.message, stack: err.stack });
    require("./App.js");
  });
