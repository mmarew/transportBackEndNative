/**
 * Seed Offline Drivers Script
 * Run: node seedOfflineDrivers.js
 *
 * This will insert 15 OFFLINE driver users with:
 * - UserRoleStatusCurrent.statusId = 1 (Active)
 * - AttachedDocuments with acceptance = 'ACCEPTED'
 * - Complete Vehicle setup (Vehicle, VehicleStatus, VehicleOwnership, VehicleDriver)
 * - NO DriverRequest record (this makes them offline)
 */

// Load environment variables FIRST
require("dotenv").config();

const { pool } = require("./Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcryptjs");
const { usersRoles, USER_STATUS } = require("./Utils/ListOfSeedData");

// Placeholder image URL for test documents
const PLACEHOLDER_IMAGE_URL =
  "https://id.gov.et/static/media/id-card.9eff61c2730a160fea81.png";

// Ethiopian names for offline drivers
const firstNames = [
  "Tewodros",
  "Yonatan",
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
];

const lastNames = [
  "Gebremedhin",
  "Haileselassie",
  "Ismail",
  "Jibril",
  "Kebede",
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

// Generate 15 Offline Drivers - using unique phone pattern
// seedTestUsers.js uses: +251910000001 to +251959000001 (drivers) and +251960000001 to +251999000001 (shippers)
// seedOnlineDrivers.js uses: +251901000001 to +251915000001
// We use: +251700100001 to +251715000001 (completely different pattern)
const offlineDrivers = [];
for (let i = 1; i <= 15; i++) {
  const firstName = firstNames[i - 1];
  const lastName = lastNames[i - 1];
  offlineDrivers.push({
    fullName: `${firstName} ${lastName}`,
    email: `offline.driver${i}@test.com`,
    phoneNumber: `+2517${String(i).padStart(2, "0")}000001`, // +251701000001 to +251715000001
    licensePlate: `3-AA-${40000 + i}`,
    color: colors[i - 1],
  });
}

const driverRoleId = usersRoles.driverRoleId;
const vehicleOwnerRoleId = usersRoles.vehicleOwnerRoleId;
const activeStatusId = USER_STATUS.ACTIVE; // Active status for offline drivers

// Helper function to check if user exists by phone or email
async function userExists(phoneNumber, email) {
  const [rows] = await pool.query(
    `SELECT userUniqueId FROM Users WHERE phoneNumber = ? OR email = ? LIMIT 1`,
    [phoneNumber, email],
  );
  return rows.length > 0;
}

async function seedOfflineDrivers() {
  const logger = require("./Utils/logger");
  logger.info("🚀 Starting to seed 15 OFFLINE drivers...");

  let successCount = 0;
  let skipCount = 0;
  let documentCount = 0;
  let vehicleCount = 0;

  // Get required document types for drivers (roleId=2)
  const [requiredDocuments] = await pool.query(
    `SELECT rdr.documentTypeId, rdr.isExpirationDateRequired, rdr.isFileNumberRequired, 
            dt.documentTypeName
     FROM RoleDocumentRequirements rdr
     JOIN DocumentTypes dt ON rdr.documentTypeId = dt.documentTypeId
     WHERE rdr.roleId = ? AND rdr.roleDocumentRequirementDeletedAt IS NULL`,
    [driverRoleId],
  );

  logger.info(
    `📄 Found ${requiredDocuments.length} required document types for drivers`,
  );

  // Get a vehicle type (first available)
  const [vehicleTypes] = await pool.query(
    `SELECT vehicleTypeUniqueId, vehicleTypeName FROM VehicleTypes LIMIT 1`,
  );

  if (!vehicleTypes.length) {
    logger.error(
      "❌ No vehicle types found in database. Cannot create vehicles.",
    );
    await pool.end();
    process.exit(1);
  }

  const vehicleTypeUniqueId = vehicleTypes[0].vehicleTypeUniqueId;
  logger.info(`🚗 Using vehicle type: ${vehicleTypes[0].vehicleTypeName}`);

  logger.info("========== SEEDING OFFLINE DRIVERS (15) ==========");

  for (let i = 0; i < offlineDrivers.length; i++) {
    const driver = offlineDrivers[i];
    const now = currentDate();

    // Check if user already exists
    const exists = await userExists(driver.phoneNumber, driver.email);
    if (exists) {
      skipCount++;
      logger.warn(
        `⚠️  [${i + 1}/15] Skipped (exists): ${driver.fullName} (${driver.phoneNumber})`,
      );
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
          driver.fullName,
          driver.phoneNumber,
          driver.email,
          now,
          "seed-offline-script",
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

      // 4. Insert UserRoleStatusCurrent with statusId = 1 (ACTIVE) - but offline (no DriverRequest)
      await pool.query(
        `INSERT INTO UserRoleStatusCurrent (userRoleStatusUniqueId, userRoleStatusCreatedBy, userRoleId, userRoleStatusDescription, statusId, userRoleStatusCreatedAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          userRoleStatusUniqueId,
          userUniqueId,
          insertedUserRoleId,
          "Offline driver - fully active but not online",
          activeStatusId,
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

      // 8. Insert Attached Documents with ACCEPTED status (not PENDING)
      for (const doc of requiredDocuments) {
        const attachedDocumentUniqueId = uuidv4();
        const expirationDate = doc.isExpirationDateRequired
          ? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000) // 1 year from now
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
            "ACCEPTED", // ACCEPTED for offline drivers too
            PLACEHOLDER_IMAGE_URL,
            userUniqueId,
            fileNumber,
            now,
          ],
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
          driver.licensePlate,
          driver.color,
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

      vehicleCount++;

      // NOTE: We do NOT create a DriverRequest record - this makes them OFFLINE
      // Online drivers have DriverRequest with journeyStatusId = 1 (Waiting)
      // Offline drivers have NO DriverRequest record

      successCount++;
      logger.info(
        `✅ [${i + 1}/15] OFFLINE: ${driver.fullName} (${driver.phoneNumber}) - OTP: ${OTP}`,
      );
      logger.info(`   🚗 Vehicle: ${driver.licensePlate} (${driver.color})`);
    } catch (error) {
      skipCount++;
      logger.error(`❌ [${i + 1}/15] Failed: ${driver.fullName}`, {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  // ============================================
  // SUMMARY
  // ============================================
  logger.info("==========================================");
  logger.info("         OFFLINE DRIVERS SUMMARY           ");
  logger.info("==========================================");
  logger.info(`🔴 Offline Drivers Created: ${successCount}/15`);
  logger.info(`📄 Documents (ACCEPTED):     ${documentCount}`);
  logger.info(`🚗   Vehicle Created:        ${vehicleCount}`);
  logger.info(`⚠️  Skipped/Failed:          ${skipCount}`);
  logger.info("==========================================");
  logger.info("✅ These drivers will appear in getOfflineDrivers API");
  logger.info("   because they have:");
  logger.info("   - roleId = 2 (Driver)");
  logger.info("   - statusId = 1 (Active)");
  logger.info("   - NO DriverRequest record (makes them offline)");
  logger.info("   - All documents ACCEPTED");
  logger.info("   - Complete vehicle setup");
  logger.info("==========================================");

  // Close connection
  await pool.end();
  logger.info("🔌 Database connection closed.");
  process.exit(0);
}

// Run the script
seedOfflineDrivers().catch((err) => {
  const logger = require("./Utils/logger");
  logger.error("❌ Fatal error in seedOfflineDrivers", {
    error: err.message,
    stack: err.stack,
  });
  process.exit(1);
});
