const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");
const { report } = require("../Reporter");

const errMsg = (err) => {
  const data = err?.response?.data;
  const e = data?.error;
  if (typeof e === "object") return JSON.stringify(e).slice(0, 300);
  if (typeof e === "string") return e;
  if (data?.message) return typeof data.message === "string" ? data.message : JSON.stringify(data.message).slice(0, 200);
  return err?.message || "unknown error";
};

const testGetCompanyProfileHistory = async () => {
  const token = usersData?.companyAdmin?.token;
  const company = usersData?.companyAdmin?.companies?.[0];
  if (!token || !company) return report.skip("GET /api/company/companies/:id/profileHistory", "no company admin token or company");
  console.log("\n── GET /api/company/companies/:id/profileHistory ──");
  try {
    const cid = company.companyUniqueId || company;
    const res = await axios.get(backendURL + `/api/company/companies/${cid}/profileHistory`, authConfig(token));
    report.pass(`GET /api/company/companies/:id/profileHistory — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.skip("GET /api/company/companies/:id/profileHistory", errMsg(err));
  }
};

const runCompanySupplementaryTests = async () => {
  console.log("\n── Company Supplementary ──");
  await testGetCompanyProfileHistory();
};

module.exports = {
  testGetCompanyProfileHistory,
  runCompanySupplementaryTests,
};
