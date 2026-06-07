// make crud of delinquency and test workflow of delinquency

const { default: axios } = require("axios");
const {
  backendURL,
  usersData,
  listOfDelinquencyTypes,
} = require("../constants");

//get delinquency data from delinquency types
const url = "/api/admin/userDelinquency/";
const testGetDelinquency = async ({ user }) => {
  try {
    const token = user?.token;
    if (!token) {
      return { message: "error", error: "token not found" };
    }
    const result = await axios.get(backendURL + url, {
      headers: { Authorization: "Bearer " + token },
    });
    console.log(
      "🚀 ~ testGetDelinquency ~ result.data.data:",
      result.data.data,
    );
    return result.data.data;
  } catch (error) {
    console.log("🚀 ~ testGetDelinquency ~ error:", error);
  }
};
const testCreateDelinquency = async ({ user }) => {
  try {
    const userDriver = usersData.driver.accountData;
    const delinquencyType = listOfDelinquencyTypes.data?.[0];
    console.log(
      "🚀 ~ testCreateDelinquency ~ userDriver:",
      userDriver.userData.userUniqueId,
    );
    const payload = {
      userUniqueId: userDriver.userData.userUniqueId, // "16ea3d2f-a100-4659-8f4b-1f247d55225a",
      delinquencyTypeUniqueId: delinquencyType?.delinquencyTypeUniqueId, // "0e9776c9-f18d-4cc4-afea-0378ff5182f8",
      delinquencyDescription: "user has made some mistakes mistakes",
      // "journeyDecisionUniqueId": "16287c18-2711-4850-8c00-c05346641369",
      roleId: 2,
    };
    const token = user?.token;
    if (!token) {
      return { message: "error", error: "token not found" };
    }
    const result = await axios.post(backendURL + url, payload, {
      headers: { Authorization: "Bearer " + token },
    });
    console.log(
      "🚀 ~ testCreateDelinquency ~ result.data.data:",
      result.data.data,
    );
    return result.data.data;
  } catch (error) {
    console.log("🚀 ~ testCreateDelinquency ~ error:", error);
  }
};

const testUpdateDelinquency = async ({ user }) => {
  try {
    const token = user?.token;
    if (!token) {
      return { message: "error", error: "token not found" };
    }
    const delinquencyType = listOfDelinquencyTypes.data?.[0];
    const userDelinquencyUniqueId = delinquencyType.userDelinquencyUniqueId;

    const result = await axios.put(backendURL + url + userDelinquencyUniqueId, {
      headers: { Authorization: "Bearer " + token },
    });
    console.log(
      "🚀 ~ testUpdateDelinquency ~ result.data.data:",
      result.data.data,
    );
    return result.data.data;
  } catch (error) {
    console.log("🚀 ~ testUpdateDelinquency ~ error:", error);
  }
};

const testDeleteDelinquency = async ({ user }) => {
  try {
    const token = user?.token;
    if (!token) {
      return { message: "error", error: "token not found" };
    }
    const delinquencyType = listOfDelinquencyTypes.data?.[0];
    const userDelinquencyUniqueId = delinquencyType?.userDelinquencyUniqueId;
    const result = await axios.delete(
      backendURL + url + userDelinquencyUniqueId,
      {
        headers: { Authorization: "Bearer " + token },
      },
    );
    console.log(
      "🚀 ~ testDeleteDelinquency ~ result.data.data:",
      result.data.data,
    );
    return result.data.data;
  } catch (error) {
    console.log("🚀 ~ testDeleteDelinquency ~ error:", error);
  }
};

const testDelinquencyWorkflow = async ({ user = usersData.driver }) => {
  let delinquencyList = await testGetDelinquency({ user });
  console.log(
    "🚀 ~ testDelinquencyWorkflow ~ delinquencyList.data.data initially :",
    delinquencyList?.data?.data,
  );
  const delinquency = await testCreateDelinquency({ user });

  delinquencyList = await testGetDelinquency({ user });
  console.log(
    "🚀 ~ testDelinquencyWorkflow ~ delinquencyList.data.data after creating :",
    delinquencyList?.data?.data,
  );
  const updatedDelinquency = await testUpdateDelinquency({ user });

  delinquencyList = await testGetDelinquency({ user });
  console.log(
    "🚀 ~ testDelinquencyWorkflow ~ delinquencyList.data.data after update :",
    delinquencyList?.data?.data,
  );
  const deletedDelinquency = await testDeleteDelinquency({ user });

  delinquencyList = await testGetDelinquency({ user });
  console.log(
    "🚀 ~ testDelinquencyWorkflow ~ delinquencyList.data.data after delete :",
    delinquencyList?.data?.data,
  );
  return {
    delinquencyList,
    delinquency,
    updatedDelinquency,
    deletedDelinquency,
  };
};
module.exports = {
  testDelinquencyWorkflow,
  testGetDelinquency,
  testCreateDelinquency,
  testUpdateDelinquency,
  testDeleteDelinquency,
};
