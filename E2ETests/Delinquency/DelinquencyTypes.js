// make crud and test workflow of delinquency types

const { default: axios } = require("axios");
const { backendURL, usersData } = require("../constants");

// get delinquency types.
const testGetDelinquencyTypes = async () => {
  const token = usersData?.admin?.token;
  console.log("🚀 ~ testGetDelinquencyTypes ~ token:", token);
  if (!token) {
    return { message: "error", error: "token not found" };
  }
  const resultOfTypes = await axios.get(
    backendURL + "/api/admin/delinquency-types",
    {
      headers: { Authorization: "Bearer " + token },
    },
  );
  return resultOfTypes.data.data;
};
module.exports = { testGetDelinquencyTypes };
