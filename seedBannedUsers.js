/**
 * Seed Banned Users Script
 * Run: node seedBannedUsers.js
 *
 * This will insert:
 * - 15 BANNED DRIVER users (roleId: 2) with Documents and Vehicles
 * - 15 BANNED PASSENGER users (roleId: 1) without Documents and Vehicles
 *
 * Each banned user has:
 * - UserRoleStatusCurrent.statusId = 6 (Banned)
 * - UserDelinquency record
 * - BannedUsers record (isActive = true)
 */

// Load environment variables FIRST
require("dotenv").config();

const { pool } = require("./Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcryptjs");

// Placeholder image URL for test documents
const PLACEHOLDER_IMAGE_URL =
  "https://id.gov.et/static/media/id-card.9eff61c2730a160fea81.png";

// Ethiopian names for banned users
const driverFirstNames = [
  "Tesfaye",
  "Alemayehu",
  "Mulugeta",
  "Getachew",
  "Teshome",
  "Workneh",
  "Kebede",
  "Assefa",
  "Belay",
  "Demissie",
  "Girma",
  "Hailu",
  "Tadesse",
  "Negash",
  "Wolde",
];

const driverLastNames = [
  "Abera",
  "Bekele",
  "Chane",
  "Dagne",
  "Eshetu",
  "Feyisa",
  "Gebre",
  "Hailemariam",
  "Ibrahim",
  "Jemberu",
  "Kassa",
  "Lemma",
  "Mesfin",
  "Nigussie",
  "Oljira",
];

const shipperFirstNames = [
  "Mekdes",
  "Tigist",
  "Almaz",
  "Rahel",
  "Sara",
  "Hana",
  "Bezawit",
  "Mahlet",
  "Selamawit",
  "Yodit",
  "Aster",
  "Birtukan",
  "Chaltu",
  "Dinknesh",
  "Eden",
];

const shipperLastNames = [
  "Alemu",
  "Berhanu",
  "Degu",
  "Fikre",
  "Gizaw",
  "Habtamu",
  "Jemal",
  "Kassahun",
  "Legesse",
  "Mengesha",
  "Negussie",
  "Petros",
  "Reta",
  "Solomon",
  "Tefera",
];

const colors = [
  "White",
  "Silver",
  "Black",
  "Blue",
  "Red",
  "Green",
  "Gray",
  "Brown",
  "Yellow",
  "Orange",
  "Navy",
  "Maroon",
  "Beige",
  "Teal",
  "Purple",
];

// Ban reasons for variety
const driverBanReasons = [
  "Multiple complaints from shippers about rude behavior",
  "Repeated late arrivals to pickup locations",
  "Unsafe driving reported by multiple shippers",
  "Failure to complete accepted journeys",
  "Violation of platform terms of service",
  "Inappropriate behavior towards shippers",
  "Multiple cancellations without valid reason",
  "Fraudulent activity detected",
  "Vehicle condition not meeting standards",
  "Document verification issues",
  "Repeated traffic violations during trips",
  "Overcharging shippers",
  "Refusal to take shippers to destination",
  "Operating under influence suspicion",
  "Multiple negative ratings from shippers",
];

const shipperBanReasons = [
  "Multiple complaints from drivers about rude behavior",
  "Repeated no-shows after booking",
  "Payment fraud detected",
  "Harassment of drivers reported",
  "Violation of platform terms of service",
  "Inappropriate behavior towards drivers",
  "Multiple cancellations without valid reason",
  "False complaints against drivers",
  "Damaging driver's vehicle",
  "Threatening behavior reported",
  "Refusal to pay for completed journey",
  "Multiple negative ratings from drivers",
  "Providing false information",
  "Abusive language towards drivers",
  "Smoking/drinking in vehicle despite warnings",
];

// Generate 15 Banned Drivers - unique phone pattern: +251800100001 to +251815000001
const bannedDrivers = [];
for (let i = 1; i <= 15; i++) {
  const firstName = driverFirstNames[i - 1];
  const lastName = driverLastNames[i - 1];
  bannedDrivers.push({
    fullName: `${firstName} ${lastName}`,
    email: `banned.driver${i}@test.com`,
    phoneNumber: `+2518${String(i).padStart(2, "0")}000001`, // +251801000001 to +251815000001
    licensePlate: `3-AA-${30000 + i}`,
    color: colors[i - 1],
    banReason: driverBanReasons[i - 1],
  });
}

// Generate 15 Banned Passengers - unique phone pattern: +251816000001 to +251830000001
const bannedPassengers = [];
for (let i = 1; i <= 15; i++) {
  const firstName = shipperFirstNames[i - 1];
  const lastName = shipperLastNames[i - 1];
  bannedPassengers.push({
    fullName: `${firstName} ${lastName}`,
    email: `banned.shipper${i}@test.com`,
    phoneNumber: `+2518${String(15 + i).padStart(2, "0")}000001`, // +251816000001 to +251830000001
    banReason: shipperBanReasons[i - 1],
  });
}

const driverRoleId = 2;
const shipperRoleId = 1;
const vehicleOwnerRoleId = 4;
const bannedStatusId = 6; // Banned status

// Helper function to check if user exists by phone or email
async function userExists(phoneNumber, email) {
  const [rows] = await pool.query(
    `SELECT userUniqueId FROM Users WHERE phoneNumber = ? OR email = ? LIMIT 1`,
    [phoneNumber, email],
  );
  return rows.length > 0;
}

async function seedBannedUsers() {
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

  // Get delinquency types for drivers and shippers
  const [driverDelinquencyTypes] = await pool.query(
    `SELECT delinquencyTypeUniqueId, delinquencyTypeName, defaultPoints, defaultSeverity 
     FROM DelinquencyTypes WHERE applicableRoles = (SELECT roleUniqueId FROM Roles WHERE roleId = ?) AND isActive = 1`,
    [driverRoleId],
  );

  const [shipperDelinquencyTypes] = await pool.query(
    `SELECT delinquencyTypeUniqueId, delinquencyTypeName, defaultPoints, defaultSeverity 
     FROM DelinquencyTypes WHERE applicableRoles = (SELECT roleUniqueId FROM Roles WHERE roleId = ?) AND isActive = 1`,
    [shipperRoleId],
  );

  // If no specific delinquency types, get any available
  let driverDelinquencyType = driverDelinquencyTypes[0];
  let shipperDelinquencyType = shipperDelinquencyTypes[0];

  if (!driverDelinquencyType) {
    const [anyType] = await pool.query(
      `SELECT delinquencyTypeUniqueId, delinquencyTypeName, defaultPoints, defaultSeverity 
       FROM DelinquencyTypes WHERE isActive = 1 LIMIT 1`,
    );
    driverDelinquencyType = anyType[0];
  }

  if (!shipperDelinquencyType) {
    shipperDelinquencyType = driverDelinquencyType;
  }

  if (!driverDelinquencyType) {
    await pool.end();
    process.exit(1);
  }

  // Get a system/admin user to be the "bannedBy" user
  const [adminUsers] = await pool.query(
    `SELECT u.userUniqueId FROM Users u 
     INNER JOIN UserRole ur ON u.userUniqueId = ur.userUniqueId 
     WHERE ur.roleId IN (3, 6) LIMIT 1`,
  );

  let bannedByUserUniqueId = adminUsers[0]?.userUniqueId;

  // ============================================
  // SEED BANNED DRIVERS (15 users)
  // ============================================

  for (let i = 0; i < bannedDrivers.length; i++) {
    const driver = bannedDrivers[i];
    const now = currentDate();

    // Check if user already exists
    const exists = await userExists(driver.phoneNumber, driver.email);
    if (exists) {
      // Removed unused counter: driverSkipCount
      continue;
    }

    const userUniqueId = uuidv4();
    const credentialUniqueId = uuidv4();
    const userRoleUniqueId = uuidv4();
    const userRoleStatusUniqueId = uuidv4();
    const userSubscriptionUniqueId = uuidv4();
    const userBalanceUniqueId = uuidv4();
    const userDelinquencyUniqueId = uuidv4();
    const banUniqueId = uuidv4();

    // Use first created user as bannedBy if no admin exists
    if (!bannedByUserUniqueId) {
      bannedByUserUniqueId = userUniqueId;
    }

    // Generate OTP and hash it
    const OTP = Math.floor(100000 + Math.random() * 900000);
    const hashedOTP = await bcrypt.hash(String(OTP), 10);

    // Ban duration: 7, 30, or 90 days randomly
    const banDurations = [7, 30, 90];
    const banDurationDays = banDurations[i % 3];
    const banExpiresAt = new Date(now);
    banExpiresAt.setDate(banExpiresAt.getDate() + banDurationDays);

    try {
      // 1. Insert User
      await pool.query(
        `INSERT INTO Users (userUniqueId, fullName, phoneNumber, email, createdAt, createdBy)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          userUniqueId,
          driver.fullName,
          driver.phoneNumber,
          driver.email,
          now,
          "seed-banned-script",
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

      // 4. Insert UserRoleStatusCurrent with statusId = 6 (BANNED)
      await pool.query(
        `INSERT INTO UserRoleStatusCurrent (userRoleStatusUniqueId, userRoleStatusCreatedBy, userRoleId, userRoleStatusDescription, statusId, userRoleStatusCreatedAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          userRoleStatusUniqueId,
          bannedByUserUniqueId,
          insertedUserRoleId,
          `Banned: ${driver.banReason}`,
          bannedStatusId,
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

      // 8. Insert Attached Documents with ACCEPTED status
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
            `Verified ${doc.documentTypeName} for ${driver.fullName}`,
            doc.documentTypeId,
            expirationDate,
            "ACCEPTED",
            PLACEHOLDER_IMAGE_URL,
            userUniqueId,
            fileNumber,
            now,
          ],
        );
        // Removed unused variable: documentCount
      }

      // 9. Create Vehicle for driver
      const vehicleUniqueId = uuidv4();
      const vehicleStatusUniqueId = uuidv4();
      const ownershipUniqueId = uuidv4();
      const vehicleDriverUniqueId = uuidv4();

      await pool.query(
        `INSERT INTO Vehicle (vehicleUniqueId, vehicleTypeUniqueId, licensePlate, color, vehicleCreatedBy, vehicleCreatedAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          vehicleUniqueId,
          vehicleTypeUniqueId,
          driver.licensePlate,
          driver.color,
          userUniqueId,
          now,
        ],
      );

      await pool.query(
        `INSERT INTO VehicleStatus (vehicleStatusUniqueId, vehicleUniqueId, VehicleStatusTypeId, statusStartDate, statusEndDate)
         VALUES (?, ?, ?, ?, ?)`,
        [vehicleStatusUniqueId, vehicleUniqueId, 1, now, null],
      );

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

      await pool.query(
        `INSERT INTO VehicleDriver (vehicleDriverUniqueId, vehicleUniqueId, driverUserUniqueId, assignmentStatus, assignmentStartDate, assignmentEndDate)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          vehicleDriverUniqueId,
          vehicleUniqueId,
          userUniqueId,
          "inactive",
          now,
          null,
        ],
      );

      // Removed unused variable: vehicleCount

      // 10. Create UserDelinquency record
      await pool.query(
        `INSERT INTO UserDelinquency (userDelinquencyUniqueId, userRoleUniqueId, delinquencyTypeUniqueId, 
         delinquencyDescription, delinquencySeverity, delinquencyPoints, delinquencyCreatedAt, delinquencyCreatedBy)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userDelinquencyUniqueId,
          userRoleUniqueId,
          driverDelinquencyType.delinquencyTypeUniqueId,
          driver.banReason,
          driverDelinquencyType.defaultSeverity || "HIGH",
          driverDelinquencyType.defaultPoints || 10,
          now,
          bannedByUserUniqueId,
        ],
      );

      // 11. Create BannedUsers record
      await pool.query(
        `INSERT INTO BannedUsers (banUniqueId, userDelinquencyUniqueId, banAt, bannedBy, banReason, banDurationDays, banExpiresAt, isActive)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          banUniqueId,
          userDelinquencyUniqueId,
          now,
          bannedByUserUniqueId,
          driver.banReason,
          banDurationDays,
          banExpiresAt,
          true,
        ],
      );

      // Removed unused variable: driverSuccessCount
    } catch (error) {
      const logger = require("./Utils/logger");
      logger.error("Error seeding driver", {
        error: error.message,
        stack: error.stack,
      });
      // Removed unused variable: driverSkipCount
    }
  }

  // ============================================
  // SEED BANNED PASSENGERS (15 users)
  // ============================================

  for (let i = 0; i < bannedPassengers.length; i++) {
    const shipper = bannedPassengers[i];
    const now = currentDate();

    // Check if user already exists
    const exists = await userExists(shipper.phoneNumber, shipper.email);
    if (exists) {
      // Removed unused counter: shipperSkipCount
      continue;
    }

    const userUniqueId = uuidv4();
    const credentialUniqueId = uuidv4();
    const userRoleUniqueId = uuidv4();
    const userRoleStatusUniqueId = uuidv4();
    const userDelinquencyUniqueId = uuidv4();
    const banUniqueId = uuidv4();

    // Generate OTP and hash it
    const OTP = Math.floor(100000 + Math.random() * 900000);
    const hashedOTP = await bcrypt.hash(String(OTP), 10);

    // Ban duration: 7, 30, or 90 days randomly
    const banDurations = [7, 30, 90];
    const banDurationDays = banDurations[i % 3];
    const banExpiresAt = new Date(now);
    banExpiresAt.setDate(banExpiresAt.getDate() + banDurationDays);

    try {
      // 1. Insert User
      await pool.query(
        `INSERT INTO Users (userUniqueId, fullName, phoneNumber, email, createdAt, createdBy)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          userUniqueId,
          shipper.fullName,
          shipper.phoneNumber,
          shipper.email,
          now,
          "seed-banned-script",
        ],
      );

      // 2. Insert Credential
      await pool.query(
        `INSERT INTO usersCredential (credentialUniqueId, userUniqueId, OTP, hashedPassword, usersCredentialCreatedAt)
         VALUES (?, ?, ?, ?, ?)`,
        [credentialUniqueId, userUniqueId, hashedOTP, hashedOTP, now],
      );

      // 3. Insert UserRole (Passenger roleId = 1)
      const [userRoleResult] = await pool.query(
        `INSERT INTO UserRole (userRoleUniqueId, userUniqueId, roleId, userRoleCreatedAt, userRoleCreatedBy)
         VALUES (?, ?, ?, ?, ?)`,
        [userRoleUniqueId, userUniqueId, shipperRoleId, now, userUniqueId],
      );
      const insertedUserRoleId = userRoleResult.insertId;

      // 4. Insert UserRoleStatusCurrent with statusId = 6 (BANNED)
      await pool.query(
        `INSERT INTO UserRoleStatusCurrent (userRoleStatusUniqueId, userRoleStatusCreatedBy, userRoleId, userRoleStatusDescription, statusId, userRoleStatusCreatedAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          userRoleStatusUniqueId,
          bannedByUserUniqueId,
          insertedUserRoleId,
          `Banned: ${shipper.banReason}`,
          bannedStatusId,
          now,
        ],
      );

      // 5. Create UserDelinquency record
      await pool.query(
        `INSERT INTO UserDelinquency (userDelinquencyUniqueId, userRoleUniqueId, delinquencyTypeUniqueId, 
         delinquencyDescription, delinquencySeverity, delinquencyPoints, delinquencyCreatedAt, delinquencyCreatedBy)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userDelinquencyUniqueId,
          userRoleUniqueId,
          shipperDelinquencyType.delinquencyTypeUniqueId,
          shipper.banReason,
          shipperDelinquencyType.defaultSeverity || "HIGH",
          shipperDelinquencyType.defaultPoints || 10,
          now,
          bannedByUserUniqueId,
        ],
      );

      // 6. Create BannedUsers record
      await pool.query(
        `INSERT INTO BannedUsers (banUniqueId, userDelinquencyUniqueId, banAt, bannedBy, banReason, banDurationDays, banExpiresAt, isActive)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          banUniqueId,
          userDelinquencyUniqueId,
          now,
          bannedByUserUniqueId,
          shipper.banReason,
          banDurationDays,
          banExpiresAt,
          true,
        ],
      );

      // NO documents or   Vehicle for shippers

      // Removed unused variable: shipperSuccessCount
    } catch (error) {
      const logger = require("./Utils/logger");
      logger.error("Error seeding shipper", {
        error: error.message,
        stack: error.stack,
      });
      // Removed unused variable: shipperSkipCount
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
seedBannedUsers().catch((err) => {
  const logger = require("./Utils/logger");
  logger.error("Error in seedBannedUsers", {
    error: err.message,
    stack: err.stack,
  });
  process.exit(1);
});
