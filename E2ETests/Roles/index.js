const { default: axios } = require("axios");
const { listOfRoles, usersData, backendURL } = require("../constants");

//get list of roles
const testGetRoles = async () => {
  const token = usersData?.admin?.token;
  if (!token) {
    return { message: "error", error: "token not found" };
  }
  const resultOfTypes = await axios.get(backendURL + "/api/admin/roles", {
    headers: { Authorization: "Bearer " + token },
  });

  listOfRoles.data = resultOfTypes?.data?.data;

  return resultOfTypes.data.data;
};
module.exports = {
  testGetRoles,
};
