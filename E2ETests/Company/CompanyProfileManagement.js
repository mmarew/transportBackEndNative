const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const fs = require("fs");
const path = require("path");
const { authConfig } = require("../Utils");

const logCompanyProfileError = (message, error) => {
  console.error(
    `CompanyProfileError: ${message}`,
    error?.response?.data?.error || error?.message || error,
  );
};

const createCompanies = async ({ userType = "companyAdmin" }) => {
  const token = usersData?.[userType]?.token;
  if (!token) {
    logCompanyProfileError("Company admin token missing for company creation.");
    return null;
  }
  const config = {
    ...authConfig(token),
  };
  const url = backendURL + "/api/company/companies";
  const payload = usersData.company;
  const companies = usersData["companyAdmin"]["companies"];
  if (companies && companies.length > 0) {
    const existingCompany = companies.find(
      (c) =>
        c.companyRegistrationNumber === payload.companyRegistrationNumber ||
        c.companyEmail === payload.companyEmail ||
        c.companyPhone === payload.companyPhone ||
        c.companyName === payload.companyName,
    );
    if (existingCompany) {
      return companies[0];
    }
  }
  try {
    const res = await axios.post(url, payload, config);
    await getCompanies({ userType: "companyAdmin" });
    return res.data;
  } catch (error) {
    logCompanyProfileError("Failed to create companies.", error);
    return null;
  }
};
const getCompanies = async ({ userType = "companyAdmin" }) => {
  const token = usersData?.[userType]?.token;
  if (!token) {
    logCompanyProfileError(
      "Company admin token missing for fetching companies.",
    );
    return null;
  }
  const config = {
    ...authConfig(token),
  };
  try {
    const res = await axios.get(backendURL + "/api/company/companies", config);
    usersData["companyAdmin"]["companies"] = res.data.data;
    return res.data.data;
  } catch (error) {
    logCompanyProfileError("Failed to get companies.", error);
    return null;
  }
};

const approveCompanyStatus = async () => {
  const token = usersData?.admin?.token;
  if (!token) {
    logCompanyProfileError("Admin token missing for company status approval.");
    return null;
  }

  const company = usersData?.companyAdmin?.companies?.[0];
  if (!company) {
    logCompanyProfileError("Company record missing for status approval.");
    return null;
  }

  if (company.approvalStatus === "approved") {
    return company;
  }
  const url =
    backendURL + `/api/company/companies/${company.companyUniqueId}/approve`;
  const config = {
    ...authConfig(token),
  };
  try {
    const res = await axios.patch(
      url,
      {
        approvalStatus: "approved",
      },
      config,
    );
    return res.data.data;
  } catch (error) {
    logCompanyProfileError("Failed to approve company status.", error);
    return null;
  }
};

const getAttachableDocuments = async ({ userType = "companyAdmin" }) => {
  const token = usersData?.[userType]?.token;
  if (!token) {
    logCompanyProfileError(
      "Company admin token missing for attachment requirements.",
    );
    return [];
  }
  const config = { ...authConfig(token) };
  const url = backendURL + "/api/RoleDocumentRequirements?roleId=8";
  try {
    const res = await axios.get(url, config);
    return res.data.data || [];
  } catch (error) {
    logCompanyProfileError("Failed to fetch attachment requirements.", error);
    return [];
  }
};
//note we can use only one endpoint source endpoints
const attachCompanyDocuments = async ({ userType = "companyAdmin" }) => {
  try {
    const token = usersData?.[userType]?.token;
    if (!token) {
      logCompanyProfileError(
        "Company admin token missing for document attachment.",
      );
      return;
    }

    const company = usersData?.[userType]?.companies?.[0];
    if (!company) {
      logCompanyProfileError("Company record missing for document attachment.");
      return;
    }

    const notAttachedDocs = company.documentCompliance?.notAttached || [];
    if (notAttachedDocs.length === 0) {
      return;
    }

    const dummyFilePath = path.join(__dirname, "../dummy.png");
    const fileBuffer = fs.readFileSync(dummyFilePath);
    const url =
      backendURL + `/api/company/attachDocuments/${company.companyUniqueId}`;
    const attachableDocuments = await getAttachableDocuments({ userType });
    for (const documentType of attachableDocuments) {
      const form = new FormData();

      form.append(
        documentType.uploadedDocumentName,
        new Blob([fileBuffer], { type: "image/png" }),
        "dummy.png",
      );

      form.append(
        documentType.uploadedDocumentTypeId,
        documentType.documentTypeId,
      );

      if (documentType.isFileNumberRequired === 1) {
        form.append(
          documentType.uploadedDocumentFileNumber,
          "COMP-" + Date.now(),
        );
      }

      if (documentType.isExpirationDateRequired === 1) {
        form.append(documentType.uploadedDocumentExpirationDate, "2030-12-31");
      }

      if (documentType.isDescriptionRequired === 1) {
        form.append(
          documentType.uploadedDocumentDescription,
          "Company dummy document description",
        );
      }

      const config = {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      };

      try {
        await axios.post(url, form, config);
      } catch (error) {
        logCompanyProfileError(
          `Failed to attach company document: ${documentType.documentTypeName}`,
          error,
        );
      }
    }
  } catch (error) {
    logCompanyProfileError("Error attaching company documents.", error);
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
    const attachedDocsResponse = await getAttachedDocumentsOfCompanies({
      userType: "companyAdmin",
    });
    const attachedDocs = Array.isArray(attachedDocsResponse)
      ? attachedDocsResponse
      : attachedDocsResponse?.data?.documents ||
        attachedDocsResponse?.documents ||
        [];

    const pendingDocuments = attachedDocs.filter(
      (doc) => doc.attachedDocumentAcceptance === "PENDING",
    );

    if (pendingDocuments.length === 0) {
      return;
    }

    const url = backendURL + `/api/admin/acceptRejectAttachedDocuments`;
    const config = authConfig(token);

    await Promise.all(
      pendingDocuments.map(async (doc) => {
        const payload = {
          roleId: 8, // company role
          attachedDocumentUniqueId: doc.attachedDocumentUniqueId,
          action: "ACCEPTED",
          reason: "Document is valid and accepted.",
        };
        try {
          await axios.put(url, payload, config);
        } catch (error) {
          logCompanyProfileError(
            `Failed to approve attached document: ${doc.attachedDocumentUniqueId}`,
            error,
          );
          throw error;
        }
      }),
    );
  } catch (error) {
    logCompanyProfileError("Error approving company documents.", error);
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
      logCompanyProfileError(
        "Company admin token missing for fetching attached documents.",
      );
      return [];
    }
    const getCompanyDocuments = await axios.get(
      backendURL +
        `/api/company/attachedDocuments/${usersData?.[userType]?.companies?.[0]?.companyUniqueId}`,
      authConfig(token),
    );

    const responseData = getCompanyDocuments.data?.data;
    return Array.isArray(responseData)
      ? responseData
      : responseData?.documents || responseData?.data || [];
  } catch (error) {
    logCompanyProfileError("Failed to fetch attached documents.", error);
    return [];
  }
};
const initiateCompanyProfileSetupWorkFlow = async ({
  userType = "companyAdmin",
}) => {
  try {
    await getCompanies({ userType });
    await createCompanies({ userType });
    await getAttachedDocumentsOfCompanies({ userType });
    await attachCompanyDocuments({ userType });
    await approveCompanyDocuments({ userType: "admin" });
    await approveCompanyStatus({ userType: "admin" });
  } catch (error) {
    logCompanyProfileError("Company profile setup workflow failed.", error);
    throw error;
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
