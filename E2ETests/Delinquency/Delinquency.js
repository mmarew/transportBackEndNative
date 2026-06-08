// make crud of delinquency and test workflow of delinquency

const { default: axios } = require("axios");
const {
  backendURL,
  usersData,
  listOfDelinquencyTypes,
} = require("../constants");
const delinquencies = { data: null };

//get delinquency data from delinquency types
const url = "/api/admin/userDelinquency/";
const testGetDelinquency = async ({ user=usersData.driver }) => {
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
    delinquencies.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetDelinquency:", error.response?.data?.error || error.message);
    throw error;
  }
};
const testCreateDelinquency = async ({ user = usersData.admin, delinquencyTypeIndex = 0, skipDuplicateCheck = false }) => {
  try {
    const userDriver = usersData.driver.accountData;
    const delinquencyType = listOfDelinquencyTypes.data?.[delinquencyTypeIndex];
    console.log(
      "🚀 ~ testCreateDelinquency ~ userDriver:",
      userDriver.userData.userUniqueId,
    );
    const payload = {
      userUniqueId: userDriver.userData.userUniqueId,
      delinquencyTypeUniqueId: delinquencyType?.delinquencyTypeUniqueId,
      delinquencyDescription: "user has made some mistakes mistakes",
      roleId: 2,
      skipDuplicateCheck, // Allow bypassing duplicate check for E2E tests
    };
    const token = user?.token;
    if (!token) {
      return { message: "error", error: "token not found" };
    }
    const result = await axios.post(backendURL + url, payload, {
      headers: { Authorization: "Bearer " + token },
    });
    console.log(
      "✅ testCreateDelinquency success:",
      result.data.userDelinquencyUniqueId,
    );
    return result.data;
  } catch (error) {
    console.error("❌ testCreateDelinquency:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testUpdateDelinquency = async ({ user = usersData.driver }) => {
  try {
    const token = user?.token;
    if (!token) throw new Error("token not found");

    const delinquency = delinquencies.data?.[0];
    const userDelinquencyUniqueId = delinquency?.userDelinquencyUniqueId;
    if (!userDelinquencyUniqueId) throw new Error("No delinquency ID found to update");

    const payload = {
      delinquencyDescription: "Updated description — additional context provided.",
    };

    const result = await axios.put(
      backendURL + url + userDelinquencyUniqueId,
      payload,
      { headers: { Authorization: "Bearer " + token } },
    );
    console.log("✅ Delinquency updated:", result.data.data);
    return result.data.data;
  } catch (error) {
    console.error("❌ testUpdateDelinquency:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testDeleteDelinquency = async ({ user }) => {
  try {
    const token = user?.token;
    if (!token) {
      return { message: "error", error: "token not found" };
    }
    const delinquency = delinquencies.data?.[0];
    console.log(
      "🚀 ~ testDeleteDelinquency ~ listOfDelinquencyTypes.data:",
      listOfDelinquencyTypes.data?.[0],
    );
    const userDelinquencyUniqueId = delinquency?.userDelinquencyUniqueId;
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
    console.error("❌ testDeleteDelinquency:", error.response?.data?.error || error.message);
    throw error;
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
    delinquencyList?.data,
  );
  const updatedDelinquency = await testUpdateDelinquency({ user });

  delinquencyList = await testGetDelinquency({ user });
  console.log(
    "🚀 ~ testDelinquencyWorkflow ~ delinquencyList.data.data after update :",
    delinquencyList,
  );
  const deletedDelinquency = await testDeleteDelinquency({ user });

  delinquencyList = await testGetDelinquency({ user });
  console.log(
    "🚀 ~ testDelinquencyWorkflow ~ delinquencyList.data.data after delete :",
    delinquencyList?.data,
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
