const os = require("os");

const getLocalIpAddress = () => {
  const networkInterfaces = os.networkInterfaces();

  for (const interfaceName in networkInterfaces) {
    const addresses = networkInterfaces[interfaceName];

    for (const address of addresses) {
      if (address.family === "IPv4" && !address.internal) {
        return address.address; // Return the first external IPv4 address
      }
    }
  }

  return "Unable to determine IP address";
};

const ipAddress = getLocalIpAddress();
console.log("Your IP Address:", ipAddress);
module.exports = getLocalIpAddress;
