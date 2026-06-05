// make crud of delinquency and test workflow of delinquency

const { backendURL } = require("../constants");

//get delinquency data from delinquency types
const url = "/api/admin/userDelinquency";
const testGetDelinquency = async ({ user }) => {
  const token = user?.token;
  if (!token) {
    return { message: "error", error: "token not found" };
  }
  const result = await axios.get(backendURL + url, {
    headers: { Authorization: "Bearer " + token },
  });
  console.log("🚀 ~ testGetDelinquency ~ result.data.data:", result.data.data);
  return result.data.data;
};
const testCreateDelinquency = async ({ user }) => {
  const payload = {
    userUniqueId: "16ea3d2f-a100-4659-8f4b-1f247d55225a",
    delinquencyTypeUniqueId: "0e9776c9-f18d-4cc4-afea-0378ff5182f8",
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
};

const testUpdateDelinquency = async ({ user }) => {
  const token = user?.token;
  if (!token) {
    return { message: "error", error: "token not found" };
  }
  const result = await axios.put(backendURL + url, {
    headers: { Authorization: "Bearer " + token },
  });
  console.log(
    "🚀 ~ testUpdateDelinquency ~ result.data.data:",
    result.data.data,
  );
  return result.data.data;
};

const testDeleteDelinquency = async ({ user }) => {
  const token = user?.token;
  if (!token) {
    return { message: "error", error: "token not found" };
  }
  const result = await axios.delete(backendURL + url, {
    headers: { Authorization: "Bearer " + token },
  });
  console.log(
    "🚀 ~ testDeleteDelinquency ~ result.data.data:",
    result.data.data,
  );
  return result.data.data;
};

const testDelinquencyWorkflow = async ({ user }) => {
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
