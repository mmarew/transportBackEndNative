"use strict";

const axios = require("axios");
const { io } = require("socket.io-client");

const BASE = "http://127.0.0.1:3000";
const DRIVER_PHONE = "+251922112480";
const DRIVER_ROLE = 2;
const OTP = 101010;
const SHIPPER_PHONE = "+251922112481";
const QUEUE_ORG_UNIQUE_ID = "01afb03a-c67f-425b-b4c9-7a5d4aac11c9";
const VEHICLE_TYPE_UNIQUE_ID = "55060ed0-88e8-42ba-b29a-fe4b3d713b84";
const VEHICLE_DRIVER_UNIQUE_ID = "07c4105c-d889-442e-8a01-062765892796";

const log = (...args) => console.log(new Date().toISOString().slice(11, 19), ...args);
const wait = ms => new Promise(r => setTimeout(r, ms));

const api = axios.create({ baseURL: BASE, timeout: 20000 });

const loginUser = async (phone, role) => {
  await api.post("/api/user/loginUser", { phoneNumber: phone, roleId: role }).catch(() => {});
  const res = await api.post("/api/user/verifyUserByOTP", { phoneNumber: phone, OTP, roleId: role });
  return res.data.token;
};

const loginDriver = () => loginUser(DRIVER_PHONE, DRIVER_ROLE);
const loginShipper = () => loginUser(SHIPPER_PHONE, 1);

const connectSocket = token => {
  const socket = io(BASE, {
    auth: { phoneNumber: DRIVER_PHONE, user: "driver", token: `Bearer ${token}` },
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    timeout: 15000,
  });
  const events = [];
  socket.on("connect", () => log("socket connected"));
  socket.on("connect_error", err => log("socket connect_error:", err?.message));
  socket.on("messages", raw => {
    let d = raw;
    try { d = typeof raw === "string" ? JSON.parse(raw) : raw; } catch {}
    events.push(["messages", d]);
    log("⚡ messages event:", JSON.stringify(d)?.slice(0, 900));
  });
  socket.on("queue", raw => {
    let d = raw;
    try { d = typeof raw === "string" ? JSON.parse(raw) : raw; } catch {}
    events.push(["queue", d]);
    log("⚡ queue event:", JSON.stringify(d)?.slice(0, 2200));
  });
  socket.on("disconnect", r => log("socket disconnect:", r));
  return { socket, events };
};

const checkinQueue = async token => {
  const res = await api.post("/api/queue/driver/checkin", {
    queueOrganizationUniqueId: QUEUE_ORG_UNIQUE_ID,
    vehicleDriverUniqueId: VEHICLE_DRIVER_UNIQUE_ID,
    latitude: 9.03,
    longitude: 38.74,
  }, { headers: { Authorization: `Bearer ${token}` } });
  log("checkin:", JSON.stringify(res.data?.data ?? res.data)?.slice(0, 500));
};

const placeOrder = async shipperToken => {
  const { v4: uuidv4 } = require("uuid");
  const batch = uuidv4();
  const res = await api.post("/api/shipperRequest/createRequest", {
    queueOrganizationUniqueId: QUEUE_ORG_UNIQUE_ID,
    shipperPhoneNumber: SHIPPER_PHONE,
    shipperRequestBatchUniqueId: batch,
    requestMode: "individual_target",
    numberOfVehicles: 1,
    deliveryDate: "2025-04-20T10:54:26.077Z",
    requestType: "shipper",
    destination: { latitude: 35.4218, longitude: 7.1973, description: "Dessie, Ethiopia" },
    vehicle: { vehicleTypeUniqueId: VEHICLE_TYPE_UNIQUE_ID },
    shippableItemName: "Repro Materials",
    shippableItemQtyInQuintal: 500,
    shippingCost: 5000000,
    shippingDate: "2025-04-20T10:54:26.077Z",
    originLocation: { latitude: 9.0204683, longitude: 38.80246, description: "Kombolcha, Ethiopia" },
  }, { headers: { Authorization: `Bearer ${shipperToken}` } }).catch(e => {
    log("createRequest error:", JSON.stringify(e?.response?.data)?.slice(0, 800));
    throw e;
  });
  log("createRequest:", res.data?.status, res.data?.message);
  return res.data;
};

const verify = async token => {
  try {
    const res = await api.get("/api/driver/verifyDriverJourneyStatus", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = res.data;
    return {
      status: d?.status,
      decisionBy: d?.decision?.decisionBy ?? d?.decisions?.decisionBy ?? null,
      hasQueueOrg: !!d?.shipper?.queueOrganizationUniqueId,
      queue: d?.queue ?? null,
      shipperJourneyStatus: d?.shipper?.journeyStatusId ?? null,
      driverJourneyStatus: d?.driver?.driver?.journeyStatusId ?? null,
    };
  } catch (e) {
    return { error: e?.response?.data?.error?.message || e?.message };
  }
};

const acceptOrder = async (token) => {
  // Get the unique IDs from verify response
  const res = await api.get("/api/driver/verifyDriverJourneyStatus", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const d = res.data;
  const ids = {
    driverRequestUniqueId: d?.driver?.driver?.driverRequestUniqueId,
    shipperRequestUniqueId: d?.shipper?.shipperRequestUniqueId,
    journeyDecisionUniqueId: d?.decision?.journeyDecisionUniqueId ?? d?.decisions?.journeyDecisionUniqueId,
  };
  log("accepting with IDs:", JSON.stringify(ids));
  const acc = await api.put("/api/driver/acceptShipperRequest", {
    ...ids,
    shippingCostByDriver: 5000000,
  }, { headers: { Authorization: `Bearer ${token}` } }).catch(e => {
    log("accept error:", JSON.stringify(e?.response?.data)?.slice(0, 800));
    throw e;
  });
  log("accept response status:", acc.data?.status);
  log("accept response journey:", JSON.stringify(acc.data?.journey)?.slice(0, 300));
  log("accept response uniqueIds:", JSON.stringify(acc.data?.uniqueIds));
  log("accept response decision.decisionBy:", acc.data?.decision?.decisionBy);
  return acc.data;
};

const main = async () => {
  log("=== login ===");
  const token = await loginDriver();
  const shipperToken = await loginShipper();
  log("driver token:", !!token, "shipper token:", !!shipperToken);

  log("=== socket connect ===");
  const { socket, events } = connectSocket(token);
  await wait(2500);

  log("=== check in ===");
  await checkinQueue(token).catch(e => log("checkin err:", e?.response?.data?.error?.message || e?.message));
  await wait(2500);
  log("verify after checkin:", JSON.stringify(await verify(token)));

  log("=== place order ===");
  await placeOrder(shipperToken);
  await wait(6000);
  log("verify after offer:", JSON.stringify(await verify(token)));

  log("=== accept ===");
  await acceptOrder(token).catch(e => log("accept failed"));
  await wait(4000);
  log("verify after accept:", JSON.stringify(await verify(token)));

  log("=== events captured (" + events.length + ") ===");
  for (const [ev, d] of events) {
    log(`[${ev}]`, JSON.stringify(d)?.slice(0, 1800));
  }

  socket.close();
  process.exit(0);
};

main().catch(e => { console.error("FATAL:", e?.message); process.exit(1); });
