// make crud and test workflow of delinquency types

const { default: axios } = require("axios");
const {
  backendURL,
  usersData,
  listOfDelinquencyTypes,
  listOfRoles,
} = require("../constants");

//check existance of delinquency type in the list before creating it
const checkExistanceOfDelinquenyIninTheList = () => {
  const delinquencyTypeData = {
    delinquencyTypeName: "wrong behavior arrival",
    applicableRoles: listOfRoles.data?.[1].roleUniqueId,
    delinquencyTypeDescription: "when drivers late extrimlly",
  };
  listOfDelinquencyTypes.data.forEach((item) => {
    if (item.delinquencyTypeName === delinquencyTypeData.delinquencyTypeName) {
      return true;
    }
  });
  return false;
};
// get delinquency types.
const testGetDelinquencyTypes = async () => {
  const token = usersData?.admin?.token;
  if (!token) {
    return { message: "error", error: "token not found" };
  }
  const resultOfTypes = await axios.get(
    backendURL + "/api/admin/delinquency-types",
    {
      headers: { Authorization: "Bearer " + token },
    },
  );
  listOfDelinquencyTypes.data = resultOfTypes.data.data;
  return resultOfTypes.data.data;
};
const testCreateDelinquencyTypes = async () => {
  const token = usersData?.admin?.token;
  if (!token) {
    return { message: "error", error: "token not found" };
  }
  if (checkExistanceOfDelinquenyIninTheList()) {
    return { message: "error", error: "delinquency type already exists" };
  }
  const delinquencyTypeData = {
    delinquencyTypeName: "wrong behavior arrival",
    applicableRoles: listOfRoles.data?.[1].roleUniqueId,
    delinquencyTypeDescription: "when drivers late extrimlly",
  };
  const resultOfTypes = await axios.post(
    backendURL + "/api/admin/delinquency-types",
    delinquencyTypeData,
    {
      headers: { Authorization: "Bearer " + token },
    },
  );
  return resultOfTypes.data.data;
};

const testUpdateDelinquencyTypes = async () => {
  try {
    const delinquencyTypeData = {
      delinquencyTypeName: "wrong behavior arrival",
      applicableRoles: listOfRoles.data?.[1].roleUniqueId,
      delinquencyTypeDescription: "when drivers late extrimlly",
    };
    const delinquencyTypeUniqueId =
      listOfDelinquencyTypes.data?.[0]?.delinquencyTypeUniqueId;
    const token = usersData?.admin?.token;
    if (!token) {
      return { message: "error", error: "token not found" };
    }
    const resultOfTypes = await axios.put(
      backendURL + "/api/admin/delinquency-types/" + delinquencyTypeUniqueId,
      delinquencyTypeData,
      {
        headers: { Authorization: "Bearer " + token },
      },
    );
    return resultOfTypes.data.data;
  } catch (error) {}
};
const testDeleteDelinquencyTypes = async () => {
  try {
    // delinquencyTypeUniqueId
    const token = usersData?.admin?.token;
    if (!token) {
      return { message: "error", error: "token not found" };
    }
    const delinquencyTypeUniqueId =
      listOfDelinquencyTypes?.data?.[0]?.delinquencyTypeUniqueId;
    const resultOfTypes = await axios.delete(
      backendURL + "/api/admin/delinquency-types/" + delinquencyTypeUniqueId,
      {
        headers: { Authorization: "Bearer " + token },
      },
    );
    return resultOfTypes.data.data;
  } catch (error) {
    // sss
  }
};
const testDelinquencyTypesWorkflows = async () => {
  listOfDelinquencyTypes.data = await testGetDelinquencyTypes();
  //create one delinquency type
  const createOneType = await testCreateDelinquencyTypes();
  if (!createOneType) {
    return { message: "error", error: "createOneType failed" };
  }
  //get again to see the created one
  listOfDelinquencyTypes.data = await testGetDelinquencyTypes();
  if (!listOfDelinquencyTypes.data) {
    return { message: "error", error: "listOfDelinquencyTypes failed" };
  }
  //update one delinquency type to change one field
  const updateOneType = await testUpdateDelinquencyTypes();
  if (!updateOneType) {
    return { message: "error", error: "updateOneType failed" };
  }
  //delete one delinquency type to make sure that it is deleted
  const deleteOneType = await testDeleteDelinquencyTypes();
  return {
    createOneType,
    updateOneType,
    deleteOneType,
    listOfDelinquencyTypes,
  };
};
module.exports = {
  testDelinquencyTypesWorkflows,
  testGetDelinquencyTypes,
  testCreateDelinquencyTypes,
  testDeleteDelinquencyTypes,
  testUpdateDelinquencyTypes,
};
