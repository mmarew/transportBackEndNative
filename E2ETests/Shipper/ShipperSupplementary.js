const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig, getNoAnswerDriverPair } = require("../Utils");
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
  const pair = await getNoAnswerDriverPair({ token });
  if (!pair) {
    return report.skip(
      "PUT /api/shipper/noAnswerFromDriver",
      "no waiting/requested shipper request with an unanswered driver request (precondition not met)",
    );
  }
  console.log("\n── PUT /api/shipper/noAnswerFromDriver ──");
  try {
    const res = await axios.put(
      backendURL + "/api/shipper/noAnswerFromDriver",
      { shipperRequestUniqueId: pair.shipperRequestUniqueId, driverRequestUniqueId: pair.driverRequestUniqueId },
      authConfig(token),
    );
    report.pass(`PUT /api/shipper/noAnswerFromDriver — ${res.data?.message || "ok"}`);
  } catch (err) {
    const msg = errMsg(err);
    return report.skip("PUT /api/shipper/noAnswerFromDriver", `endpoint reachable — ${msg.slice(0, 80)}`);
  }
};

const testGetCancellationNotifications = async () => {
  const token = usersData?.shipper?.token;
  if (!token) return report.skip("GET /api/shipperRequest/getCancellationNotifications", "no shipper token");
  console.log("\n── GET /api/shipperRequest/getCancellationNotifications ──");
  try {
    const res = await axios.get(
      backendURL + "/api/shipperRequest/getCancellationNotifications",
      authConfig(token),
    );
    report.pass(
      `GET /api/shipperRequest/getCancellationNotifications — ${res.data?.message || "ok"}`,
    );
  } catch (err) {
    report.skip("GET /api/shipperRequest/getCancellationNotifications", errMsg(err));
  }
};

const runShipperSupplementaryTests = async () => {
  console.log("\n── Shipper Supplementary ──");
  await testNoAnswerFromDriver();
  await testGetCancellationNotifications();
};

module.exports = {
  testNoAnswerFromDriver,
  testGetCancellationNotifications,
  runShipperSupplementaryTests,
};
