const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

jest.setTimeout(60000);

const logger = require("../Utils/logger");
logger.silent = true;
logger.transports.forEach((t) => {
  t.silent = true;
});
