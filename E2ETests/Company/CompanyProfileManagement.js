const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");

const createCompanies = async ({ userType = "companyAdmin" }) => {
  const token = usersData?.[userType]?.token;
  if (!token) {
    console.log("❌ Company Admin login failed, no token found.");
    return;
  }
  const config = {
    headers: { Authorization: `Bearer ${token}` },
  };
  const url = backendURL + "/api/company/companies";
  const payload =usersData.company
  //first check if there is a company before from saved values
  const companies = usersData["companyAdmin"]["companies"];
  if (companies && companies.length > 0) {
    //map over companies and check if there is a company with the same registration number or email or phone or name
    const existingCompany = companies.find(
      (c) =>
        c.companyRegistrationNumber === payload.companyRegistrationNumber ||
        c.companyEmail === payload.companyEmail ||
        c.companyPhone === payload.companyPhone ||
        c.companyName === payload.companyName,
    );
    if (existingCompany) {
      console.log("✅ Company already exists, skipping creation.");
      return companies[0];
    }
  }
  try {
    const res = await axios.post(url, payload, config);
    console.log("✅ Success! Companies created.");
    //fetch fresh companies after creation
    await getCompanies({ userType: "companyAdmin" });

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
     usersData["companyAdmin"]["companies"] = res.data.data;
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

const approveCompanyStatus = async ({ userType = "admin" }) => {
  // {{url}}/api/company/companies/:companyUniqueId/approve
  const token = usersData?.admin?.token;
  if (!token) {
    console.log("❌ admin can't approve documents, no token found.");
    return;
  }

  const company = usersData?.companyAdmin?.companies?.[0];
  if (!company) {
    console.log("❌ No company found to approve documents.");
    return;
  }
  // check if company is already approved not to re-approve
  if (company.approvalStatus === "approved") {
    console.log("✅ Company is already approved, skipping approval.");
    return company;
  }
  const url =
    backendURL + `/api/company/companies/${company.companyUniqueId}/approve`;
  const config = {
    headers: { Authorization: `Bearer ${token}` },
  };
  try {
    const res = await axios.patch(
      url,
      {
        approvalStatus: "approved",
      },
      config,
    );
    console.log("✅ Success! Company Documents approved.");
    return res.data.data;
  } catch (error) {
    console.log("❌ Failed to approve Company Documents.");
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

const getAttachableDocuments = async ({ userType = "companyAdmin" }) => {
  // {{url}}/api/RoleDocumentRequirements?roleId=8
  const token = usersData?.[userType]?.token;
  if (!token) {
    console.log(
      "❌ get Company Admin document attachment failed, no token found.",
    );
    return;
  }
  const config = {
    headers: { Authorization: `Bearer ${token}` },
  };
  const url = backendURL + "/api/RoleDocumentRequirements?roleId=8";
  try {
    const res = await axios.get(url, config);
    console.log("✅ Success! Attachments fetched.");
    return res.data.data;
  } catch (error) {
    console.log("❌ Failed to get attachments.");
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
//note we can use only one endpoint source endpoints
const attachCompanyDocuments = async ({ userType = "companyAdmin" }) => {
  try {
    const token = usersData?.[userType]?.token;
    if (!token) {
      console.log(
        "❌ Company Admin document attachment failed, no token found.",
      );
      return;
    }

    const company = usersData?.[userType]?.companies?.[0];
    if (!company) {
      console.log("❌ No company found to attach documents to.");
      return;
    }

    const notAttachedDocs = company.documentCompliance?.notAttached || [];
    if (notAttachedDocs.length === 0) {
       return;
    }

    const dummyFilePath = path.join(__dirname, "../dummy.txt");
    const url =
      backendURL + `/api/company/attachDocuments/${company.companyUniqueId}`;
    const attachableDocuments = await getAttachableDocuments({ userType });
    for (const documentType of attachableDocuments) {
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
  } catch (error) {
    console.log("❌ Error attaching company documents.");
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
const approveCompanyDocuments = async ({ userType = "admin" }) => {
  try {
    const token = usersData?.[userType]?.token;
    if (!token) {
      throw new Error("Admin token missing, cannot approve company documents.");
    }

    const company = usersData?.companyAdmin?.companies?.[0];
    if (!company) {
      throw new Error("No company found to approve documents.");
    }

    // Fetch the latest attached documents directly
    const attachedDocs = await getAttachedDocumentsOfCompanies({ userType: "companyAdmin" });
    const pendingDocuments = (attachedDocs || []).filter(
      (doc) => doc.attachedDocumentAcceptance === "PENDING",
    );

    if (pendingDocuments.length === 0) {
      console.log("⏩ No pending company documents to approve.");
      return;
    }

    console.log(`📋 Found ${pendingDocuments.length} pending company documents to approve`);

    const url = backendURL + `/api/admin/acceptRejectAttachedDocuments`;
    const config = { headers: { Authorization: `Bearer ${token}` } };

    await Promise.all(
      pendingDocuments.map(async (doc) => {
        const payload = {
          roleId: 8, // company role
          attachedDocumentUniqueId: doc.attachedDocumentUniqueId,
          action: "ACCEPTED",
          reason: "Document is valid and accepted.",
        };
        const res = await axios.put(url, payload, config);
        console.log(`✅ Approved company doc: ${doc.documentTypeName || doc.attachedDocumentUniqueId}`);
        return res.data.data;
      }),
    );
  } catch (error) {
    console.error("❌ Error approving company documents:", error.response?.data?.error || error.message);
    throw error;
  }
};
const getAttachedDocumentsOfCompanies = async ({
  userType = "companyAdmin",
}) => {
  try {
    // use {{url}}/api/company/attachedDocuments/:companyUniqueId to fetch company attached documents
    const token = usersData?.[userType]?.token;
    if (!token) {
      console.log(
        "❌ Company Admin get attached documents failed, no token found.",
      );
      return;
    }
    const getCompanyDocuments = await axios.get(
      backendURL +
        `/api/company/attachedDocuments/${usersData?.[userType]?.companies?.[0]?.companyUniqueId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
  
    return getCompanyDocuments.data.data;
  } catch (error) {
    console.log("❌ Failed to get attached documents.");
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
const initiateCompanyProfileSetupWorkFlow = async ({
  userType = "companyAdmin",
}) => {
  try {
    // await testLoginUser({ userType });
    await getCompanies({ userType });
    //attach company documents//create companies
    await createCompanies({ userType });
    await getAttachedDocumentsOfCompanies({ userType });
    //attach company documents
    await attachCompanyDocuments({ userType });
    //approve company documents by system admin not by company admin
    await approveCompanyDocuments({ userType: "admin" });
    // //approve company status by system admin not by company admin
    await approveCompanyStatus({ userType: "admin" });
  } catch (error) {
    console.log("❌ Error initiating company profile setup workflow.");
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
//set admin token to make approval
module.exports = {
  createCompanies,
  getCompanies,
  approveCompanyStatus,
  getAttachableDocuments,
  attachCompanyDocuments,
  approveCompanyDocuments,
  getAttachedDocumentsOfCompanies,
  initiateCompanyProfileSetupWorkFlow,
};
