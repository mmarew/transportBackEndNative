"use strict";

const axios = require("axios");
const { io } = require("socket.io-client");
const { v4: uuidv4 } = require("uuid");

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

const main = async () => {
  const token = await loginUser(DRIVER_PHONE, DRIVER_ROLE);
  const shipperToken = await loginUser(SHIPPER_PHONE, 1);
  log("tokens ok");

  const events = [];
  const socket = io(BASE, {
    auth: { phoneNumber: DRIVER_PHONE, user: "driver", token: `Bearer ${token}` },
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    timeout: 15000,
  });
  socket.on("connect", () => log("socket connected"));
  socket.on("queue", raw => {
    let d = raw; try { d = typeof raw === "string" ? JSON.parse(raw) : raw; } catch {}
    events.push(["queue", d]);
    log("⚡ queue event:", JSON.stringify(d)?.slice(0, 1500));
  });
  socket.on("messages", raw => {
    let d = raw; try { d = typeof raw === "string" ? JSON.parse(raw) : raw; } catch {}
    events.push(["messages", d]);
    log("⚡ messages event:", JSON.stringify(d)?.slice(0, 800));
  });
  await wait(2000);

  // check in
  await api.post("/api/queue/driver/checkin", {
    queueOrganizationUniqueId: QUEUE_ORG_UNIQUE_ID,
    vehicleDriverUniqueId: VEHICLE_DRIVER_UNIQUE_ID,
    latitude: 9.03, longitude: 38.74,
  }, { headers: { Authorization: `Bearer ${token}` } });
  log("checked in");
  await wait(1500);

  // place order
  await api.post("/api/shipperRequest/createRequest", {
    queueOrganizationUniqueId: QUEUE_ORG_UNIQUE_ID,
    shipperPhoneNumber: SHIPPER_PHONE,
    shipperRequestBatchUniqueId: uuidv4(),
    requestMode: "individual_target",
    numberOfVehicles: 1,
    deliveryDate: "2025-04-20T10:54:26.077Z",
    requestType: "shipper",
    destination: { latitude: 35.4218, longitude: 7.1973, description: "Dessie, Ethiopia" },
    vehicle: { vehicleTypeUniqueId: VEHICLE_TYPE_UNIQUE_ID },
    shippableItemName: "Repro Expiry",
    shippableItemQtyInQuintal: 500,
    shippingCost: 5000000,
    shippingDate: "2025-04-20T10:54:26.077Z",
    originLocation: { latitude: 9.0204683, longitude: 38.80246, description: "Kombolcha, Ethiopia" },
  }, { headers: { Authorization: `Bearer ${shipperToken}` } });
  log("order placed, waiting for offer...");
  await wait(4000);

  const verify = async () => {
    const res = await api.get("/api/driver/verifyDriverJourneyStatus", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = res.data;
    return {
      status: d?.status,
      decisionBy: d?.decision?.decisionBy ?? d?.decisions?.decisionBy ?? null,
      hasQueueOrg: !!d?.shipper?.queueOrganizationUniqueId,
      queue: d?.queue ?? null,
      journey: d?.journey?.journeyStatusId ?? null,
    };
  };

  log("status while offered:", JSON.stringify(await verify()));

  // Force the expiry sweep with a tiny window directly from the service module
  const { releaseExpiredOffers } = require("../../Services/DriverQueue.service");
  const released = await releaseExpiredOffers({ windowMinutes: 0.00001 });
  log("releaseExpiredOffers:", JSON.stringify(released));

  await wait(3000);
  log("status after expiry:", JSON.stringify(await verify()));

  log("=== socket events captured ===");
  for (const [ev, d] of events) log(`[${ev}]`, JSON.stringify(d)?.slice(0, 1200));
  socket.close();
  process.exit(0);
};

main().catch(e => { console.error("FATAL:", e?.message); process.exit(1); });
