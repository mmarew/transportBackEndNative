const FindDriverForPassanger = async (message) => {
  const passenger = message.user;
  const originLocation = message.originLocation;
  const destination = message.destination;

  // here i need to write sql code
  return {
    driverName: "abebe",
    phone: "0922112480",
  };
};
module.exports = FindDriverForPassanger;
