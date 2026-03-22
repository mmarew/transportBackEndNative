#!/usr/bin/env node
/**
 * Identity Verification Flow Test Suite
 * Tests:
 * 1. Placeholder email generation
 * 2. Placeholder-to-real email upgrade
 * 3. Independent OTP/Link generation (Rule 2 & 4)
 * 4. Channel-specific verification (Rule 2)
 * 5. Unified OTP mode (Rule 4)
 */

"use strict";

require("dotenv").config();
const { setup, request, test, assert, printResults } = require("./testHelper");
const { pool } = require("../Middleware/Database.config");
const bcrypt = require("bcryptjs");

const state = {
  phoneNumber: `+2519${Math.floor(10000000 + Math.random() * 90000000)}`,
  realEmail: `verify_test_${Date.now()}@example.com`,
  placeholderEmail: null,
  userUniqueId: null,
  phoneOTP_raw: null,
  emailToken: null,
};

(async () => {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║  Identity Verification Flow Tests            ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  await setup();

  // Test 1: Placeholder Email Generation
  await test("Create User (Phone only) -> Placeholder Email", async () => {
    state.placeholderEmail = `${state.phoneNumber}@dynamics.com`;
    const res = await request("POST", "/api/user/createUser", {
      fullName: "Test Verification User",
      phoneNumber: state.phoneNumber,
      roleId: 2,
    });
    
    if (res.body?.message !== "success") {
      console.log("DEBUG [01]:", res.status, JSON.stringify(res.body, null, 2));
    }
    assert(res.body?.message === "success", "Failed to create user with phone only");
    state.userUniqueId = res.body?.data?.userUniqueId;
    
    // Check DB for email
    const [rows] = await pool.query("SELECT email, isPhoneVerified, isEmailVerified FROM Users WHERE userUniqueId = ?", [state.userUniqueId]);
    assert(rows[0].email === state.placeholderEmail, `Email should be placeholder, got ${rows[0].email}`);
    assert(rows[0].isPhoneVerified === 0, "isPhoneVerified should be 0");
    assert(rows[0].isEmailVerified === 0, "isEmailVerified should be 0");
    
    return `Placeholder created: ${rows[0].email}`;
  });

  // Test 2: Placeholder-to-Real Email Upgrade
  await test("Create User (Same Phone + Real Email) -> Upgrade Placeholder", async () => {
    const res = await request("POST", "/api/user/createUser", {
      fullName: "Test Verification User",
      phoneNumber: state.phoneNumber,
      email: state.realEmail,
      roleId: 2,
    });

    assert(res.body?.message === "success", "Upgrade request failed");
    
    // Check DB for updated email
    const [rows] = await pool.query("SELECT email FROM Users WHERE userUniqueId = ?", [state.userUniqueId]);
    assert(rows[0].email === state.realEmail, `Email should be upgraded to ${state.realEmail}, got ${rows[0].email}`);
    
    return `Upgraded to: ${rows[0].email}`;
  });

  // Test 3: Independent OTP/Link Generation
  await test("Verify Independent phoneOTP (SMS) and emailToken (Link)", async () => {
    // We need to fetch the tokens from the DB (simulating checking SMS/Email)
    const [rows] = await pool.query("SELECT phoneOTP, emailOTP, emailVerificationToken FROM usersCredential WHERE userUniqueId = ?", [state.userUniqueId]);
    const cred = rows[0];
    
    assert(cred.phoneOTP, "phoneOTP missing");
    assert(cred.emailVerificationToken, "emailVerificationToken missing");
    assert(cred.emailOTP === null || cred.emailOTP === undefined, "emailOTP should be null for unverified email");
    
    state.emailToken = cred.emailVerificationToken;
    return "Verified independent generation (phoneOTP exists, emailOTP is null)";
  });

  // Test 4: Channel-Specific Verification (Phone)
  await test("Verify Phone via OTP -> isPhoneVerified = 1, isEmailVerified = 0", async () => {
    // Since we don't know the raw phoneOTP, let's manually hash '112233' into phoneOTP column
    const rawOtp = "112233";
    const hashed = await bcrypt.hash(rawOtp, 10);
    await pool.query("UPDATE usersCredential SET phoneOTP = ? WHERE userUniqueId = ?", [hashed, state.userUniqueId]);
    
    const res = await request("POST", "/api/user/verifyUserByOTP", {
      phoneNumber: state.phoneNumber,
      OTP: rawOtp,
      roleId: 2
    });
    
    assert(res.body?.message === "success", "Phone verification failed");
    
    const [rows] = await pool.query("SELECT isPhoneVerified, isEmailVerified FROM Users WHERE userUniqueId = ?", [state.userUniqueId]);
    assert(rows[0].isPhoneVerified === 1, "isPhoneVerified should be 1");
    assert(rows[0].isEmailVerified === 0, "isEmailVerified should still be 0");
    
    return "PhoneVerified=1, EmailVerified=0";
  });

  // Test 5: Channel-Specific Verification (Email Link)
  await test("Verify Email via Link -> isEmailVerified = 1", async () => {
    const res = await request("GET", `/api/user/verify-email?token=${state.emailToken}`);
    assert(res.status === 200, "Email verification link failed");
    
    const [rows] = await pool.query("SELECT isEmailVerified FROM Users WHERE userUniqueId = ?", [state.userUniqueId]);
    assert(rows[0].isEmailVerified === 1, "isEmailVerified should be 1");
    
    return "EmailVerified=1";
  });

  // Test 6: Unified OTP Mode (Both Verified)
  await test("Login (Both Verified) -> Send same OTP to both", async () => {
    // Hit createUser again to trigger a new login OTP session
    await request("POST", "/api/user/createUser", {
      fullName: "Test Verification User",
      phoneNumber: state.phoneNumber,
      roleId: 2
    });
    
    const [rows] = await pool.query("SELECT OTP, phoneOTP, emailOTP FROM usersCredential WHERE userUniqueId = ?", [state.userUniqueId]);
    const cred = rows[0];
    
    assert(cred.phoneOTP === cred.emailOTP, `In unified mode, phoneOTP (${cred.phoneOTP}) and emailOTP (${cred.emailOTP}) should match`);
    assert(cred.phoneOTP === cred.OTP, "Unified OTP should match legacy OTP column");
    
    return "Unified OTP confirmed for both channels";
  });

  printResults("Identity Verification Flow");
})();
