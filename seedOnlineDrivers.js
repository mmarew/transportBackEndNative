/**
 * Seed Online Drivers Script
 * Run: node seedOnlineDrivers.js
 *
 * This will insert 15 FULLY ONLINE driver users with:
 * - UserRoleStatusCurrent.statusId = 1 (Active)
 * - AttachedDocuments with acceptance = 'ACCEPTED'
 * - Complete Vehicle setup (Vehicle, VehicleStatus, VehicleOwnership, VehicleDriver)
 * - DriverRequest with journeyStatusId = 1 (Waiting) to make them online
 */

// Load environment variables FIRST
require("dotenv").config();

const { pool } = require("./Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcryptjs");

// Placeholder image URL for test documents
const PLACEHOLDER_IMAGE_URL =
  "https://id.gov.et/static/media/id-card.9eff61c2730a160fea81.png";

// Ethiopian names for online drivers
const firstNames = [
  "Alem",
  "Bereket",
  "Eyob",
  "Feven",
  "Henok",
  "Kaleb",
  "Lidya",
  "Mikael",
  "Nahom",
  "Selam",
  "Tsion",
  "Yohannes",
  "Zewdu",
  "Abel",
  "Bethel",
];

const lastNames = [
  "Gebremariam",
  "Habtom",
  "Kidane",
  "Mebrahtu",
  "Negasi",
  "Okbay",
  "Russom",
  "Semere",
  "Tekle",
  "Weldemichael",
  "Zerai",
  "Afewerki",
  "Berhane",
  "Desta",
  "Fessehaye",
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

// Addis Ababa coordinates for realistic origin locations
const addisAbabaLocations = [
  { lat: 9.0054, lng: 38.7636, place: "Bole, Addis Ababa" },
  { lat: 9.0107, lng: 38.7612, place: "Megenagna, Addis Ababa" },
  { lat: 8.9806, lng: 38.7578, place: "Meskel Square, Addis Ababa" },
  { lat: 9.0192, lng: 38.7525, place: "4 Kilo, Addis Ababa" },
  { lat: 9.03, lng: 38.75, place: "Piassa, Addis Ababa" },
  { lat: 8.995, lng: 38.785, place: "CMC, Addis Ababa" },
  { lat: 9.0, lng: 38.73, place: "Mexico, Addis Ababa" },
  { lat: 9.015, lng: 38.77, place: "Gerji, Addis Ababa" },
  { lat: 8.97, lng: 38.74, place: "Lideta, Addis Ababa" },
  { lat: 9.025, lng: 38.745, place: "Arat Kilo, Addis Ababa" },
  { lat: 8.985, lng: 38.755, place: "Stadium, Addis Ababa" },
  { lat: 9.035, lng: 38.765, place: "Shiro Meda, Addis Ababa" },
  { lat: 8.96, lng: 38.725, place: "Kality, Addis Ababa" },
  { lat: 9.04, lng: 38.735, place: "Entoto, Addis Ababa" },
  { lat: 9.005, lng: 38.8, place: "Ayat, Addis Ababa" },
];

// Generate 15 Online Drivers - using unique phone pattern that doesn't exist in seedTestUsers.js
// seedTestUsers.js uses: +251910000001 to +251959000001 (drivers) and +251960000001 to +251999000001 (shippers)
// We use: +251901000001 to +251915000001 (completely different pattern)
const onlineDrivers = [];
for (let i = 1; i <= 15; i++) {
  const firstName = firstNames[i - 1];
  const lastName = lastNames[i - 1];
  const location = addisAbabaLocations[i - 1];
  onlineDrivers.push({
    fullName: `${firstName} ${lastName}`,
    email: `online.driver${i}@test.com`,
    phoneNumber: `+2519${String(i).padStart(2, "0")}000001`, // +251901000001 to +251915000001
    licensePlate: `3-AA-${20000 + i}`,
    color: colors[i - 1],
    location: location,
  });
}

const driverRoleId = 2;
const vehicleOwnerRoleId = 4;
const activeStatusId = 1; // Active status for online drivers
const waitingJourneyStatusId = 1; // Waiting = online and available

// Helper function to check if user exists by phone or email
async function userExists(phoneNumber, email) {
  const [rows] = await pool.query(
    `SELECT userUniqueId FROM Users WHERE phoneNumber = ? OR email = ? LIMIT 1`,
    [phoneNumber, email],
  );
  return rows.length > 0;
}

async function seedOnlineDrivers() {
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

  for (let i = 0; i < onlineDrivers.length; i++) {
    const driver = onlineDrivers[i];
    const now = currentDate();

    // Check if user already exists
    const exists = await userExists(driver.phoneNumber, driver.email);
    if (exists) {
      continue;
    }

    const userUniqueId = uuidv4();
    const credentialUniqueId = uuidv4();
    const userRoleUniqueId = uuidv4();
    const userRoleStatusUniqueId = uuidv4();
    const userSubscriptionUniqueId = uuidv4();
    const userBalanceUniqueId = uuidv4();
    const driverRequestUniqueId = uuidv4();

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
          "seed-online-script",
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

      // 4. Insert UserRoleStatusCurrent with statusId = 1 (ACTIVE) - Required for online status
      await pool.query(
        `INSERT INTO UserRoleStatusCurrent (userRoleStatusUniqueId, userUniqueId, userRoleId, userRoleStatusDescription, statusId, userRoleStatusCreatedAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          userRoleStatusUniqueId,
          userUniqueId,
          insertedUserRoleId,
          "Online driver - fully active",
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
            "ACCEPTED", // ACCEPTED instead of PENDING for online drivers
            PLACEHOLDER_IMAGE_URL,
            userUniqueId,
            fileNumber,
            now,
          ],
        );
        // Removed unused counter: documentCount
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

      // Removed unused counter: vehicleCount

      // 10. Create DriverRequest with journeyStatusId = 1 (Waiting) - THIS MAKES DRIVER ONLINE
      await pool.query(
        `INSERT INTO DriverRequest (driverRequestUniqueId, userUniqueId, originLatitude, originLongitude, originPlace, driverRequestCreatedAt, journeyStatusId)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          driverRequestUniqueId,
          userUniqueId,
          driver.location.lat,
          driver.location.lng,
          driver.location.place,
          now,
          waitingJourneyStatusId, // journeyStatusId = 1 (Waiting) makes driver online
        ],
      );

      // Removed unused counter: successCount
    } catch (error) {
      const logger = require("./Utils/logger");
      logger.error("Error seeding online driver", {
        error: error.message,
        stack: error.stack,
      });
      // Removed unused counter: skipCount
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
seedOnlineDrivers().catch((err) => {
  const logger = require("./Utils/logger");
  logger.error("Error in seedOnlineDrivers", {
    error: err.message,
    stack: err.stack,
  });
  process.exit(1);
});
