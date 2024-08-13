const { pool } = require("../Middleware/Database.config");

const createTable = async () => {
  const SMSSenderTable = `CREATE TABLE IF NOT EXISTS SMSSender (
    SMSSenderId INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
    smsSenderUniqueId VARCHAR(150) UNIQUE NOT NULL,
    phoneNumber VARCHAR(14),
    password VARCHAR(256),
    status ENUM('active', 'inactive') DEFAULT 'active'
  ) CHARSET=utf8 COLLATE=utf8_general_ci`;

  const sqlTcreateDriversInfoTable = `CREATE TABLE IF NOT EXISTS driversInfo (
    driversInfoId SERIAL PRIMARY KEY,
    driverUniqueId VARCHAR(150) UNIQUE NOT NULL,
    fullName VARCHAR(100),
    phoneNumber VARCHAR(14),
    email VARCHAR(25),
    drivingLicenceFileName VARCHAR(100),
    drivingLicenceNumber VARCHAR(100),
    driverStatus ENUM('active', 'inactive', 'blocked') DEFAULT 'active'
  ) CHARSET=utf8 COLLATE=utf8_general_ci`;

  const sqlToCreateDriversCredential = `CREATE TABLE IF NOT EXISTS driversCredentials (
    driversCredentialId INT PRIMARY KEY AUTO_INCREMENT,
    driversCredentialUniqueId VARCHAR(150) UNIQUE NOT NULL,
    driversPinCode INT,
    driverUniqueId VARCHAR(150)
    ) CHARSET=utf8 COLLATE=utf8_general_ci`;
  // FOREIGN KEY (driverUniqueId) REFERENCES driversInfo(driverUniqueId)

  const sqlToCreateTablePassenger = `CREATE TABLE IF NOT EXISTS passenger (
    passengerId INT AUTO_INCREMENT PRIMARY KEY NOT NULL,
    passengerUniqueId VARCHAR(150) UNIQUE NOT NULL,
    passengerFullName VARCHAR(60) NOT NULL,
    passengerEmail VARCHAR(30) NOT NULL,
    passengerPhone VARCHAR(20) NOT NULL
  ) CHARSET=utf8 COLLATE=utf8_general_ci`;

  const passengersCredentialTable = `CREATE TABLE IF NOT EXISTS passengerCredentials (
    passengerCredentialId INT PRIMARY KEY AUTO_INCREMENT,
    passengerCredentialUniqueId VARCHAR(150) UNIQUE NOT NULL,
    passengerOTP INT(6) NOT NULL,
    passengerStatus ENUM('active', 'inactive', 'blocked') DEFAULT 'active',
    passengerUniqueId VARCHAR(150)
    ) CHARSET=utf8 COLLATE=utf8_general_ci`;
  // FOREIGN KEY (passengerUniqueId) REFERENCES passenger(passengerUniqueId)
  const createPassengerRequestsTable = `CREATE TABLE IF NOT EXISTS passengerRequests (
    requestId INT AUTO_INCREMENT PRIMARY KEY,
    requestUniqueId VARCHAR(150) UNIQUE NOT NULL,
    passengerUniqueId VARCHAR(150) NOT NULL,
    vehicleTypeUniqueId VARCHAR(150) NOT NULL,
    originLatitude VARCHAR(22) NOT NULL,
    originLongitude VARCHAR(22) NOT NULL,
    originPlace VARCHAR(255),
    destinationLatitude VARCHAR(22) NOT NULL,
    destinationLongitude VARCHAR(22) NOT NULL,
    destinationPlace VARCHAR(255),
    requestTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('waiting','requested', 'accepted', 'completed', 'cancelled by driver', 'cancelled by passenger', 'journey started','ongoing','completed') DEFAULT 'waiting'
    ) CHARSET=utf8 COLLATE=utf8_general_ci;
    `;
  // FOREIGN KEY (passengerUniqueId) REFERENCES passenger(passengerUniqueId)
  // -- DriverWaits Table
  const createDriverWaitsTable = `CREATE TABLE IF NOT EXISTS driverWaits (
    waitId INT AUTO_INCREMENT PRIMARY KEY,
    waitUniqueId VARCHAR(150) UNIQUE NOT NULL,
    driverUniqueId VARCHAR(150) NOT NULL,
    waitLatitude VARCHAR(22) NOT NULL,
    waitLongitude VARCHAR(22) NOT NULL,
    waitTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('waiting','requested','journey started', 'accepted', 'completed','cancelled by driver', 'cancelled by passenger') DEFAULT 'waiting'
    ) CHARSET=utf8 COLLATE=utf8_general_ci;`;
  // FOREIGN KEY (driverUniqueId) REFERENCES driversInfo(driverUniqueId)

  // -- JourneyDecisions Table
  const createJourneyDecisionsTable = `CREATE TABLE IF NOT EXISTS journeyDecisions (
    decisionId INT AUTO_INCREMENT PRIMARY KEY,
    decisionUniqueId VARCHAR(150) UNIQUE NOT NULL,
    passengerRequestUniqueId VARCHAR(150) NOT NULL,
    driverWaitUniqueId VARCHAR(150) NOT NULL,
    actor ENUM('driver', 'passenger') NOT NULL,
    decision ENUM('waiting','accepted', 'cancelled by passenger', 'cancelled by driver', 'agreed','no answer from driver','no answer from passenger','journey started','ongoing','completed') NOT NULL DEFAULT 'waiting',
    decisionTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) CHARSET=utf8 COLLATE=utf8_general_ci;
    `;
  // FOREIGN KEY (passengerRequestUniqueId) REFERENCES passengerRequests(requestUniqueId),
  // FOREIGN KEY (driverWaitUniqueId) REFERENCES driverWaits(waitUniqueId)
  // -- Journeys Table journey
  const createJourneysTable = `CREATE TABLE IF NOT EXISTS journeys (
    journeyId INT AUTO_INCREMENT PRIMARY KEY,
    journeyUniqueId VARCHAR(150) UNIQUE NOT NULL,
    decisionUniqueId VARCHAR(150) NOT NULL UNIQUE,
    startTime TIMESTAMP,
    endTime TIMESTAMP default null,
    status ENUM('journey started','ongoing', 'completed', 'cancelled by driver', 'cancelled by passenger', 'cancelled by system') DEFAULT 'ongoing'
    ) CHARSET=utf8 COLLATE=utf8_general_ci;
    `;
  // FOREIGN KEY (decisionUniqueId) REFERENCES journeyDecisions(decisionUniqueId)
  // journeyLocations
  const createJourneyLocationsTable = `CREATE TABLE IF NOT EXISTS journeyLocations (
    locationId INT AUTO_INCREMENT PRIMARY KEY,
    locationUniqueId VARCHAR(150) UNIQUE NOT NULL,
    journeyUniqueId VARCHAR(150) NOT NULL,
    latitude varchar(22) NOT NULL,
    longitude varchar(22) NOT NULL,
    recordedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) CHARSET=utf8 COLLATE=utf8_general_ci`;
  // FOREIGN KEY (journeyUniqueId) REFERENCES journeys(journeyUniqueId)

  //  vechles table
  const createVechlesTable = `CREATE TABLE IF NOT EXISTS vehicles (
    vehicleId INT AUTO_INCREMENT PRIMARY KEY, 
    driverUniqueId VARCHAR(150)   NOT NULL, 
    vehicleTypeUniqueId VARCHAR(150) NOT NULL,
    vehicleUniqueId VARCHAR(150) UNIQUE NOT NULL,
    make VARCHAR(50) NOT NULL,
    model VARCHAR(50) NOT NULL,
    year INT NOT NULL,
    plateNumber VARCHAR(20) NOT NULL,
    color VARCHAR(20) NOT NULL,
    status ENUM('active', 'inactive', 'maintenance') DEFAULT 'active',
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) CHARSET=utf8 COLLATE=utf8_general_ci;
    `;
  // FOREIGN KEY (driverUniqueId) REFERENCES driversInfo(driverUniqueId),
  // FOREIGN KEY (vehicleTypeUniqueId) REFERENCES vehicleType(vehicleTypeUniqueId)

  const createVechleType = `CREATE TABLE IF NOT EXISTS vechleType (
    vehicleTypeId INT AUTO_INCREMENT PRIMARY KEY,
    vehicleTypeUniqueId VARCHAR(150) UNIQUE NOT NULL,
    vehicleTypeName VARCHAR(50) NOT NULL,
    carryingCapacity INT NOT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) CHARSET=utf8 COLLATE=utf8_general_ci;
`;
  const CancilationReasonTypes = `CREATE TABLE IF NOT EXISTS cancilationReasonsType (
  cancilationReasonTypeId INT AUTO_INCREMENT PRIMARY KEY,
  cancilationReasonTypeUniqueId VARCHAR(150) UNIQUE NOT NULL,
  cancilationReasonType VARCHAR(100) NOT NULL  ,
  caneledBy ENUM('driver', 'passenger') NOT NULL
)`;
  const canceledJourneyRequests = `CREATE TABLE IF NOT EXISTS canceledJourneyRequests (
  cancellationId INT AUTO_INCREMENT PRIMARY KEY,
  cancellationUniqueId VARCHAR(150) NOT NULL UNIQUE,
  cancellationReasonTypeUniqueId VARCHAR(150) NOT NULL,
  requestUniqueId VARCHAR(150),
  waitUniqueId VARCHAR(150),
  cancellationBy ENUM('driver', 'passenger') NOT NULL,
  cancellationTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`;

  // FOREIGN KEY (requestUniqueId) REFERENCES passengerRequests(requestUniqueId),
  // FOREIGN KEY (waitUniqueId) REFERENCES driverWaits(waitUniqueId),
  // FOREIGN KEY (cancellationReasonTypeUniqueId) REFERENCES cancellationReasonsType(cancellationReasonTypeUniqueId)
  const tablesSQL = [
    sqlTcreateDriversInfoTable,
    sqlToCreateTablePassenger,

    sqlToCreateDriversCredential,
    passengersCredentialTable,

    createPassengerRequestsTable,
    createDriverWaitsTable,

    createJourneyDecisionsTable,
    createJourneysTable,

    createJourneyLocationsTable,

    createVechlesTable,

    SMSSenderTable,
    createVechleType,

    CancilationReasonTypes,
    canceledJourneyRequests,
  ];
  try {
    tablesSQL.map(async (tableSQL) => {
      try {
        await pool.query(tableSQL);
      } catch (error) {
        console.log("in tablesSQL ====> ", error);
      }
    });
  } catch (error) {
    console.error("Error creating table:", error);
  }
};

module.exports = { createTable };
//
