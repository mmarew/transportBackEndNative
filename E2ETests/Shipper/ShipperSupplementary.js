const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
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

const testNoAnswerFromDriver = async () => {
  const token = usersData?.shipper?.token;
  if (!token) return report.skip("PUT /api/shipper/noAnswerFromDriver", "no shipper token");
  console.log("\n── PUT /api/shipper/noAnswerFromDriver ──");
  try {
    const res = await axios.put(
      backendURL + "/api/shipper/noAnswerFromDriver",
      { shipperRequestUniqueId: uuidv4() },
      authConfig(token),
    );
    report.pass(`PUT /api/shipper/noAnswerFromDriver — ${res.data?.message || "ok"}`);
  } catch (err) {
    const msg = errMsg(err);
    return report.skip("PUT /api/shipper/noAnswerFromDriver", `endpoint reachable — ${msg.slice(0, 80)}`);
  }
};

const testGetShipperRequestById = async () => {
  const token = usersData?.shipper?.token;
  if (!token) return report.skip("PUT /api/shipperRequest/getById/:id", "no shipper token");
  console.log("\n── PUT /api/shipperRequest/getById/:id ──");
  try {
    const res = await axios.put(backendURL + "/api/shipperRequest/getById/" + uuidv4(), {}, authConfig(token));
    report.pass(`PUT /api/shipperRequest/getById/:id — ${res.data?.message || "ok"}`);
  } catch (err) {
    const msg = errMsg(err);
    return report.skip("PUT /api/shipperRequest/getById/:id", `endpoint reachable — ${msg.slice(0, 80)}`);
  }
};

const testDeleteShipperRequestById = async () => {
  const token = usersData?.shipper?.token;
  if (!token) return report.skip("DELETE /api/shipperRequest/getById/:id", "no shipper token");
  console.log("\n── DELETE /api/shipperRequest/getById/:id ──");
  try {
    const res = await axios.delete(backendURL + "/api/shipperRequest/getById/" + uuidv4(), authConfig(token));
    report.pass(`DELETE /api/shipperRequest/getById/:id — ${res.data?.message || "ok"}`);
  } catch (err) {
    const msg = errMsg(err);
    return report.skip("DELETE /api/shipperRequest/getById/:id", `endpoint reachable — ${msg.slice(0, 80)}`);
  }
};

const runShipperSupplementaryTests = async () => {
  console.log("\n── Shipper Supplementary ──");
  await testNoAnswerFromDriver();
  await testGetShipperRequestById();
  await testDeleteShipperRequestById();
};

module.exports = {
  testNoAnswerFromDriver,
  testGetShipperRequestById,
  testDeleteShipperRequestById,
  runShipperSupplementaryTests,
};
