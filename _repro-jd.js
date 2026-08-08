const axios = require("axios");
const { backendURL, usersData } = require("/Users/zewedu/Desktop/Projects/transportBackEndNative/E2ETests/constants");
const { apiLoginUser } = require("/Users/zewedu/Desktop/Projects/transportBackEndNative/E2ETests/Auth/authApi");
const { authConfig } = require("/Users/zewedu/Desktop/Projects/transportBackEndNative/E2ETests/Utils");

(async () => {
  const { ensureUser } = require("./E2ETests/Auth/ensureUser");
  const { usersData } = require("./E2ETests/constants");
  await ensureUser({ userType: "supperAdmin", options: { fetchAccount: false } });
  const adminToken = usersData.supperAdmin.token;
  console.log("supperAdmin token:", adminToken ? "yes" : "NO");

  const list = await axios.get(
    backendURL + "/api/user/getJourneyDecision4AllOrSingleUser",
    authConfig(adminToken)
  );
  const decisions = list.data?.data || list.data?.formattedData || [];
  console.log("decisions count:", decisions.length);
  const first = decisions[0];
  if (!first) {
    console.log("no decisions");
    return;
  }
  const uid = first.journeyDecisionUniqueId || first.id || first.journeyDecisionId;
  console.log("target uid:", uid, "status:", first.journeyStatusId, "seenByShipper:", first.isRejectionByShipperSeenByDriver);

  const payload = {
    conditions: { journeyDecisionUniqueId: uid },
    updateValues: { isRejectionByShipperSeenByDriver: "not seen by driver yet" },
  };
  try {
    const res = await axios.put(backendURL + "/api/journeyDecisions", payload, authConfig(adminToken));
    console.log("PUT OK:", res.status, JSON.stringify(res.data).slice(0, 200));
  } catch (e) {
    console.log("PUT ERR:", e.response?.status, JSON.stringify(e.response?.data));
  }
  process.exit(0);
})().catch((e) => {
  console.log("FATAL", e.response?.data || e.message);
  process.exit(1);
});
