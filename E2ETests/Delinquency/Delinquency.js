// CRUD for UserDelinquency

const axios = require("axios");
const { backendURL, usersData, listOfDelinquencyTypes } = require("../constants");
const { getActiveDelinquencyType } = require("../Utils");
const delinquencies = { data: null };

const url = "/api/admin/userDelinquency/";

const testGetDelinquency = async ({ user = usersData.admin } = {}) => {
  try {
    const token = user?.token;
    if (!token) throw new Error("token not found");
    const result = await axios.get(backendURL + url, {
      headers: { Authorization: "Bearer " + token },
    });
    console.log("✅ Delinquencies fetched:", result.data.data?.length ?? 0);
    delinquencies.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetDelinquency:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testCreateDelinquency = async ({
  user = usersData.admin,
  delinquencyTypeIndex = 0,
  skipDuplicateCheck = false,
}) => {
  try {
    const userDriver = usersData.driver.accountData;
    // The DelinquencyTypes workflow deletes its created type, leaving the cached
    // list's first entry soft-deleted/inactive — prefer an active type from the
    // DB (source of truth), falling back to the cached list only if needed.
    const delinquencyType = listOfDelinquencyTypes.data?.[delinquencyTypeIndex];
    const token = user?.token;
    if (!token) throw new Error("token not found");
    let delinquencyTypeUniqueId = null;
    try {
      delinquencyTypeUniqueId = await getActiveDelinquencyType({ token });
    } catch {
      /* ignore */
    }
    delinquencyTypeUniqueId =
      delinquencyTypeUniqueId || delinquencyType?.delinquencyTypeUniqueId;

    const payload = {
      userUniqueId: userDriver.userData.userUniqueId,
      delinquencyTypeUniqueId,
      delinquencyDescription: "user has made some mistakes mistakes",
      roleId: 2,
      skipDuplicateCheck,
    };
    const result = await axios.post(backendURL + url, payload, {
      headers: { Authorization: "Bearer " + token },
    });
    console.log("✅ Delinquency created:", result.data.userDelinquencyUniqueId);
    return result.data;
  } catch (error) {
    console.error("❌ testCreateDelinquency:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testUpdateDelinquency = async ({ user = usersData.admin } = {}) => {
  try {
    const token = user?.token;
    if (!token) throw new Error("token not found");
    const delinquency = delinquencies.data?.[0];
    const userDelinquencyUniqueId = delinquency?.userDelinquencyUniqueId;
    if (!userDelinquencyUniqueId) throw new Error("No delinquency ID found to update");

    const result = await axios.put(
      backendURL + url + userDelinquencyUniqueId,
      { delinquencyDescription: "Updated description — additional context provided." },
      { headers: { Authorization: "Bearer " + token } },
    );
    console.log("✅ Delinquency updated:", result.data.data);
    return result.data.data;
  } catch (error) {
    console.error("❌ testUpdateDelinquency:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testDeleteDelinquency = async ({ user = usersData.admin } = {}) => {
  try {
    const token = user?.token;
    if (!token) throw new Error("token not found");
    const delinquency = delinquencies.data?.[0];
    const userDelinquencyUniqueId = delinquency?.userDelinquencyUniqueId;
    if (!userDelinquencyUniqueId) throw new Error("No delinquency ID found to delete");

    const result = await axios.delete(backendURL + url + userDelinquencyUniqueId, {
      headers: { Authorization: "Bearer " + token },
    });
    console.log("✅ Delinquency deleted:", result.data.data);
    return result.data.data;
  } catch (error) {
    console.error("❌ testDeleteDelinquency:", error.response?.data?.error || error.message);
    throw error;
  }
};

const testDelinquencyWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── Delinquency Workflow ──");
  await testGetDelinquency({ user });
  await testCreateDelinquency({ user });
  await testGetDelinquency({ user });
  await testUpdateDelinquency({ user });
  await testGetDelinquency({ user });
  await testDeleteDelinquency({ user });
  await testGetDelinquency({ user });
  console.log("── Delinquency Workflow complete ──\n");
};

module.exports = {
  testDelinquencyWorkflow,
  testGetDelinquency,
  testCreateDelinquency,
  testUpdateDelinquency,
  testDeleteDelinquency,
};
