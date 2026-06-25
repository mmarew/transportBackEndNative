const core = require("./ReadData.core");
const shipper = require("./ReadData.shipper");
const driver = require("./ReadData.driver");
const matching = require("./ReadData.matching");
const utils = require("./ReadData.utils");

module.exports = {
  ...core,
  ...shipper,
  ...driver,
  ...matching,
  ...utils
};
