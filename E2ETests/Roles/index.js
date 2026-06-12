const { default: axios } = require("axios");
const { listOfRoles, usersData, backendURL } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/admin/roles";

//get list of roles
const testGetRoles = async () => {
  const token = usersData?.admin?.token;
  if (!token) throw new Error("admin token not found");

  const result = await axios.get(backendURL + BASE_URL, authConfig(token));
  listOfRoles.data = result?.data?.data;
  console.log("✅ Roles fetched:", result.data.data?.length ?? 0);
  return result.data.data;
};

const testCreateRoles = async () => {
  const token = usersData?.admin?.token;
  if (!token) throw new Error("admin token not found");

  const payload = {
    roleName: "TestRole" + Date.now(),
    roleDescription: "A temporary role for testing",
  };

  const result = await axios.post(backendURL + BASE_URL, payload, authConfig(token));
  console.log("✅ Role created:", result.data.data?.roleUniqueId);
  return result.data.data;
};

const testUpdateRoles = async (roleUniqueId) => {
  const token = usersData?.admin?.token;
  if (!token) throw new Error("admin token not found");

  const payload = {
    roleName: "UpdatedTestRole",
    roleDescription: "Updated description",
  };

  const result = await axios.put(`${backendURL}${BASE_URL}/${roleUniqueId}`, payload, authConfig(token));
  console.log("✅ Role updated:", roleUniqueId);
  return result.data.data;
};

const testDeleteRoles = async (roleUniqueId) => {
  const token = usersData?.admin?.token;
  if (!token) throw new Error("admin token not found");

  const result = await axios.delete(`${backendURL}${BASE_URL}/${roleUniqueId}`, authConfig(token));
  console.log("✅ Role deleted:", roleUniqueId);
  return result.data.data;
};

const testRolesWorkFlows = async () => {
  console.log("\n── Roles Workflow ──");
  await testGetRoles();
  const createdRole = await testCreateRoles();
  
  if (createdRole && createdRole.roleUniqueId) {
    await testUpdateRoles(createdRole.roleUniqueId);
    await testDeleteRoles(createdRole.roleUniqueId);
  }
  await testGetRoles();
  console.log("── Roles Workflow complete ──\n");
};

module.exports = {
  testRolesWorkFlows,
  testCreateRoles,
  testDeleteRoles,
  testUpdateRoles,
  testGetRoles,
};
