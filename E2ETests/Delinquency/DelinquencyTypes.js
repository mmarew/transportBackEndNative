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
  console.log(
    "🚀 ~ testGetDelinquencyTypes ~ resultOfTypes.data.data:",
    resultOfTypes.data.data,
  );
  return resultOfTypes.data.data;
};
const testCreateDelinquencyTypes = async () => {};
const testDeleteDelinquencyTypes = async () => {
  const token = usersData?.admin?.token;
  console.log("🚀 ~ testDeleteDelinquencyTypes ~ token:", token);
  if (!token) {
    return { message: "error", error: "token not found" };
  }
  const resultOfTypes = await axios.delete(
    backendURL + "/api/admin/delinquency-types",
    {
      headers: { Authorization: "Bearer " + token },
    },
  );
  console.log(
    "🚀 ~ testDeleteDelinquencyTypes ~ resultOfTypes.data.data:",
    resultOfTypes.data.data,
  );
  return resultOfTypes.data.data;
};
const testUpdateDelinquencyTypes = async () => {};
module.exports = {
  testGetDelinquencyTypes,
  testCreateDelinquencyTypes,
  testDeleteDelinquencyTypes,
  testUpdateDelinquencyTypes,
};
