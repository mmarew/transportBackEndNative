const axios = require("axios");
const { backendURL } = require("../constants");
const { usersData } = require("../constants");
const { testCreateUser } = require("../Auth/RegisterUser");
const { testLoginUser } = require("../Auth/LoginUser");
const { testVerifyUserByOTP } = require("../Auth/VerifyByOtp");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
//note we can use only one endpoint source endpoints
const attachCompanyDocuments = async ({ userType = "companyAdmin" }) => {
  const token = usersData?.[userType]?.token;
  if (!token) {
    console.log("❌ Company Admin document attachment failed, no token found.");
    return;
  }

  const company = usersData?.[userType]?.companies?.[0];
  if (!company) {
    console.log("❌ No company found to attach documents to.");
    return;
  }

  const notAttachedDocs = company.documentCompliance?.notAttached || [];
  if (notAttachedDocs.length === 0) {
    console.log("✅ All Company Documents are already attached!");
    return;
  }

  const dummyFilePath = path.join(__dirname, "../dummy.txt");
  const url =
    backendURL + `/api/company/attachDocuments/${company.companyUniqueId}`;

  for (const documentType of notAttachedDocs) {
    console.log("🚀 ~ attachCompanyDocuments ~ documentType:", documentType);
    const form = new FormData();

    // 1. Attach the file itself
    form.append(
      documentType.uploadedDocumentName,
      fs.createReadStream(dummyFilePath),
    );

    // 2. Attach the Document Type ID
    form.append(
      documentType.uploadedDocumentTypeId,
      documentType.documentTypeId,
    );

    // 3. Attach File Number if required
    if (documentType.isFileNumberRequired === 1) {
      form.append(
        documentType.uploadedDocumentFileNumber,
        "COMP-" + Date.now(),
      );
    }

    // 4. Attach Expiration Date if required
    if (documentType.isExpirationDateRequired === 1) {
      form.append(documentType.uploadedDocumentExpirationDate, "2030-12-31");
    }

    // 5. Attach Description if required
    if (documentType.isDescriptionRequired === 1) {
      form.append(
        documentType.uploadedDocumentDescription,
        "Company dummy document description",
      );
    }

    const config = {
      headers: {
        Authorization: `Bearer ${token}`,
        ...form.getHeaders(),
      },
    };

    try {
      const res = await axios.post(url, form, config);
      console.log(
        `✅ Success! Attached Company Document: ${documentType.documentTypeName}`,
      );
    } catch (error) {
      console.log(
        `❌ Failed to attach Company Document: ${documentType.documentTypeName}`,
      );
      if (error.response) {
        console.log(
          "Server responded with:",
          error.response.data.error?.details || error.response.data,
        );
      } else {
        console.log("Raw Error:", error.message);
      }
    }
  }
};
const createCompanies = async ({ userType = "companyAdmin" }) => {
  const token = usersData?.[userType]?.token;
  //   console.log("🚀 ~ createCompanies ~ usersData:", usersData[userType]);
  if (!token) {
    console.log("❌ Company Admin login failed, no token found.");
    return;
  }
  const config = {
    headers: { Authorization: `Bearer ${token}` },
  };
  const url = backendURL + "/api/company/companies";
  //   console.log("🚀 ~ createCompanies ~ url:", url);
  //   console.log("🚀 ~ createCompanies ~ config:", config);
  const payload = {
    companyName: "company a",
    companyRegistrationNumber: "no aa3a",
    companyPhone: "+251922111111",
    companyEmail: "companya@gmail.com",
    companyAddress: "Addis Ababa",
  };
  try {
    const res = await axios.post(url, payload, config);
    console.log("✅ Success! Companies created.");
    return res.data;
  } catch (error) {
    console.log("❌ Failed to create companies.");
    if (error.response) {
      console.log(
        "Server responded with:",
        error.response.data.error?.details || error.response.data,
      );
    } else {
      console.log("Raw Error:", error.message);
    }
    return null;
  }
};
const getCompanies = async ({ userType = "companyAdmin" }) => {
  const token = usersData?.[userType]?.token;
  if (!token) {
    console.log("❌get companies failed, no token found.");
    return;
  }
  const config = {
    headers: { Authorization: `Bearer ${token}` },
  };
  try {
    const res = await axios.get(backendURL + "/api/company/companies", config);
    console.log("✅ Success! Companies fetched.");
    usersData["companyAdmin"]["companies"] = res.data.data;
    console.log(
      "🚀 ~ getCompanies ~ usersData:",
      usersData?.companyAdmin.companies,
    );
    return res.data.data;
  } catch (error) {
    console.log("❌ Failed to get companies.");
    if (error.response) {
      console.log(
        "Server responded with:",
        error.response.data.error?.details || error.response.data,
      );
    } else {
      console.log("Raw Error:", error.message);
    }
    return null;
  }
};
const createCompanyAdminFlow = async ({ userType = "companyAdmin" }) => {
  try {
    //create user company admin
    await testCreateUser({ userType });
    //verify user company admin
    await testVerifyUserByOTP({ userType });
    //login user company admin
    await testLoginUser({ userType });
    //create companies
    await createCompanies({ userType });
    //get companies
    await getCompanies({ userType });
    //attach company documents
    await attachCompanyDocuments({ userType });
  } catch (error) {
    console.log("❌ Failed to create driver request.");
    if (error.response) {
      console.log(
        "Server responded with:",
        error.response.data.error?.details || error.response.data,
      );
    } else {
      console.log("Raw Error:", error.message);
    }
  }
};
createCompanyAdminFlow({});

module.exports = {
  createCompanies,
  createCompanyAdminFlow,
  getCompanies,
  attachCompanyDocuments,
};
