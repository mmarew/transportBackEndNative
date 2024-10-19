const { insertData } = require("../CRUD/Create/CreateData");
const { pool } = require("../Middleware/Database.config");
const { createDocumentType } = require("../services/documentTypes.service");
const {
  createMapping,
} = require("../services/RoleDocumentRequirements.service");
const {
  listOfDocuments,
  RoleDocumentRequirements,
  driversDocumentRequirement,
} = require("../Utils/listOfFixedData");
const roleList = require("../Utils/listOfFixedData").roleList;
const statusList = require("../Utils/listOfFixedData").statusList;
const createTable = async () => {
  const sqlQuery = `-- Create the Roles Table
CREATE TABLE IF NOT EXISTS Roles (
    roleId INT AUTO_INCREMENT PRIMARY KEY,
    roleUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the role
    roleName VARCHAR(50) UNIQUE NOT NULL,  -- Name of the role
    roleDescription VARCHAR(255) NULL,  -- Description of the role
    roleCreatedBy VARCHAR(36) NOT NULL,  -- Who created the role
    roleUpdatedBy VARCHAR(36) NULL,  -- Who updated the role
    roleDeletedBy VARCHAR(36) NULL,  -- Who deleted the role
    roleCreatedAt DATETIME NOT NULL,  -- When the role was created
    roleDeletedAt DATETIME NULL  -- When the role was deleted
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create the Users Table
CREATE TABLE IF NOT EXISTS Users (
    userId INT AUTO_INCREMENT PRIMARY KEY,
    userUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the user
    fullName VARCHAR(255) NOT NULL,  -- Full name of the user
    phoneNumber VARCHAR(15) NOT NULL UNIQUE,  -- Phone number of the user
    email VARCHAR(55) not NULL UNIQUE,  -- Email of the user
    createdAt DATETIME NOT NULL,  -- When the user was created
    createdBy VARCHAR(36) NULL,  -- Who created the user
    updatedBy VARCHAR(36) NULL,  -- Who updated the user
    deletedBy VARCHAR(36) NULL,  -- Who deleted the user
    updatedAt DATETIME NULL,  -- When the user was updated
    deletedAt DATETIME NULL  -- When the user was deleted
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create the UserRole Table
CREATE TABLE IF NOT EXISTS UserRole (
    userRoleId INT AUTO_INCREMENT PRIMARY KEY,
    userRoleUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for user-role link
    userUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to Users
    roleId INT NOT NULL,  -- Foreign key to Roles
    userRoleCreatedBy VARCHAR(36) NOT NULL,  -- Who created the user role
    userRoleUpdatedBy VARCHAR(36) NULL,  -- Who updated the user role
    userRoleDeletedBy VARCHAR(36) NULL,  -- Who deleted the user role
    userRoleCreatedAt DATETIME NOT NULL,  -- When the user role was created
    userRoleDeletedAt DATETIME NULL,  -- When the user role was deleted
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId),  -- Link to Users
    FOREIGN KEY (roleId) REFERENCES Roles(roleId)  -- Link to Roles
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create the UsersCredential Table
CREATE TABLE IF NOT EXISTS usersCredential (
    credentialId INT AUTO_INCREMENT PRIMARY KEY,
    credentialUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for credentials
    userUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to Users
    hashedPassword VARCHAR(255) NOT NULL,  -- Hashed password
    OTP VARCHAR(6) NULL,  -- Optional one-time password
    usersCredentialCreatedAt DATETIME NOT NULL,  -- When the credentials were created
    usersCredentialDeletedAt DATETIME NULL,  -- When the credentials were deleted
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId)  -- Link to Users
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create the UserRoleStatus Table
CREATE TABLE IF NOT EXISTS UserRoleStatus (
    userRoleStatusId INT AUTO_INCREMENT PRIMARY KEY,
    userRoleStatusUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for user-role-status link
    statusId INT NOT NULL,  -- Foreign key to Statuses
    userRoleId INT NOT NULL,  -- Foreign key to UserRole
    userRoleStatusCreatedBy VARCHAR(36) NOT NULL,  -- Who created the status
    userRoleStatusUpdatedBy VARCHAR(36) NULL,  -- Who updated the status
    userRoleStatusDeletedBy VARCHAR(36) NULL,  -- Who deleted the status
    userRoleStatusDescription TEXT NULL,  -- Description of the role status
    userRoleStatusCreatedAt DATETIME NOT NULL,  -- When the role status was created
    userRoleStatusUpdatedAt DATETIME NULL,  -- When the role status was updated
    userRoleStatusDeletedAt DATETIME NULL,  -- When the role status was deleted
    isUserRoleStatusActive BOOLEAN NOT NULL DEFAULT TRUE,  -- Whether the status is active
    FOREIGN KEY (userRoleStatusDeletedBy) REFERENCES Users(userUniqueId),  -- Link to Users
    FOREIGN KEY (userRoleStatusUpdatedBy) REFERENCES Users(userUniqueId),  -- Link to Users
    FOREIGN KEY (userRoleStatusCreatedBy) REFERENCES Users(userUniqueId),  -- Link to Users
    FOREIGN KEY (userRoleId) REFERENCES UserRole(userRoleId),  -- Link to UserRole
    FOREIGN KEY (statusId) REFERENCES Statuses(statusId)  -- Link to Statuses
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create the DocumentTypes Table
CREATE TABLE IF NOT EXISTS DocumentTypes (
    documentTypeId INT AUTO_INCREMENT PRIMARY KEY,
    documentTypeUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the document type list
    documentTypeName VARCHAR(255) NOT NULL,  -- Name of the document type (e.g., "ID", "License", "Plate")
    uploadedDocumentName  VARCHAR(50) NOT NULL, -- it is used in file input fieled of front end 
    uploadedDocumentTypeId  VARCHAR(50) NOT NULL, -- it is used in file input fieled of front end
    uploadedDocumentDescription  VARCHAR(255) NOT NULL, -- it is used in file input fieled of front end
    uploadedDocumentExpirationDate  VARCHAR(255) NOT NULL, -- it is used in file input fieled of front end
    documentTypeDescription  TEXT(2000)  not NULL ,  -- Optional description of the document type
    documentTypeCreatedBy VARCHAR(36) NOT NULL,  -- Who created the document type
    documentTypeUpdatedBy VARCHAR(36) NULL,  -- Who last updated the document type
    documentTypeDeletedBy VARCHAR(36) NULL,  -- Who deleted the document type
    documentTypeCreatedAt DATETIME NOT NULL,  -- When the document type was created
    documentTypeUpdatedAt DATETIME NULL,  -- When the document type was updated
    documentTypeDeletedAt DATETIME NULL,  -- When the document type was deleted
    INDEX idx_createdByUserId (documentTypeCreatedBy),  -- Index for fast lookups
    FOREIGN KEY (documentTypeCreatedBy) REFERENCES Users(userUniqueId)  -- Link to the Users table
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create the DocumentTypesHistory Table 

CREATE TABLE IF NOT EXISTS DocumentTypesHistory (
    documentTypeHistoryId INT AUTO_INCREMENT PRIMARY KEY,
    documentTypeId INT NOT NULL,  -- Reference to the original DocumentTypes
    documentTypeUniqueId VARCHAR(36) NOT NULL,  -- UUID
    documentTypeName VARCHAR(255) NOT NULL,
    documentTypeDescription VARCHAR(255) NULL,
    documentTypeCreatedBy VARCHAR(36) NOT NULL,
    documentTypeUpdatedBy VARCHAR(36) NULL,
    documentTypeDeletedBy VARCHAR(36) NULL,
    documentTypeCreatedAt DATETIME NOT NULL,
    documentTypeUpdatedAt DATETIME NULL,
    documentTypeDeletedAt DATETIME NULL,
    documentTypeVersion INT NOT NULL,  -- Version of the document type, starting from 1
    changeType ENUM('UPDATE', 'DELETE') NOT NULL,  -- Whether it was an update or delete
    changedByUserId VARCHAR(36) NOT NULL,  -- The user who made the change
    changedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- Time when the change was made

    FOREIGN KEY (documentTypeId) REFERENCES DocumentTypes(documentTypeId)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create the RoleDocumentRequirements Table

    CREATE TABLE IF NOT EXISTS RoleDocumentRequirements(
    roleDocumentRequirementId INT AUTO_INCREMENT PRIMARY KEY,
    roleDocumentRequirementUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the requirement
    roleId INT NOT NULL,  -- Foreign key to the Roles table
    documentTypeId INT NOT NULL,  -- Foreign key to the DocumentTypes table
    isDocumentMandatory BOOLEAN NOT NULL DEFAULT TRUE,  -- Whether the document is mandatory for the role
    roleDocumentRequirementCreatedBy VARCHAR(36) NOT NULL,  -- Who created the requirement
    roleDocumentRequirementUpdatedBy VARCHAR(36) NULL,  -- Who last updated the requirement
    roleDocumentRequirementDeletedBy VARCHAR(36) NULL,  -- Who deleted the requirement
    createdAt DATETIME NOT NULL,  -- When the requirement was created
    updatedAt DATETIME NULL,  -- When the requirement was updated
    deletedAt DATETIME NULL,  -- When the requirement was deleted
    FOREIGN KEY (roleDocumentRequirementCreatedBy) REFERENCES Users(userUniqueId),  -- Link to the Users table
    FOREIGN KEY (roleDocumentRequirementUpdatedBy) REFERENCES Users(userUniqueId),  -- Link to the Users table
    FOREIGN KEY (roleDocumentRequirementDeletedBy) REFERENCES Users(userUniqueId),  -- Link to the Users table

    FOREIGN KEY (roleId) REFERENCES Roles(roleId),  -- Link to the Roles table
    FOREIGN KEY (documentTypeId) REFERENCES DocumentTypes(documentTypeId),  -- Link to the DocumentTypes table
    UNIQUE (roleId, documentTypeId)  -- Ensure each role can have each document type only once
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create the AttachedDocuments Table
CREATE TABLE IF NOT EXISTS AttachedDocuments (
    attachedDocumentId INT AUTO_INCREMENT PRIMARY KEY,
    attachedDocumentUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the attached document
    userUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to Users
    attachedDocumentDescription VARCHAR(255) NULL,  -- Description of the attached document
    attachedDocumentName VARCHAR(255) NOT NULL,  -- Path of the attached document (file storage location)
    documentTypeId INT NOT NULL,  -- Foreign key to DocumentTypes
    documentExpirationDate DATETIME NULL,  -- Expiration date for time-sensitive documents (e.g., licenses)
    attachedDocumentAcceptance enum('PENDING', 'ACCEPTED', 'REJECTED' ) NOT NULL DEFAULT 'PENDING',  -- Status of the attached document
    attachedDocumentIsExpired BOOLEAN NOT NULL DEFAULT FALSE,  -- Is the attached document expired
    attachedDocumentIsDeleted BOOLEAN NOT NULL DEFAULT FALSE,  -- Is the attached document deleted
    attachedDocumentCreatedByUserId VARCHAR(36) NOT NULL,  -- Who created the attached document
    attachedDocumentUpdatedByUserId VARCHAR(36) NULL,  -- Who last updated the attached document
    attachedDocumentDeletedByUserId VARCHAR(36) NULL,  -- Who deleted the attached document
    attachedDocumentCreatedAt DATETIME NOT NULL,  -- When the attached document was created
    attachedDocumentUpdatedAt DATETIME NULL,  -- When the attached document was updated
    attachedDocumentAcceptanceReason VARCHAR(255) NULL,  -- Reason for accepting or rejecting the attached document
    attachedDocumentDeletedAt DATETIME NULL,  -- When the attached document was deleted
    INDEX idx_userUniqueId (userUniqueId),  -- Index for fast lookups
    INDEX idx_documentTypeId (documentTypeId),  -- Index for fast lookups
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId),  -- Link to the Users table
    FOREIGN KEY (documentTypeId) REFERENCES DocumentTypes(documentTypeId)  -- Link to DocumentTypes
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create the Statuses Table
CREATE TABLE IF NOT EXISTS Statuses (
    statusId INT AUTO_INCREMENT PRIMARY KEY,
    statusUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the status
    statusName VARCHAR(50) UNIQUE NOT NULL,  -- Name of the status
    statusDescription VARCHAR(255) NULL,  -- Description of the status
    statusCreatedBy VARCHAR(36) NOT NULL,  -- Who created the status
    statusUpdatedBy VARCHAR(36) NULL,  -- Who updated the status
    statusDeletedBy VARCHAR(36) NULL,  -- Who deleted the status
    statusCreatedAt DATETIME NOT NULL,  -- When the status was created
    statusDeletedAt DATETIME NULL,  -- When the status was deleted
    FOREIGN KEY (statusCreatedBy) REFERENCES Users(userUniqueId)  -- Foreign key to Users
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

 
 -- Create the JourneyStatus table
CREATE TABLE IF NOT EXISTS JourneyStatus (
    journeyStatusId INT AUTO_INCREMENT PRIMARY KEY,
    journeyStatusUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for journey status
    journeyStatusName VARCHAR(50) NOT NULL,  -- Name of the journey status
    journeyStatusDescription VARCHAR(255) NULL,  -- Description of the journey status
    journeyStatusCreatedAt DATETIME NOT NULL,  -- When the journey status was created
    journeyStatusDeletedAt DATETIME NULL  -- When the journey status was deleted
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create the PassengerRequest table
CREATE TABLE IF NOT EXISTS PassengerRequest (
    passengerRequestId INT AUTO_INCREMENT PRIMARY KEY,
    passengerRequestUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the passenger request
    userUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to Users
    vehicleTypeUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to VehicleType
    originLatitude DECIMAL(10, 8) NOT NULL,  -- Latitude of origin
    originLongitude DECIMAL(11, 8) NOT NULL,  -- Longitude of origin
    originPlace VARCHAR(255) NOT NULL,  -- Origin place
    destinationLatitude DECIMAL(10, 8) NULL DEFAULT 0.0,  -- Latitude of destination
    destinationLongitude DECIMAL(11, 8) NULL DEFAULT 0.0,  -- Longitude of destination
    destinationPlace VARCHAR(255) NULL DEFAULT 0.0,  -- Destination place
    requestTime TIMESTAMP NOT NULL,  -- Time of the request
    journeyStatusId INT NOT NULL,  -- Foreign key to JourneyStatus
    FOREIGN KEY (vehicleTypeUniqueId) REFERENCES VehicleType(vehicleTypeUniqueId),
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (journeyStatusId) REFERENCES JourneyStatus(journeyStatusId)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create the DriverRequest table
CREATE TABLE IF NOT EXISTS DriverRequest (
    driverRequestId INT AUTO_INCREMENT PRIMARY KEY,
    driverRequestUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the driver request
    userUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to Users
    originLatitude DECIMAL(10, 8) NOT NULL,  -- Latitude of origin
    originLongitude DECIMAL(11, 8) NOT NULL,  -- Longitude of origin
    originPlace VARCHAR(255) NOT NULL,  -- Origin place
    requestTime TIMESTAMP NOT NULL,  -- Time of the request
    journeyStatusId INT NOT NULL,  -- Foreign key to JourneyStatus
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (journeyStatusId) REFERENCES JourneyStatus(journeyStatusId)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create the JourneyDecisions table
CREATE TABLE IF NOT EXISTS JourneyDecisions (
    journeyDecisionId INT AUTO_INCREMENT PRIMARY KEY,
    journeyDecisionUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for journey decision
    passengerRequestId INT NOT NULL,  -- Foreign key to PassengerRequest
    driverRequestId INT NOT NULL,  -- Foreign key to DriverRequest
    journeyStatusId INT NOT NULL,  -- Foreign key to JourneyStatus
    decisionTime TIMESTAMP NOT NULL,  -- Time of the decision
    decisionBy ENUM('passenger', 'driver', 'admin') NOT NULL,  -- Who made the decision
    FOREIGN KEY (passengerRequestId) REFERENCES PassengerRequest(passengerRequestId),
    FOREIGN KEY (driverRequestId) REFERENCES DriverRequest(driverRequestId),
    FOREIGN KEY (journeyStatusId) REFERENCES JourneyStatus(journeyStatusId)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create the Journey table
CREATE TABLE IF NOT EXISTS Journey (
    journeyId INT AUTO_INCREMENT PRIMARY KEY,
    journeyUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the journey
    journeyDecisionUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- Foreign key to JourneyDecisions
    startTime TIMESTAMP NOT NULL,  -- Journey start time
    endTime TIMESTAMP NULL,  -- Journey end time
    fare DECIMAL(10, 2) DEFAULT 0,  -- Fare for the journey
    journeyStatusId INT NOT NULL,  -- Foreign key to JourneyStatus
    FOREIGN KEY (journeyDecisionUniqueId) REFERENCES JourneyDecisions(journeyDecisionUniqueId),
    FOREIGN KEY (journeyStatusId) REFERENCES JourneyStatus(journeyStatusId)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create the Vehicle table
CREATE TABLE IF NOT EXISTS Vehicle (
    vehicleId INT AUTO_INCREMENT PRIMARY KEY,
    vehicleUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the vehicle
    vehicleTypeUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to VehicleType
    licensePlate VARCHAR(50) NOT NULL,  -- License plate of the vehicle
    color VARCHAR(50) NOT NULL,  -- Color of the vehicle
    createdAt DATETIME NOT NULL,  -- Vehicle creation date
    deletedAt DATETIME NULL,  -- Vehicle deletion date
    FOREIGN KEY (vehicleTypeUniqueId) REFERENCES VehicleType(vehicleTypeUniqueId)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create the VehicleStatusType table
CREATE TABLE IF NOT EXISTS VehicleStatusType (
    statusTypeId INT AUTO_INCREMENT PRIMARY KEY,
    statusTypeName VARCHAR(50) NOT NULL,  -- Name of the vehicle status type
    statusTypeDescription VARCHAR(255) NULL,  -- Description of the vehicle status type
    createdAt DATETIME NOT NULL,  -- Creation time
    deletedAt DATETIME NULL  -- Deletion time
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create the VehicleStatus table
CREATE TABLE IF NOT EXISTS VehicleStatus (
    vehicleStatusId INT AUTO_INCREMENT PRIMARY KEY,
    vehicleStatusUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the vehicle status
    vehicleUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to Vehicle
    statusTypeId INT NOT NULL,  -- Foreign key to VehicleStatusType
    statusStartDate DATETIME NOT NULL,  -- Status start date
    statusEndDate DATETIME NULL,  -- Status end date
    FOREIGN KEY (vehicleUniqueId) REFERENCES Vehicle(vehicleUniqueId),
    FOREIGN KEY (statusTypeId) REFERENCES VehicleStatusType(statusTypeId)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create the VehicleType table
CREATE TABLE IF NOT EXISTS VehicleType (
    vehicleTypeId INT AUTO_INCREMENT PRIMARY KEY,
    vehicleTypeUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the vehicle type
    vehicleTypeName VARCHAR(50) NOT NULL,  -- Name of the vehicle type
    carryingCapacity VARCHAR(255) NULL,  -- Carrying capacity of the vehicle
    vehicleImage VARCHAR(255) NULL,  -- Image URL of the vehicle
    vehicleTypeCreatedAt DATETIME NOT NULL,  -- Vehicle type creation date
    vehicleTypeDeletedAt DATETIME NULL  -- Vehicle type deletion date
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create the VehicleOwnership table
CREATE TABLE IF NOT EXISTS VehicleOwnership (
    ownershipId INT AUTO_INCREMENT PRIMARY KEY,
    ownershipUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for ownership
    vehicleUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to Vehicle
    userUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to Users
    roleId INT NOT NULL,  -- Foreign key to Roles
    ownershipStartDate DATETIME NOT NULL,  -- Ownership start date
    ownershipEndDate DATETIME NULL,  -- Ownership end date
    FOREIGN KEY (vehicleUniqueId) REFERENCES Vehicle(vehicleUniqueId),
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (roleId) REFERENCES Roles(roleId)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create the Ratings table
CREATE TABLE IF NOT EXISTS Ratings (
    ratingId INT AUTO_INCREMENT PRIMARY KEY,
    journeyId VARCHAR(36) NOT NULL,  -- Foreign key to Journey
    ratedBy VARCHAR(36) NOT NULL,  -- Foreign key to Users (who gave the rating)
    rating INT NOT NULL,  -- Rating score
    comment TEXT NULL,  -- Rating comment
    FOREIGN KEY (journeyId) REFERENCES Journey(journeyId),
    FOREIGN KEY (ratedBy) REFERENCES Users(userUniqueId)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create the SMSSender table
CREATE TABLE IF NOT EXISTS SMSSender (
    SMSSenderId INT AUTO_INCREMENT PRIMARY KEY, 
    phoneNumber VARCHAR(50) NOT NULL,  -- Phone number of SMS sender
    password VARCHAR(255) NOT NULL  -- Password of SMS sender
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

 -- Create the CancellationReasonsType table
CREATE TABLE IF NOT EXISTS CancellationReasonsType (
    cancellationReasonsTypeId INT AUTO_INCREMENT PRIMARY KEY, 
    cancellationReasonTypeUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for cancellation reason
    cancellationReasonType VARCHAR(150) NOT NULL,  -- Type of cancellation reason
    canceledBy VARCHAR(150) NOT NULL  -- Who canceled (could be driver, passenger, or admin)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create the Payments table
CREATE TABLE IF NOT EXISTS Payments (
    paymentId INT AUTO_INCREMENT PRIMARY KEY,
    journeyId VARCHAR(36) NOT NULL,  -- Foreign key to Journey
    amount DECIMAL(10, 2) NOT NULL,  -- Payment amount
    paymentMethodUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to PaymentMethod
    paymentStatusUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to PaymentStatus
    paymentTime TIMESTAMP NOT NULL,  -- Time of payment
    FOREIGN KEY (journeyId) REFERENCES Journey(journeyId),
    FOREIGN KEY (paymentMethodUniqueId) REFERENCES PaymentMethod(paymentMethodUniqueId),
    FOREIGN KEY (paymentStatusUniqueId) REFERENCES PaymentStatus(paymentStatusUniqueId)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create the PaymentStatus table
CREATE TABLE IF NOT EXISTS PaymentStatus (
    paymentStatusId INT AUTO_INCREMENT PRIMARY KEY,
    paymentStatusUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for payment status
    paymentStatusList VARCHAR(50) NOT NULL,  -- Payment status (e.g., Pending, Completed, Failed)
    createdAt DATETIME NOT NULL,  -- Creation time of the payment status
    deletedAt DATETIME NULL  -- Deletion time of the payment status
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create the PaymentMethod table
CREATE TABLE IF NOT EXISTS PaymentMethod (
    paymentMethodId INT AUTO_INCREMENT PRIMARY KEY,
    paymentMethodUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for payment method
    paymentMethod VARCHAR(50) NOT NULL,  -- Name of the payment method (e.g., Credit Card, PayPal)
    createdAt DATETIME NOT NULL  -- Creation time of the payment method
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;
  try {
    const [queryResult] = await pool.query(sqlQuery);

    // console.log("queryResult", queryResult);
    // for (const role of roleList) {
    //   await insertData({ tableName: "Roles", colAndVal: { ...role } });
    // }

    // for (const status of statusList) {
    //   try {
    //     await insertData({ tableName: "Statuses", colAndVal: status });
    //     console.log("Status inserted:", status);
    //   } catch (error) {
    //     console.error("Error inserting status:", error);
    //   }
    // }

    // for (const document of listOfDocuments) {
    //   try {
    //     const responces = await createDocumentType({
    //       body: document,
    //       user: {
    //         data: { userUniqueId: "acbf1fe0-2ed9-4e5d-89d3-3a652d9e85e4" },
    //       },
    //     });
    //     console.log("Document processed:", responces);
    //   } catch (error) {
    //     console.error("Error processing document:", error);
    //   }
    // }

    // for (const role of driversDocumentRequirement) {
    //   const body = role,
    //     userUniqueId = "da9534f3-d5a2-4697-b5bf-6ef826d69417";
    //   await createMapping({ body, userUniqueId });
    //   console.log("role", role);
    // }
  } catch (error) {
    console.log("Error executing query", error);
  }
};

module.exports = { createTable };
