"use strict";

const axios = require("axios");
const BASE = "http://127.0.0.1:3000";
const DRIVER_PHONE = "+251922112480";
const DRIVER_ROLE = 2;
const OTP = 101010;

const log = (...args) => console.log(new Date().toISOString().slice(11, 19), ...args);

const main = async () => {
  await axios.post(BASE + "/api/user/loginUser", {
    phoneNumber: DRIVER_PHONE,
    roleId: DRIVER_ROLE,
  }).catch(e => log("login err:", e?.response?.data?.error?.message || e?.message));

  const res = await axios.post(BASE + "/api/user/verifyUserByOTP", {
    phoneNumber: DRIVER_PHONE,
    OTP,
    roleId: DRIVER_ROLE,
  });
  const token = res.data.token;
  log("token acquired:", !!token);

  const pos = await axios.get(BASE + "/api/queue/driver/myPosition", {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(e => ({ data: { error: e?.response?.data?.error?.message || e?.message } }));
  log("myPosition:", JSON.stringify(pos.data?.data));

  const st = await axios.get(BASE + "/api/driver/verifyDriverJourneyStatus", {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(e => ({ data: { error: e?.response?.data?.error?.message || e?.message } }));
  const d = st.data;
  log("verify status:", d?.status);
  log("  decisionBy:", d?.decision?.decisionBy ?? d?.decisions?.decisionBy ?? null);
  log("  queue field:", JSON.stringify(d?.queue));
  log("  shipper.queueOrganizationUniqueId:", d?.shipper?.queueOrganizationUniqueId ?? null);
  log("  journey:", JSON.stringify(d?.journey)?.slice(0, 200));
  log("  driver.journeyStatusId:", d?.driver?.driver?.journeyStatusId ?? null);
  log("  activeRequestGuard:", d?.driver?.driver?.activeRequestGuard ?? null);
};

main().catch(e => { console.error("FATAL:", e?.message); process.exit(1); });
