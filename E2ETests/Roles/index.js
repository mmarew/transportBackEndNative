const { default: axios } = require("axios");
const { listOfRoles, usersData, backendURL } = require("../constants");

//get list of roles
const testGetRoles = async () => {
  const token = usersData?.admin?.token;
  console.log("🚀 ~ testGetRoles ~ token:", token);
  if (!token) {
    return { message: "error", error: "token not found" };
  }
  const resultOfTypes = await axios.get(backendURL + "/api/admin/roles", {
    headers: { Authorization: "Bearer " + token },
  });
  console.log(
    "🚀 ~ testGetDelinquencyTypes ~ resultOfTypes.data.data:",
    resultOfTypes.data.data,
  );
  listOfRoles.data = resultOfTypes.data.data;
  console.log("🚀 ~ testGetRoles ~ listOfRoles.data:", listOfRoles.data);

  return resultOfTypes.data.data;
};
module.exports = {
  testGetRoles,
};
