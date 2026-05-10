#!/usr/bin/env node
/**
 * Profile Photo Update Test
 * =========================
 * Specifically tests the multipart/form-data upload of a profile photo
 * including Joi validation preservation and local storage.
 */

"use strict";

require("dotenv").config();
const path = require("path");
const request = require("supertest");
const {
  setup,
  auth,
  test,
  assert,
  printResults,
  BASE_URL,
} = require("./testHelper");

const state = {
  userUniqueId: null,
  token: null,
  testImagePath: path.join(__dirname, "test_image.jpg"),
};

(async () => {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║  Profile Photo Update Test Suite             ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  // 1. Setup Admin Auth
  await setup();

  // 2. Create a test user first (to have someone to update)
  await test("Create Test User for Photo Update", async () => {
    const phoneNumber = `+2519${Math.floor(10000000 + Math.random() * 90000000)}`;
    const res = await request(BASE_URL)
      .post("/api/user/createUser")
      .send({
        fullName: "Photo Test User",
        phoneNumber: phoneNumber,
        email: `photo_test_${Date.now()}@example.com`,
        roleId: 1, // Shipper
      });

    assert(res.body?.message === "success", "Failed to create test user");
    state.userUniqueId = res.body?.data?.userUniqueId;
    return `User created: ${state.userUniqueId}`;
  });

  // 3. Test Profile Photo Upload (Multipart)
  await test("Update User Profile Photo (Multipart/Form-Data)", async () => {
    assert(state.userUniqueId, "No userUniqueId available");

    // Using Supertest .attach() for file upload
    const res = await request(BASE_URL)
      .put(`/api/user/updateUser/${state.userUniqueId}`)
      .set(auth()) // Use Admin token
      .attach("profilePhoto", state.testImagePath) // The binary file
      .field("ProfilePhotoDescription", "Test Profile Photo Upload")
      .field("fullName", "Updated Photo Name");

    if (res.status !== 200) {
      throw new Error(
        `Upload failed with status ${res.status}: ${JSON.stringify(res.body)}`,
      );
    }

    assert(res.body?.message === "success", "Response message was not success");

    // Check if the URL returned in a subsequent fetch or if it confirms success
    return "Profile photo uploaded and processed via Validator + Multer";
  });

  // 4. Verify the link is correct (No double /uploads/uploads/)
  await test("Verify No Double Path in URL", async () => {
    const res = await request(BASE_URL)
      .get(`/api/user/attachedDocuments?userUniqueId=${state.userUniqueId}`)
      .set(auth());

    const documents = res.body?.data?.documents || [];
    const photoDoc = documents.find((d) => String(d.documentTypeId) === "4");

    assert(photoDoc, "Profile photo document not found for user");
    const url = photoDoc.attachedDocumentName;

    console.log(`\n    Generated URL: ${url}`);

    assert(
      !url.includes("/uploads/uploads/"),
      "CRITICAL: Double /uploads/ path detected!",
    );
    assert(url.startsWith("http"), `URL should start with http, got: ${url}`);

    return "URL path is correctly formatted (Single /uploads/)";
  });

  printResults("Profile Photo Test Results");
  process.exit(0);
})();
