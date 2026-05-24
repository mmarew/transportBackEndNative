
const { currentDate } = require("./Utils/CurrentDate");
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
    phoneNumber: `+2519${phoneNum}000001`,
    licensePlate: `3-AA-${10000 + i}`,
    color: colors[i % colors.length],
    roleId: 2, // Driver
  });
}

// Generate 40 Shippers (roleId: 1) - phone numbers +251960000001 to +251999000001
const testShippers = [];
for (let i = 1; i <= 40; i++) {
  const firstName = firstNames[(i + 30) % firstNames.length];
  const lastName = lastNames[(i + 10) % lastNames.length];
  const phoneNum = String(59 + i).padStart(2, "0"); // 60, 61, ... 99
  testShippers.push({
    fullName: `${firstName} ${lastName}`,
    email: `shipper${i}@test.com`,
    phoneNumber: `+2519${phoneNum}000001`,
    roleId: 1, // Shipper
  });
}

const driverRoleId = 2;
const shipperRoleId = 1;
const vehicleOwnerRoleId = 4;

// Helper function to check if user exists by phone or email
async function userExists(phoneNumber, email) {
  const [rows] = await pool.query(
    `SELECT userUniqueId FROM Users WHERE phoneNumber = ? OR email = ? LIMIT 1`,
    [phoneNumber, email],
  );
  return rows.length > 0;
}

async function seedTestUsers() {
  // Removed unused counters: driverSuccessCount, driverSkipCount, shipperSuccessCount, shipperSkipCount, documentCount, vehicleCount

  // Get required document types for drivers (roleId=2)
  const [requiredDocuments] = await pool.query(
    `SELECT rdr.documentTypeId, rdr.isExpirationDateRequired, rdr.isFileNumberRequired, 
            dt.documentTypeName
     FROM RoleDocumentRequirements rdr
     JOIN DocumentTypes dt ON rdr.documentTypeId = dt.documentTypeId
     WHERE rdr.roleId = ? AND rdr.roleDocumentRequirementDeletedAt IS NULL`,
    [driverRoleId],
  );

  // Get a vehicle type (first available)
  const [vehicleTypes] = await pool.query(
    `SELECT vehicleTypeUniqueId, vehicleTypeName FROM VehicleTypes LIMIT 1`,
  );
  if (!vehicleTypes.length) {
    await pool.end();
    process.exit(1);
  }

  const vehicleTypeUniqueId = vehicleTypes[0].vehicleTypeUniqueId;

  // ============================================
  // SEED DRIVERS (50 users)
  // ============================================

  for (let i = 0; i < testDrivers.length; i++) {
    const user = testDrivers[i];
    const now = currentDate();

    // Check if user already exists
    const exists = await userExists(user.phoneNumber, user.email);
    if (exists) {
      // Removed unused counter increment: driverSkipCount++
      continue;
    }

    const userUniqueId = uuidv4();
    const credentialUniqueId = uuidv4();
    const userRoleUniqueId = uuidv4();
    const userRoleStatusUniqueId = uuidv4();
    const userSubscriptionUniqueId = uuidv4();
    const userBalanceUniqueId = uuidv4();

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
        ],
      );

      // 2. Insert Credential
      await pool.query(
        `INSERT INTO usersCredential (credentialUniqueId, userUniqueId, OTP, hashedPassword, usersCredentialCreatedAt)
         VALUES (?, ?, ?, ?, ?)`,
        [credentialUniqueId, userUniqueId, hashedOTP, hashedOTP, now],
      );

      // 3. Insert UserRole
      const [userRoleResult] = await pool.query(
        `INSERT INTO UserRole (userRoleUniqueId, userUniqueId, roleId, userRoleCreatedAt, userRoleCreatedBy)
         VALUES (?, ?, ?, ?, ?)`,
        [userRoleUniqueId, userUniqueId, driverRoleId, now, userUniqueId],
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
        ],
      );

      // 5. Get free subscription plan and create subscription
      const [freePlanRows] = await pool.query(
        `SELECT subscriptionPlanUniqueId FROM SubscriptionPlan WHERE isFree = TRUE LIMIT 1`,
      );
      if (freePlanRows.length > 0) {
        const freePlanUniqueId = freePlanRows[0].subscriptionPlanUniqueId;
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + 30);

        // 6. Insert userBalance
        await pool.query(
          `INSERT INTO UserBalance (userBalanceUniqueId, userUniqueId, transactionType, transactionUniqueId, transactionTime, netBalance)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            userBalanceUniqueId,
            userUniqueId,
            "Subscription",
            userSubscriptionUniqueId,
            now,
            0,
          ],
        );

        // 7. Insert userSubscription
        await pool.query(
          `INSERT INTO UserSubscription (userSubscriptionUniqueId, driverUniqueId, subscriptionPlanUniqueId, startDate, endDate)
           VALUES (?, ?, ?, ?, ?)`,
          [
            userSubscriptionUniqueId,
            userUniqueId,
            freePlanUniqueId,
            now,
            endDate,
          ],
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
          ],
        );
        // Removed unused counter increment: documentCount++
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
        ],
      );

      // 9b. Insert VehicleStatus (active = VehicleStatusTypeId 1)
      await pool.query(
        `INSERT INTO VehicleStatus (vehicleStatusUniqueId, vehicleUniqueId, VehicleStatusTypeId, statusStartDate, statusEndDate)
         VALUES (?, ?, ?, ?, ?)`,
        [vehicleStatusUniqueId, vehicleUniqueId, 1, now, null],
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
        ],
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
        ],
      );

      // Removed unused counter increments: vehicleCount++, driverSuccessCount++
    } catch (error) {
      const logger = require("./Utils/logger");
      logger.error("Error seeding driver", {
        error: error.message,
        stack: error.stack,
      });
      // Removed unused counter increment: driverSkipCount++
    }
  }

  // ============================================
  // SEED PASSENGERS (40 users)
  // ============================================

  for (let i = 0; i < testShippers.length; i++) {
    const user = testShippers[i];
    const now = currentDate();

    // Check if user already exists
    const exists = await userExists(user.phoneNumber, user.email);
    if (exists) {
      // Removed unused counter increment: shipperSkipCount++
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
        ],
      );

      // 2. Insert Credential
      await pool.query(
        `INSERT INTO usersCredential (credentialUniqueId, userUniqueId, OTP, hashedPassword, usersCredentialCreatedAt)
         VALUES (?, ?, ?, ?, ?)`,
        [credentialUniqueId, userUniqueId, hashedOTP, hashedOTP, now],
      );

      // 3. Insert UserRole (Shipper roleId = 1)
      const [userRoleResult] = await pool.query(
        `INSERT INTO UserRole (userRoleUniqueId, userUniqueId, roleId, userRoleCreatedAt, userRoleCreatedBy)
         VALUES (?, ?, ?, ?, ?)`,
        [userRoleUniqueId, userUniqueId, shipperRoleId, now, userUniqueId],
      );
      const insertedUserRoleId = userRoleResult.insertId;

      // 4. Insert UserRoleStatusCurrent (statusId=1 for shippers - active)
      await pool.query(
        `INSERT INTO UserRoleStatusCurrent (userRoleStatusUniqueId, userRoleStatusCreatedBy, userRoleId, userRoleStatusDescription, statusId, userRoleStatusCreatedAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          userRoleStatusUniqueId,
          userUniqueId,
          insertedUserRoleId,
          "Test shipper user",
          1,
          now,
        ],
      );

      // NO documents or   Vehicle for shippers

      // Removed unused counter increment: shipperSuccessCount++
    } catch (error) {
      const logger = require("./Utils/logger");
      logger.error("Error seeding shipper", {
        error: error.message,
        stack: error.stack,
      });
      // Removed unused counter increment: shipperSkipCount++
    }
  }

  // ============================================
  // SUMMARY
  // ============================================

  // Close connection
  await pool.end();
  process.exit(0);
}

// Run the script
seedTestUsers().catch((err) => {
  const logger = require("./Utils/logger");
  logger.error("Error in seedTestUsers", {
    error: err.message,
    stack: err.stack,
  });
  process.exit(1);
});
