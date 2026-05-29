const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");

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
    companyRegistrationNumber: `no-aa3a-${Date.now()}`,
    companyPhone: "+251922111111",
    companyEmail: `companya+${Date.now()}@gmail.com`,
    companyAddress: "Addis Ababa",
  };
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
  const attachableDocuments = await getAttachableDocuments({ userType });
  console.log(
    "🚀 ~ attachCompanyDocuments ~ attachableDocuments:",
    attachableDocuments,
  );
  for (const documentType of attachableDocuments) {
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
const approveCompanyDocuments = async ({ userType = "admin" }) => {
  // patch {{url}}/api/company/companies/:companyUniqueId/approve
  const token = usersData?.[userType]?.token;
  console.log("🚀 ~ approveCompanyDocuments ~ token:", token);
  if (!token) {
    console.log("❌ admin can't approve documents, no token found.");
    return;
  }

  const company = usersData?.companyAdmin?.companies?.[0];
  if (!company) {
    console.log("❌ No company found to approve documents.");
    return;
  }

  const url = backendURL + `/api/admin/acceptRejectAttachedDocuments`;
  const config = {
    headers: { Authorization: `Bearer ${token}` },
  };

  const pendingDocuments = company?.documentCompliance?.pending || [];
  await Promise.all(
    pendingDocuments.map(async (doc) => {
      const attachedDocumentUniqueId = doc?.attachedDocumentUniqueId;
      const payload = {
        roleId: 7,
        attachedDocumentUniqueId,
        action: "ACCEPTED",
        reason: "Document is valid and accepted.",
      };
      try {
        const res = await axios.put(url, payload, config);
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
    }),
  );
};

module.exports = {
  createCompanies,
  getCompanies,
  approveCompanyStatus,
  getAttachableDocuments,
  attachCompanyDocuments,
  approveCompanyDocuments,
};
