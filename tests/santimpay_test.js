#!/usr/bin/env node
/**
 * Test SantimPay Initiation
 * =========================
 */

"use strict";

const http  = require("http");
const https = require("https");
const Config = require("../Utils/Config");

const BASE_URL          = Config.APP_API_URL          || "http://localhost:3000";
const SUPER_ADMIN_PHONE = Config.SUPER_ADMIN.PHONE || "+251983222221";
const DEFAULT_OTP       = Config.TEST.OTP       || "101010";

const parsedBase = new URL(BASE_URL);
const transport  = parsedBase.protocol === "https:" ? https : http;

function request(method, path, body = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const headers = { "Content-Type": "application/json", ...extraHeaders };
    if (bodyStr) {headers["Content-Length"] = Buffer.byteLength(bodyStr);}

    const req = transport.request(
      {
        hostname: parsedBase.hostname,
        port    : parsedBase.port || (parsedBase.protocol === "https:" ? 443 : 80),
        path,
        method,
        headers,
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => { raw += c; });
        res.on("end",  () => {
          try   { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
          catch { resolve({ status: res.statusCode, body: raw }); }
        });
      },
    );
    req.on("error", reject);
    if (bodyStr) {req.write(bodyStr);}
    req.end();
  });
}

async function run() {
  console.log("\n\x1b[1m━━ Testing SantimPay Initiation ━━━━━━━━━━━━━━━\x1b[0m");

  try {
    // 1. Admin Login
    console.log("Logging in as Admin...");
    const loginRes = await request("POST", "/api/user/verifyUserByOTP", {
      phoneNumber: SUPER_ADMIN_PHONE,
      OTP: DEFAULT_OTP,
      roleId: 6
    });

    if (loginRes.status !== 200) {
      console.error("Login failed:", loginRes.status, loginRes.body);
      process.exit(1);
    }

    const token = loginRes.body.token;
    console.log("Login successful. Token obtained.");

    // 2. Initiate SantimPay
    console.log("Initiating SantimPay Payment...");
    const initiateRes = await request("POST", "/api/finance/userDeposit/initiateSantimPay", 
      { depositAmount: 10 }, 
      { Authorization: `Bearer ${token}` }
    );

    console.log("Response Status:", initiateRes.status);
    console.log("Response Body:", JSON.stringify(initiateRes.body, null, 2));

    if (initiateRes.status === 200) {
      console.log("\n\x1b[32m\x1b[1m✅ INITIATION SUCCESSFUL!\x1b[0m");
    } else {
      console.log("\n\x1b[31m\x1b[1m❌ INITIATION FAILED\x1b[0m");
    }

  } catch (err) {
    console.error("\n\x1b[31m\x1b[1m💥 TEST FAILED\x1b[0m", err);
    process.exit(1);
  }
}

run();
