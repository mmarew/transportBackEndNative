/**
 * Seed Test Users Script
 * Run: node seedTestUsers.js
 *
 * This will insert:
 * - 50 test DRIVER users (roleId: 2) with Documents and Vehicles
 * - 40 test PASSENGER users (roleId: 1) without Documents and Vehicles
 */

// Load environment variables FIRST
require("dotenv").config();

const { pool } = require("./Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcryptjs");

// Placeholder image URL for test documents
const PLACEHOLDER_IMAGE_URL =
  "https://id.gov.et/static/media/id-card.9eff61c2730a160fea81.png";

// Ethiopian first and last names for generating test users
const firstNames = [
  "Abebe",
  "Bekele",
  "Chala",
  "Dawit",
  "Ermias",
  "Fikadu",
  "Girma",
  "Habtamu",
  "Ibrahim",
  "Jemal",
  "Kidus",
  "Lemma",
  "Mekonnen",
  "Negash",
  "Osman",
  "Petros",
  "Robel",
  "Samuel",
  "Tadesse",
  "Usman",
  "Worku",
  "Yonas",
  "Zelalem",
  "Amanuel",
  "Biniam",
  "Daniel",
  "Ephrem",
  "Fasil",
  "Getachew",
  "Henok",
  "Iskinder",
  "Kaleab",
  "Liben",
  "Meron",
  "Natnael",
  "Paulos",
  "Rediet",
  "Solomon",
  "Tewodros",
  "Yared",
  "Abrham",
  "Biruk",
  "Dereje",
  "Endalkachew",
  "Fekadu",
  "Gebremedhin",
  "Haileselassie",
  "Ismail",
  "Jibril",
  "Kebede",
];

const lastNames = [
  "Kebede",
  "Tadesse",
  "Deressa",
  "Mekonnen",
  "Hailu",
  "Alemayehu",
  "Tesfaye",
  "Worku",
  "Mohammed",
  "Abdi",
  "Solomon",
  "Bekele",
  "Assefa",
  "Gebre",
  "Tsegaye",
  "Negash",
  "Desta",
  "Woldemariam",
  "Gebremedhin",
  "Tekle",
  "Belay",
  "Girma",
  "Haile",
  "Mengistu",
  "Alemu",
  "Demissie",
  "Wolde",
  "Gebru",
  "Asfaw",
  "Teshome",
];

const colors = [
  "White",
  "Blue",
  "Red",
  "Silver",
  "Black",
  "Green",
  "Yellow",
  "Orange",
  "Brown",
  "Gray",
  "Purple",
  "Beige",
  "Navy",
  "Maroon",
  "Teal",
];

// Generate 50 Drivers (roleId: 2) - phone numbers +251910000001 to +251950000001
const testDrivers = [];
for (let i = 1; i <= 50; i++) {
  const firstName = firstNames[i % firstNames.length];
  const lastName = lastNames[i % lastNames.length];
  const phoneNum = String(i + 9).padStart(2, "0"); // 10, 11, ... 59
  testDrivers.push({
    fullName: `${firstName} ${lastName}`,
    email: `driver${i}@test.com`,
    phoneNumber: `+2519${phoneNum}0000001`,
    licensePlate: `3-AA-${10000 + i}`,
    color: colors[i % colors.length],
    roleId: 2, // Driver
  });
}

// Generate 40 Passengers (roleId: 1) - phone numbers +251960000001 to +251999000001
const testPassengers = [];
for (let i = 1; i <= 40; i++) {
  const firstName = firstNames[(i + 30) % firstNames.length];
  const lastName = lastNames[(i + 10) % lastNames.length];
  const phoneNum = String(59 + i).padStart(2, "0"); // 60, 61, ... 99
  testPassengers.push({
    fullName: `${firstName} ${lastName}`,
    email: `passenger${i}@test.com`,
    phoneNumber: `+2519${phoneNum}0000001`,
    roleId: 1, // Passenger
  });
}

const driverRoleId = 2;
const passengerRoleId = 1;
const vehicleOwnerRoleId = 4;

// Helper function to check if user exists by phone or email
async function userExists(phoneNumber, email) {
  const [rows] = await pool.query(
    `SELECT userUniqueId FROM Users WHERE phoneNumber = ? OR email = ? LIMIT 1`,
    [phoneNumber, email]
  );
  return rows.length > 0;
}

async function seedTestUsers() {
  console.log("🚀 Starting to seed test users...\n");
  console.log("📊 Target: 50 Drivers + 40 Passengers = 90 Users Total\n");

  let driverSuccessCount = 0;
  let driverSkipCount = 0;
  let passengerSuccessCount = 0;
  let passengerSkipCount = 0;
  let documentCount = 0;
  let vehicleCount = 0;

  // Get required document types for drivers (roleId=2)
  const [requiredDocuments] = await pool.query(
    `SELECT rdr.documentTypeId, rdr.isExpirationDateRequired, rdr.isFileNumberRequired, 
            dt.documentTypeName
     FROM RoleDocumentRequirements rdr
     JOIN DocumentTypes dt ON rdr.documentTypeId = dt.documentTypeId
     WHERE rdr.roleId = ? AND rdr.roleDocumentRequirementDeletedAt IS NULL`,
    [driverRoleId]
  );

  console.log(
    `📄 Found ${requiredDocuments.length} required document types for drivers`
  );

  // Get a vehicle type (first available)
  const [vehicleTypes] = await pool.query(
    `SELECT vehicleTypeUniqueId, vehicleTypeName FROM VehicleTypes LIMIT 1`
  );

  if (!vehicleTypes.length) {
    console.log(
      "❌ No vehicle types found in database. Cannot create vehicles for drivers."
    );
    await pool.end();
    process.exit(1);
  }

  const vehicleTypeUniqueId = vehicleTypes[0].vehicleTypeUniqueId;
  console.log(`🚗 Using vehicle type: ${vehicleTypes[0].vehicleTypeName}\n`);

  // ============================================
  // SEED DRIVERS (50 users)
  // ============================================
  console.log("========== SEEDING DRIVERS (50) ==========\n");

  for (let i = 0; i < testDrivers.length; i++) {
    const user = testDrivers[i];
    const now = new Date();

    // Check if user already exists
    const exists = await userExists(user.phoneNumber, user.email);
    if (exists) {
      driverSkipCount++;
      console.log(
        `⚠️  [Driver ${i + 1}/50] Skipped (exists): ${user.fullName} (${
          user.phoneNumber
        })`
      );
      continue;
    }

    const userUniqueId = uuidv4();
    const credentialUniqueId = uuidv4();
    const userRoleUniqueId = uuidv4();
    const userRoleStatusUniqueId = uuidv4();
    const driverSubscriptionUniqueId = uuidv4();
    const driverBalanceUniqueId = uuidv4();

    // Generate OTP and hash it
    const OTP = Math.floor(100000 + Math.random() * 900000);
    const hashedOTP = await bcrypt.hash(String(OTP), 10);

    try {
      // 1. Insert User
      await pool.query(
        `INSERT INTO Users (userUniqueId, fullName, phoneNumber, email, createdAt, createdBy)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          userUniqueId,
          user.fullName,
          user.phoneNumber,
          user.email,
          now,
          "seed-script",
        ]
      );

      // 2. Insert Credential
      await pool.query(
        `INSERT INTO usersCredential (credentialUniqueId, userUniqueId, OTP, hashedPassword, usersCredentialCreatedAt)
         VALUES (?, ?, ?, ?, ?)`,
        [credentialUniqueId, userUniqueId, hashedOTP, hashedOTP, now]
      );

      // 3. Insert UserRole
      const [userRoleResult] = await pool.query(
        `INSERT INTO UserRole (userRoleUniqueId, userUniqueId, roleId, userRoleCreatedAt, userRoleCreatedBy)
         VALUES (?, ?, ?, ?, ?)`,
        [userRoleUniqueId, userUniqueId, driverRoleId, now, userUniqueId]
      );
      const insertedUserRoleId = userRoleResult.insertId;

      // 4. Insert UserRoleStatusCurrent (statusId=2 for drivers)
      await pool.query(
        `INSERT INTO UserRoleStatusCurrent (userRoleStatusUniqueId, userRoleStatusCreatedBy, userRoleId, userRoleStatusDescription, statusId, userRoleStatusCreatedAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          userRoleStatusUniqueId,
          userUniqueId,
          insertedUserRoleId,
          "Test driver user",
          2,
          now,
        ]
      );

      // 5. Get free subscription plan and create subscription
      const [freePlanRows] = await pool.query(
        `SELECT subscriptionPlanUniqueId FROM SubscriptionPlan WHERE isFree = TRUE LIMIT 1`
      );

      if (freePlanRows.length > 0) {
        const freePlanUniqueId = freePlanRows[0].subscriptionPlanUniqueId;
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + 30);

        // 6. Insert DriverBalance
        await pool.query(
          `INSERT INTO DriverBalance (driverBalanceUniqueId, userUniqueId, transactionType, transactionUniqueId, transactionTime, netBalance)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            driverBalanceUniqueId,
            userUniqueId,
            "Subscription",
            driverSubscriptionUniqueId,
            now,
            0,
          ]
        );

        // 7. Insert DriverSubscription
        await pool.query(
          `INSERT INTO DriverSubscription (driverSubscriptionUniqueId, driverUniqueId, subscriptionPlanUniqueId, startDate, endDate)
           VALUES (?, ?, ?, ?, ?)`,
          [
            driverSubscriptionUniqueId,
            userUniqueId,
            freePlanUniqueId,
            now,
            endDate,
          ]
        );
      }

      // 8. Insert Attached Documents for each required document type
      for (const doc of requiredDocuments) {
        const attachedDocumentUniqueId = uuidv4();
        const expirationDate = doc.isExpirationDateRequired
          ? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
          : null;
        const fileNumber = doc.isFileNumberRequired
          ? `FN-${Math.floor(100000 + Math.random() * 900000)}`
          : null;

        await pool.query(
          `INSERT INTO AttachedDocuments 
           (attachedDocumentUniqueId, userUniqueId, attachedDocumentDescription, 
            documentTypeId, documentExpirationDate, attachedDocumentAcceptance, 
            attachedDocumentName, attachedDocumentCreatedByUserId, 
            attachedDocumentFileNumber, attachedDocumentCreatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            attachedDocumentUniqueId,
            userUniqueId,
            `Test ${doc.documentTypeName} for ${user.fullName}`,
            doc.documentTypeId,
            expirationDate,
            "PENDING",
            PLACEHOLDER_IMAGE_URL,
            userUniqueId,
            fileNumber,
            now,
          ]
        );
        documentCount++;
      }

      // 9. Create Vehicle for driver
      const vehicleUniqueId = uuidv4();
      const vehicleStatusUniqueId = uuidv4();
      const ownershipUniqueId = uuidv4();
      const vehicleDriverUniqueId = uuidv4();

      // 9a. Insert Vehicle
      await pool.query(
        `INSERT INTO Vehicle (vehicleUniqueId, vehicleTypeUniqueId, licensePlate, color, vehicleCreatedBy, vehicleCreatedAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          vehicleUniqueId,
          vehicleTypeUniqueId,
          user.licensePlate,
          user.color,
          userUniqueId,
          now,
        ]
      );

      // 9b. Insert VehicleStatus (active = VehicleStatusTypeId 1)
      await pool.query(
        `INSERT INTO VehicleStatus (vehicleStatusUniqueId, vehicleUniqueId, VehicleStatusTypeId, statusStartDate, statusEndDate)
         VALUES (?, ?, ?, ?, ?)`,
        [vehicleStatusUniqueId, vehicleUniqueId, 1, now, null]
      );

      // 9c. Insert VehicleOwnership (driver is owner, roleId = 4)
      await pool.query(
        `INSERT INTO VehicleOwnership (ownershipUniqueId, vehicleUniqueId, userUniqueId, roleId, ownershipStartDate, ownershipEndDate)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          ownershipUniqueId,
          vehicleUniqueId,
          userUniqueId,
          vehicleOwnerRoleId,
          now,
          null,
        ]
      );

      // 9d. Insert VehicleDriver (assign driver to vehicle)
      await pool.query(
        `INSERT INTO VehicleDriver (vehicleDriverUniqueId, vehicleUniqueId, driverUserUniqueId, assignmentStatus, assignmentStartDate, assignmentEndDate)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          vehicleDriverUniqueId,
          vehicleUniqueId,
          userUniqueId,
          "active",
          now,
          null,
        ]
      );

      vehicleCount++;
      driverSuccessCount++;
      console.log(
        `✅ [Driver ${i + 1}/50] Created: ${user.fullName} (${
          user.phoneNumber
        }) - OTP: ${OTP} - Vehicle: ${user.licensePlate}`
      );
    } catch (error) {
      driverSkipCount++;
      console.log(
        `❌ [Driver ${i + 1}/50] Failed: ${user.fullName} - ${error.message}`
      );
    }
  }

  // ============================================
  // SEED PASSENGERS (40 users)
  // ============================================
  console.log("\n========== SEEDING PASSENGERS (40) ==========\n");

  for (let i = 0; i < testPassengers.length; i++) {
    const user = testPassengers[i];
    const now = new Date();

    // Check if user already exists
    const exists = await userExists(user.phoneNumber, user.email);
    if (exists) {
      passengerSkipCount++;
      console.log(
        `⚠️  [Passenger ${i + 1}/40] Skipped (exists): ${user.fullName} (${
          user.phoneNumber
        })`
      );
      continue;
    }

    const userUniqueId = uuidv4();
    const credentialUniqueId = uuidv4();
    const userRoleUniqueId = uuidv4();
    const userRoleStatusUniqueId = uuidv4();

    // Generate OTP and hash it
    const OTP = Math.floor(100000 + Math.random() * 900000);
    const hashedOTP = await bcrypt.hash(String(OTP), 10);

    try {
      // 1. Insert User
      await pool.query(
        `INSERT INTO Users (userUniqueId, fullName, phoneNumber, email, createdAt, createdBy)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          userUniqueId,
          user.fullName,
          user.phoneNumber,
          user.email,
          now,
          "seed-script",
        ]
      );

      // 2. Insert Credential
      await pool.query(
        `INSERT INTO usersCredential (credentialUniqueId, userUniqueId, OTP, hashedPassword, usersCredentialCreatedAt)
         VALUES (?, ?, ?, ?, ?)`,
        [credentialUniqueId, userUniqueId, hashedOTP, hashedOTP, now]
      );

      // 3. Insert UserRole (Passenger roleId = 1)
      const [userRoleResult] = await pool.query(
        `INSERT INTO UserRole (userRoleUniqueId, userUniqueId, roleId, userRoleCreatedAt, userRoleCreatedBy)
         VALUES (?, ?, ?, ?, ?)`,
        [userRoleUniqueId, userUniqueId, passengerRoleId, now, userUniqueId]
      );
      const insertedUserRoleId = userRoleResult.insertId;

      // 4. Insert UserRoleStatusCurrent (statusId=1 for passengers - active)
      await pool.query(
        `INSERT INTO UserRoleStatusCurrent (userRoleStatusUniqueId, userRoleStatusCreatedBy, userRoleId, userRoleStatusDescription, statusId, userRoleStatusCreatedAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          userRoleStatusUniqueId,
          userUniqueId,
          insertedUserRoleId,
          "Test passenger user",
          1,
          now,
        ]
      );

      // NO documents or vehicles for passengers

      passengerSuccessCount++;
      console.log(
        `✅ [Passenger ${i + 1}/40] Created: ${user.fullName} (${
          user.phoneNumber
        }) - OTP: ${OTP}`
      );
    } catch (error) {
      passengerSkipCount++;
      console.log(
        `❌ [Passenger ${i + 1}/40] Failed: ${user.fullName} - ${error.message}`
      );
    }
  }

  // ============================================
  // SUMMARY
  // ============================================
  console.log("\n==========================================");
  console.log("              SUMMARY                     ");
  console.log("==========================================");
  console.log(`🚗 Drivers Created:     ${driverSuccessCount}/50`);
  console.log(`📄 Documents Attached:  ${documentCount}`);
  console.log(`🚙 Vehicles Created:    ${vehicleCount}`);
  console.log(`⚠️  Drivers Skipped:     ${driverSkipCount}`);
  console.log("------------------------------------------");
  console.log(`👤 Passengers Created:  ${passengerSuccessCount}/40`);
  console.log(`⚠️  Passengers Skipped:  ${passengerSkipCount}`);
  console.log("------------------------------------------");
  console.log(
    `✅ TOTAL Created:       ${driverSuccessCount + passengerSuccessCount}/90`
  );
  console.log(
    `⚠️  TOTAL Skipped:       ${driverSkipCount + passengerSkipCount}`
  );
  console.log("==========================================\n");

  // Close connection
  await pool.end();
  console.log("🔌 Database connection closed.");
  process.exit(0);
}

// Run the script
seedTestUsers().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
