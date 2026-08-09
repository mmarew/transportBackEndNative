const axios = require("axios");
const { backendURL } = require("./constants");

const authConfig = (token) => ({
  headers: { Authorization: `Bearer ${token}` },
});

const getAnyJourneyDecision = async ({ token }) => {
  const res = await axios.get(
    backendURL + "/api/user/getJourneyDecision4AllOrSingleUser?target=all&limit=1",
    authConfig(token),
  );
  const list = res?.data?.data?.data || res?.data?.data || [];
  if (Array.isArray(list) && list.length > 0) {
    return list[0]?.journeyDecisionUniqueId || null;
  }
  return null;
};

const getActiveDelinquencyType = async ({ token }) => {
  const res = await axios.get(
    backendURL + "/api/admin/delinquencyTypes?isActive=true",
    authConfig(token),
  );
  const list = res?.data?.data?.data || res?.data?.data || [];
  if (Array.isArray(list) && list.length > 0) {
    return list[0]?.delinquencyTypeUniqueId || null;
  }
  return null;
};

const getPendingAttachedDocument = async ({ token, ownerUserUniqueId }) => {
  const query = ownerUserUniqueId
    ? `?userUniqueId=${ownerUserUniqueId}&limit=50`
    : "?limit=50";
  const res = await axios.get(
    backendURL + "/api/user/attachedDocuments" + query,
    authConfig(token),
  );
  const list = res?.data?.data || [];
  if (Array.isArray(list) && list.length > 0) {
    const pending = list.find(
      (doc) => (doc?.attachedDocumentAcceptance || "").toUpperCase() === "PENDING",
    );
    return pending?.attachedDocumentUniqueId || null;
  }
  return null;
};

const getCancellableJourney = async ({ token }) => {
  const res = await axios.get(
    backendURL + "/api/journey?ownerUserUniqueId=all&limit=100",
    authConfig(token),
  );
  const list = res?.data?.data?.data || res?.data?.data || [];
  if (Array.isArray(list) && list.length > 0) {
    const match = list.find(
      (item) =>
        item?.journey?.journeyUniqueId &&
        [1, 2, 3, 4, 5].includes(item?.journey?.journeyStatusId),
    );
    return match?.journey?.journeyUniqueId || null;
  }
  return null;
};

const getUnreferencedJourneyDecision = async ({ token }) => {
  const res = await axios.get(
    backendURL +
      "/api/user/getJourneyDecision4AllOrSingleUser?target=all&limit=1&unreferenced=true",
    authConfig(token),
  );
  const list = res?.data?.data?.data || res?.data?.data || [];
  if (Array.isArray(list) && list.length > 0) {
    const item = list[0];
    return {
      journeyDecisionUniqueId: item?.journeyDecisionUniqueId || null,
      journeyDecisionId: item?.journeyDecisionId || null,
    };
  }
  return null;
};

const getDriverDeviceToken = async ({ token, userUniqueId, roleId }) => {
  const res = await axios.get(
    backendURL +
      `/api/user/getFCMTokens?userUniqueId=${encodeURIComponent(userUniqueId)}&roleId=${encodeURIComponent(roleId)}&active=true`,
    authConfig(token),
  );
  const list = res?.data?.data?.data || res?.data?.data || [];
  if (Array.isArray(list) && list.length > 0) {
    return list[0]?.deviceTokenUniqueId || null;
  }
  return null;
};

const getNoAnswerDriverPair = async ({ token }) => {
  const res = await axios.get(
    backendURL +
      "/api/user/getShipperRequest4allOrSingleUser?journeyStatusId=1,2&hasUnansweredDriverRequest=true&limit=10",
    authConfig(token),
  );
  const list = res?.data?.data?.data || res?.data?.data || [];
  if (Array.isArray(list) && list.length > 0) {
    for (const item of list) {
      const sr = item?.shipperRequest;
      const dr = (item?.driverRequests || []).find(
        (d) => d?.journeyStatusId === 2,
      );
      if (sr?.shipperRequestUniqueId && dr?.driverRequestUniqueId) {
        return {
          shipperRequestUniqueId: sr.shipperRequestUniqueId,
          driverRequestUniqueId: dr.driverRequestUniqueId,
        };
      }
    }
  }
  return null;
};

module.exports = {
  authConfig,
  getAnyJourneyDecision,
  getActiveDelinquencyType,
  getPendingAttachedDocument,
  getCancellableJourney,
  getUnreferencedJourneyDecision,
  getDriverDeviceToken,
  getNoAnswerDriverPair,
};
