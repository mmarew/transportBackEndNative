const sqlQuery = `

-- Ensure session defaults use InnoDB and utf8mb4 for all created tables
SET default_storage_engine=INNODB;
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET character_set_client = utf8mb4;
SET character_set_connection = utf8mb4;
SET collation_connection = utf8mb4_unicode_ci;

-- Create the Roles Table

CREATE TABLE IF NOT EXISTS Roles (
    roleId INT AUTO_INCREMENT PRIMARY KEY,
    roleUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the role
    roleName VARCHAR(50) UNIQUE NOT NULL,  -- Name of the role
    roleDescription VARCHAR(255) NULL,  -- Description of the role
    roleCreatedBy VARCHAR(36) NOT NULL,  -- Who created the role
    roleUpdatedBy VARCHAR(36) NULL,  -- Who updated the role
    roleDeletedBy VARCHAR(36) NULL,  -- Who deleted the role
    roleCreatedAt DATETIME NOT NULL,  -- When the role was created
    roleDeletedAt DATETIME  -- When the role was deleted
 ) ;

 
 

-- Create the vehicleTypes table

   CREATE TABLE IF NOT EXISTS VehicleTypes (
    vehicleTypeId INT AUTO_INCREMENT PRIMARY KEY,
    vehicleTypeUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the vehicle type
    vehicleTypeName VARCHAR(50) UNIQUE NOT NULL,  -- Name of the vehicle type
    vehicleTypeIconName VARCHAR(50) NULL,  -- Icon name of the vehicle type
    vehicleTypeDescription VARCHAR(255) NULL,  -- Description of the vehicle type
    vehicleTypeCreatedBy VARCHAR(36) NOT NULL,  -- Who created the vehicle type
    vehicleTypeUpdatedBy VARCHAR(36) NULL,  -- Who updated the vehicle type
    vehicleTypeDeletedBy VARCHAR(36) NULL,  -- Who deleted the vehicle type
    carryingCapacity VARCHAR(255) NULL,  -- Carrying capacity of the vehicle
    vehicleTypeUpdatedAt DATETIME NULL,  -- Vehicle type update date
    vehicleTypeCreatedAt DATETIME NOT NULL,  -- Vehicle type creation date
    vehicleTypeDeletedAt DATETIME NULL  -- Vehicle type deletion date
) ; 

 -- Create the JourneyStatus table

CREATE TABLE IF NOT EXISTS JourneyStatus (
    journeyStatusId INT AUTO_INCREMENT PRIMARY KEY,
    journeyStatusUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for journey status
    journeyStatusName VARCHAR(50) NOT NULL,  -- Name of the journey status
    journeyStatusDescription VARCHAR(255) NULL,  -- Description of the journey status
    journeyStatusCreatedAt DATETIME NOT NULL,  -- When the journey status was created
    journeyStatusDeletedAt DATETIME NULL  -- When the journey status was deleted
) ;

-- Create the Users Table

CREATE TABLE IF NOT EXISTS Users (
    userId INT AUTO_INCREMENT PRIMARY KEY,
    userUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the user
    fullName VARCHAR(255) ,  -- Full name of the user
    phoneNumber VARCHAR(15) NOT NULL UNIQUE,  -- Phone number of the user
    email VARCHAR(55) ,  -- Email of the user
    createdAt DATETIME NOT NULL,  -- When the user was created
    createdBy VARCHAR(36) not null -- NULL Who created the user
) ;


 -- Create the UsersHistory Table

CREATE TABLE IF NOT EXISTS UsersHistory (
    userHistoryId INT AUTO_INCREMENT PRIMARY KEY,
    userUniqueId VARCHAR(36) NOT NULL,  -- UUID of the user, foreign key to Users table
    fullName VARCHAR(255) NOT NULL,  -- Full name of the user
    phoneNumber VARCHAR(15) NOT NULL,  -- Phone number of the user
    email VARCHAR(55) NOT NULL,  -- Email of the user
    actionType ENUM('UPDATED', 'DELETED') NOT NULL,  -- Action that triggered this record
    actionBy VARCHAR(36) NULL,  -- User who triggered the update/delete action
    actionAt DATETIME NOT NULL,  -- When the action was taken
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId)  -- Reference to Users table
)  ;

-- Create the UsersCredential Table

CREATE TABLE IF NOT EXISTS usersCredential (
    credentialId INT AUTO_INCREMENT PRIMARY KEY,
    credentialUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for credentials
    userUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to Users
    hashedPassword VARCHAR(255) NOT NULL,  -- Hashed password
    OTP VARCHAR(100) NULL,  -- Optional one-time password
    usersCredentialCreatedAt DATETIME NOT NULL,  -- When the credentials were created
    usersCredentialDeletedAt DATETIME NULL,  -- When the credentials were deleted
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId)  -- Link to Users
)  ;

-- Create the DeviceTokens table (stores FCM/device tokens per device)

CREATE TABLE IF NOT EXISTS DeviceTokens (
    deviceTokenId INT AUTO_INCREMENT PRIMARY KEY,
    deviceTokenUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the device token record
    userUniqueId VARCHAR(36) NULL,                    -- Foreign key to Users (nullable for pre-login)
    roleId INT NOT NULL,                              -- Foreign key to Roles, users can have multiple roles, so we use roleId to identify the role
    token VARCHAR(255) NOT NULL,                      -- Raw FCM token
    platform ENUM('ios','android','web') NULL,        -- Device platform
    appVersion VARCHAR(32) NULL,                      -- App version on device
    locale VARCHAR(16) NULL,                          -- e.g., en-US
    lastSeenAt DATETIME NULL,                         -- Last time this token was seen/used
    revokedAt DATETIME NULL,                          -- If set, token is no longer active
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,     -- Created time
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, -- Updated time
    UNIQUE (token),
    INDEX idx_deviceTokens_userUniqueId (userUniqueId),
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (roleId) REFERENCES Roles(roleId)
) ;

-- VehicleDriver will be created after VehicleOwnership to satisfy FK order

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
    userRoleDeletedAt DATETIME NULL , -- When the user role was deleted
    INDEX idx_userRole_userUniqueId (userUniqueId),
    INDEX idx_userRole_roleId (roleId),
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId),  -- Link to Users
    FOREIGN KEY (roleId) REFERENCES Roles(roleId)  -- Link to Roles
)  ; 

-- Create the Statuses Table

CREATE TABLE IF NOT EXISTS Statuses (
    statusId INT AUTO_INCREMENT PRIMARY KEY,
    statusUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the status
    statusName VARCHAR(150) UNIQUE NOT NULL,  -- Name of the status
    statusDescription VARCHAR(255) NULL,  -- Description of the status
    statusCreatedBy VARCHAR(36) NOT NULL,  -- Who created the status
    statusUpdatedBy VARCHAR(36) NULL,  -- Who updated the status
    statusUpdatedAt DATETIME NULL,  -- When the status was updated
    statusDeletedBy VARCHAR(36) NULL,  -- Who deleted the status
    statusDeletedAt DATETIME NULL,  -- When the status was deleted
    statusCreatedAt DATETIME NOT NULL,  -- When the status was created
     FOREIGN KEY (statusCreatedBy) REFERENCES Users(userUniqueId)  -- Foreign key to Users
)  ;

-- Table to hold the current status of each user-role combination

CREATE TABLE IF NOT EXISTS UserRoleStatusCurrent (
    userRoleStatusId INT AUTO_INCREMENT PRIMARY KEY,
    userRoleStatusUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for user-role-status link
    statusId INT NOT NULL,  -- Foreign key to Statuses
    userRoleId INT NOT NULL,  -- Foreign key to UserRole
    userRoleStatusDescription TEXT NULL,  -- Description of the current role status
    userRoleStatusCreatedBy VARCHAR(36) NOT NULL,  -- Who created the current status
    userRoleStatusCreatedAt DATETIME NOT NULL,  -- When the current status was created  
    userRoleStatusCurrentVersion int not null default 1  ,
    foreign key (statusId) references Statuses(statusId),
    foreign key (userRoleId) references UserRole(userRoleId),
    foreign key (userRoleStatusCreatedBy) references Users(userUniqueId),
        -- Add indexes for frequently queried columns
    INDEX idx_userRoleStatusCurrent_userRoleId (userRoleId),
    INDEX idx_userRoleStatusCurrent_statusId (statusId),
    INDEX idx_userRoleStatusCurrent_userRoleStatusCreatedBy (userRoleStatusCreatedBy)
)  ;

-- Table to hold the history of all user-role statuses, including updates and deletions

CREATE TABLE IF NOT EXISTS UserRoleStatusHistory (
userRoleStatusHistoryId INT AUTO_INCREMENT PRIMARY KEY,
    userRoleStatusId int not null, -- Foreign key to UserRoleStatusCurrent
    userRoleStatusUniqueId VARCHAR(36)  NOT NULL,  -- UUID for user-role-status link (copied from current table)
    statusId INT NOT NULL,  -- Foreign key to Statuses
    userRoleId INT NOT NULL,  -- Foreign key to UserRole
    userRoleStatusDescription TEXT NULL,  -- Description of the role status (copied from current table)
    userRoleStatusCreatedBy VARCHAR(36) NOT NULL,  -- Who created the status (copied from current table)
    userRoleStatusCreatedAt DATETIME NOT NULL,  -- When the status was created (copied from current table)
    userRoleStatusUpdatedBy VARCHAR(36) NULL,  -- Who updated the status
    userRoleStatusUpdatedAt DATETIME NULL,  -- When the status was updated
    userRoleStatusDeletedBy VARCHAR(36) NULL,  -- Who deleted the status
    userRoleStatusDeletedAt DATETIME NULL, -- When the status was deleted
    userRoleStatusCurrentVersion int not null default 1,
    INDEX (userRoleId),  -- Index for faster lookups on user roles
    INDEX (statusId)  -- Index for faster lookups on status
)  ;

-- Create the DocumentTypes Table
-- if driver attach required documents like driving license ,uploadedDocumentName is used in file input field of front end and in backend to receive file name and same to others also. That is why we used uploadedDocument. It is a standard to transfer files from front end to backend using unique name. 
CREATE TABLE IF NOT EXISTS DocumentTypes (
    documentTypeId INT AUTO_INCREMENT PRIMARY KEY,
    documentTypeUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the document type list
    documentTypeName VARCHAR(50) UNIQUE NOT NULL,  -- Name of the document type (e.g., "ID", "License", "Plate")
    uploadedDocumentName  VARCHAR(50) UNIQUE NOT NULL, -- it is used in file input field of front end 
    uploadedDocumentTypeId  VARCHAR(50) UNIQUE NOT NULL, -- it is used in file input field of front end
    uploadedDocumentDescription  VARCHAR(50) UNIQUE NOT NULL, -- it is used in file input field of front end
    uploadedDocumentExpirationDate  VARCHAR(50) UNIQUE NOT NULL, -- it is used in file input field of front end
    uploadedDocumentFileNumber  VARCHAR(50) UNIQUE NOT NULL, -- it is used in file input field of front end to store file number
    documentTypeDescription  TEXT(2000)    not NULL ,  -- Optional description of the document type
    documentTypeCreatedBy VARCHAR(36) NOT NULL,  -- Who created the document type
    documentTypeCreatedAt DATETIME NOT NULL,  -- When the document type was created
    documentTypeUpdatedBy VARCHAR(36) NULL,
    documentTypeUpdatedAt DATETIME NULL,
    documentTypeDeletedBy VARCHAR(36) NULL,
    documentTypeDeletedAt DATETIME NULL,
    isDocumentTypeDeleted BOOLEAN NOT NULL DEFAULT FALSE,
    documentTypeCurrentVersion int not null default 1,
    INDEX idx_createdByUserId (documentTypeCreatedBy),  -- Index for fast lookups
    FOREIGN KEY (documentTypeCreatedBy) REFERENCES Users(userUniqueId)  -- Link to the Users table
)  ;

-- Create the DocumentTypesHistory Table 

CREATE TABLE IF NOT EXISTS DocumentTypesHistory (
    documentTypeHistoryId INT AUTO_INCREMENT PRIMARY KEY,
    documentTypeId INT NOT NULL,  -- Reference to the original DocumentTypes
    documentTypeUniqueId VARCHAR(36) NOT NULL,  -- UUID
    documentTypeName VARCHAR(255) NOT NULL,
    documentTypeDescription VARCHAR(255) NULL,
    documentTypeCreatedBy VARCHAR(36) NOT NULL,
    changeType ENUM('UPDATE', 'DELETE') NOT NULL,  -- Whether it was an update or delete
    documentTypeUpdatedBy VARCHAR(36) NULL,
    documentTypeDeletedBy VARCHAR(36) NULL,
    documentTypeCreatedAt DATETIME NOT NULL,
    changedByUserId VARCHAR(36) NOT NULL,  -- The user who made the change
    documentTypeUpdatedAt DATETIME NULL,
    documentTypeDeletedAt DATETIME NULL,
    documentTypeVersion INT NOT NULL DEFAULT 1,
    FOREIGN KEY (documentTypeId) REFERENCES DocumentTypes(documentTypeId)
)  ;

-- Create the RoleDocumentRequirements Table

    CREATE TABLE IF NOT EXISTS RoleDocumentRequirements(
    roleDocumentRequirementId INT AUTO_INCREMENT PRIMARY KEY,
    roleDocumentRequirementUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the requirement
    roleId INT NOT NULL,  -- Foreign key to the Roles table
    documentTypeId INT NOT NULL,  -- Foreign key to the DocumentTypes table
    isDocumentMandatory BOOLEAN NOT NULL DEFAULT TRUE,  -- Whether the document is mandatory for the role
    isFileNumberRequired BOOLEAN NOT NULL DEFAULT FALSE,  -- Whether a file number is required for the document
    isExpirationDateRequired BOOLEAN NOT NULL DEFAULT FALSE,  -- Whether the expiration date is required for the document
    isDescriptionRequired BOOLEAN NOT NULL DEFAULT FALSE, -- Whether description is required or not 
    roleDocumentRequirementCreatedBy VARCHAR(36) NOT NULL,  -- Who created the requirement
    roleDocumentRequirementUpdatedBy VARCHAR(36) NULL,  -- Who last updated the requirement
    roleDocumentRequirementDeletedBy VARCHAR(36) NULL,  -- Who deleted the requirement
    roleDocumentRequirementCreatedAt DATETIME NOT NULL,  -- When the requirement was created
    roleDocumentRequirementUpdatedAt DATETIME NULL,  -- When the requirement was updated
    roleDocumentRequirementDeletedAt DATETIME NULL,  -- When the requirement was deleted
    FOREIGN KEY (roleDocumentRequirementCreatedBy) REFERENCES Users(userUniqueId),  -- Link to the Users table
    FOREIGN KEY (roleDocumentRequirementUpdatedBy) REFERENCES Users(userUniqueId),  -- Link to the Users table
    FOREIGN KEY (roleDocumentRequirementDeletedBy) REFERENCES Users(userUniqueId),  -- Link to the Users table
    FOREIGN KEY (roleId) REFERENCES Roles(roleId),  -- Link to the Roles table
    FOREIGN KEY (documentTypeId) REFERENCES DocumentTypes(documentTypeId),  -- Link to the DocumentTypes table
    UNIQUE (roleId, documentTypeId)  -- Ensure each role can have each document type only once
)  ; 

-- Create the AttachedDocuments Table (Active Documents Only)

CREATE TABLE IF NOT EXISTS AttachedDocuments (
    attachedDocumentId INT AUTO_INCREMENT PRIMARY KEY,
    attachedDocumentUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the attached document
    userUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to Users and is used to show owner of documents
    attachedDocumentDescription VARCHAR(255) NULL,  -- Description of the attached document
    documentTypeId INT NOT NULL,  -- Foreign key to DocumentTypes
    attachedDocumentFileNumber VARCHAR(25) NULL,  -- File number associated with the attached document
    documentExpirationDate DATETIME NULL,  -- Expiration date for time-sensitive documents (e.g., licenses)
    attachedDocumentAcceptance ENUM('PENDING', 'ACCEPTED', 'REJECTED') NOT NULL DEFAULT 'PENDING',  -- Status of the attached document
    attachedDocumentName VARCHAR(255) NOT NULL,  -- Name of the attached document
    documentVersion INT NOT NULL DEFAULT 1,  -- Document version number (to track changes)
    attachedDocumentCreatedByUserId VARCHAR(36) NOT NULL,  -- Who created the attached document
    attachedDocumentCreatedAt DATETIME NOT NULL,  -- When the attached document was created
    attachedDocumentAcceptanceReason VARCHAR(255) NULL,  -- Reason for accepting or rejecting the attached document
    attachedDocumentAcceptedRejectedByUserId VARCHAR(36) NULL,  -- Who last updated the attached document
    attachedDocumentAcceptedRejectedAt DATETIME NULL,  -- When the attached document was last updated
    INDEX idx_userUniqueId (userUniqueId),  -- Index for fast lookups
    INDEX idx_documentTypeId (documentTypeId),  -- Index for fast lookups
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId),  -- Link to the Users table
    FOREIGN KEY (documentTypeId) REFERENCES DocumentTypes(documentTypeId)  -- Link to DocumentTypes
)  ; 
-- Create the AttachedDocumentsHistory Table (for Historical Records)

CREATE TABLE IF NOT EXISTS AttachedDocumentsHistory (
    attachedDocumentHistoryId INT AUTO_INCREMENT PRIMARY KEY,
    attachedDocumentId INT NOT NULL,  -- Reference to the original AttachedDocuments
    attachedDocumentUniqueId VARCHAR(36) NOT NULL,  -- UUID for the attached document (links to the current active document)
    userUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to Users
    attachedDocumentDescription VARCHAR(255) NULL,  -- Description of the attached document
    documentTypeId INT NOT NULL,  -- Foreign key to DocumentTypes
    documentExpirationDate DATETIME NULL,  -- Expiration date for time-sensitive documents (e.g., licenses)
    attachedDocumentAcceptance ENUM('PENDING', 'ACCEPTED', 'REJECTED') NOT NULL,  -- Status of the attached document
    attachedDocumentAcceptedRejectedByUserId VARCHAR(36) NULL,  -- Who last updated the attached document
    attachedDocumentAcceptedRejectedAt DATETIME NULL,  -- When the attached document was last updated
    attachedDocumentName VARCHAR(255) NOT NULL,  -- Name of the attached document
    attachedDocumentCreatedByUserId VARCHAR(36) NOT NULL,  -- Who created the attached document
    attachedDocumentUpdatedByUserId VARCHAR(36) NULL,  -- Who last updated the attached document
    attachedDocumentDeletedByUserId VARCHAR(36) NULL,  -- Who deleted the attached document
    attachedDocumentCreatedAt DATETIME NOT NULL,  -- When the attached document was created
    attachedDocumentUpdatedAt DATETIME NULL,  -- When the attached document was updated
    attachedDocumentDeletedAt DATETIME NULL,  -- When the attached document was deleted
    attachedDocumentIsExpired BOOLEAN NOT NULL DEFAULT FALSE,  -- Was the attached document expired
    attachedDocumentAcceptanceReason VARCHAR(255) NULL,  -- Reason for accepting or rejecting the attached document
    documentVersion INT NOT NULL DEFAULT 1,  -- Document version number (to track changes)
    INDEX idx_userUniqueId (userUniqueId),  -- Index for fast lookups
    INDEX idx_documentTypeId (documentTypeId),  -- Index for fast lookups
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId),  -- Link to the Users table
    FOREIGN KEY (documentTypeId) REFERENCES DocumentTypes(documentTypeId)  -- Link to DocumentTypes
)  ;

 
-- Create the PassengerRequest table

CREATE TABLE IF NOT EXISTS PassengerRequest (
    passengerRequestId INT AUTO_INCREMENT PRIMARY KEY,
    passengerRequestUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the passenger request

    userUniqueId VARCHAR(36) NOT NULL,                     -- Foreign key to Users
    passengerRequestBatchId VARCHAR(36) NOT NULL,  -- Batch ID for grouping requests
    vehicleTypeUniqueId VARCHAR(36) NOT NULL,              -- Foreign key to VehicleType
    journeyStatusId INT NOT NULL,                          -- Foreign key to JourneyStatus

    originLatitude DECIMAL(10, 8) NOT NULL,                -- Latitude of origin
    originLongitude DECIMAL(11, 8) NOT NULL,               -- Longitude of origin
    originPlace VARCHAR(255) NOT NULL,                     -- Origin place

    destinationLatitude DECIMAL(10, 8) DEFAULT 0.0,        -- Latitude of destination
    destinationLongitude DECIMAL(11, 8) DEFAULT 0.0,       -- Longitude of destination
    destinationPlace VARCHAR(255) DEFAULT '',              -- Destination place

    requestTime TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- Time of the request

    shippableItemName VARCHAR(100) DEFAULT NULL,           -- Name of the item to ship
    shippableItemQtyInQuintal DECIMAL(15,2) DEFAULT NULL,   -- Quantity in quintals
    shippingDate DATETIME DEFAULT NULL,                        -- Date of shipping
    deliveryDate DATETIME DEFAULT NULL,                        -- Date of delivery
    shippingCost DECIMAL(10,2) DEFAULT NULL,               -- Cost of the shipment
    isCompletionSeen BOOLEAN DEFAULT FALSE,               -- if it is completed and seen by passenger 
    shipperRequestCreatedBy VARCHAR(36) NOT NULL,          -- Who created the request an admin  from call center, passenger himself or driver take from street
    shipperRequestCreatedByRoleId INT NOT NULL,          -- roleId of the creator when it create this request


    foreign key (shipperRequestCreatedByRoleId) references Roles(roleId),
    foreign key (shipperRequestCreatedBy) references Users(userUniqueId),
    FOREIGN KEY (vehicleTypeUniqueId) REFERENCES VehicleTypes(vehicleTypeUniqueId),
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (journeyStatusId) REFERENCES JourneyStatus(journeyStatusId)
);

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
) ;

-- Create the JourneyDecisions table

CREATE TABLE IF NOT EXISTS JourneyDecisions (
    journeyDecisionId INT AUTO_INCREMENT PRIMARY KEY,
    journeyDecisionUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for journey decision
    passengerRequestId INT NOT NULL,  -- Foreign key to PassengerRequest
    driverRequestId INT UNIQUE NOT NULL,  -- Foreign key to DriverRequest
    journeyStatusId INT NOT NULL,  -- Foreign key to JourneyStatus
    decisionTime TIMESTAMP NOT NULL,  -- Time of the decision
    decisionBy ENUM('passenger', 'driver', 'admin') NOT NULL,  -- Who made the decision

    shippingDateByDriver DATETIME DEFAULT NULL,                        -- Date of shipping
    deliveryDateByDriver DATETIME DEFAULT NULL,                        -- Date of delivery
    shippingCostByDriver DECIMAL(10,2) DEFAULT NULL,               -- Cost of the shipment
    
    FOREIGN KEY (passengerRequestId) REFERENCES PassengerRequest(passengerRequestId),
    FOREIGN KEY (driverRequestId) REFERENCES DriverRequest(driverRequestId),
    FOREIGN KEY (journeyStatusId) REFERENCES JourneyStatus(journeyStatusId)
) ;

-- Create the Journey table

CREATE TABLE IF NOT EXISTS Journey (
    journeyId INT AUTO_INCREMENT PRIMARY KEY,
    journeyUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the journey
    journeyDecisionUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- Foreign key to JourneyDecisions
    startTime TIMESTAMP NOT NULL default CURRENT_TIMESTAMP,  -- Journey start time
    endTime TIMESTAMP NULL,  -- Journey end time
    fare DECIMAL(10, 2) DEFAULT 0,  -- Fare for the journey
    journeyStatusId INT NOT NULL,  -- Foreign key to JourneyStatus
    FOREIGN KEY (journeyDecisionUniqueId) REFERENCES JourneyDecisions(journeyDecisionUniqueId),
    FOREIGN KEY (journeyStatusId) REFERENCES JourneyStatus(journeyStatusId)
) ;
-- Create the JourneyRoutePoints table to register each points

CREATE TABLE IF NOT EXISTS JourneyRoutePoints (
    pointId INT AUTO_INCREMENT PRIMARY KEY,
    journeyRoutePointsUniqueId varchar(36) NOT NULL, 
    journeyDecisionUniqueId varchar(36) NOT NULL,  -- Foreign key to the Journey table
    latitude DECIMAL(10, 8) NOT NULL,  -- Latitude of the GPS point
    longitude DECIMAL(11, 8) NOT NULL,  -- Longitude of the GPS point
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- Timestamp of when the GPS point was recorded
    FOREIGN KEY (journeyDecisionUniqueId) REFERENCES JourneyDecisions(journeyDecisionUniqueId) ON DELETE CASCADE  -- Link to the JourneyDecisions table
);


-- Create the Vehicle table

    CREATE TABLE IF NOT EXISTS Vehicle (
    vehicleId INT AUTO_INCREMENT PRIMARY KEY,
    vehicleUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the vehicle
    vehicleTypeUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to VehicleType
    licensePlate VARCHAR(50) NOT NULL,  -- License plate of the vehicle
    color VARCHAR(50) NOT NULL,  -- Color of the vehicle
    vehicleCreatedBy VARCHAR(36) NOT NULL,  -- Who created the vehicle
    vehicleUpdatedBy VARCHAR(36) NULL,  -- Who updated the vehicle
    vehicleUpdatedAt DATETIME NULL,  -- Vehicle update date
    vehicleDeletedBy VARCHAR(36) NULL,  -- Who deleted the vehicle
    vehicleCreatedAt DATETIME NOT NULL,  -- Vehicle creation date
    vehicleDeletedAt DATETIME NULL,  -- Vehicle deletion date
    FOREIGN KEY (vehicleTypeUniqueId) REFERENCES VehicleTypes(vehicleTypeUniqueId)
) ; 

 
-- Create the VehicleStatusType table

CREATE TABLE IF NOT EXISTS VehicleStatusType (
    VehicleStatusTypeId INT AUTO_INCREMENT PRIMARY KEY,
    VehicleStatusTypeName VARCHAR(50) NOT NULL,  -- Name of the vehicle status type
    VehicleStatusTypeDescription VARCHAR(255) NULL,  -- Description of the vehicle status type
    VehicleStatusTypeCreatedBy VARCHAR(36) NOT NULL,  -- Who created the vehicle status type
    VehicleStatusTypeUpdatedBy VARCHAR(36) NULL,  -- Who updated the vehicle status type
    VehicleStatusTypeUpdatedAt DATETIME NULL,  -- Updated time
    VehicleStatusTypeDeletedBy VARCHAR(36) NULL,  -- Who deleted the vehicle status type
    VehicleStatusTypeDeletedAt DATETIME NULL,  -- Deleted time
    VehicleStatusTypeCreatedAt DATETIME NOT NULL  -- Creation time
 );

-- Create the VehicleStatus table

CREATE TABLE IF NOT EXISTS VehicleStatus (
    vehicleStatusId INT AUTO_INCREMENT PRIMARY KEY,
    vehicleStatusUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the vehicle status
    vehicleUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to Vehicle
    VehicleStatusTypeId INT NOT NULL,  -- Foreign key to VehicleStatusType
    statusStartDate DATETIME NOT NULL,  -- Status start date
    statusEndDate DATETIME NULL,  -- Status end date
    FOREIGN KEY (vehicleUniqueId) REFERENCES Vehicle(vehicleUniqueId),
    FOREIGN KEY (VehicleStatusTypeId) REFERENCES VehicleStatusType(VehicleStatusTypeId)
) ;

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
)  ;

-- Create the VehicleDriver table (relation among vehicle, ownership and driver)

CREATE TABLE IF NOT EXISTS VehicleDriver (
    vehicleDriverId INT AUTO_INCREMENT PRIMARY KEY,
    vehicleDriverUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the assignment
    vehicleUniqueId VARCHAR(36) NOT NULL,               -- FK to Vehicle
    ownershipUniqueId VARCHAR(36) NOT NULL,             -- FK to VehicleOwnership (owner at assignment time)
    driverUserUniqueId VARCHAR(36) NOT NULL,            -- FK to Users (driver)
    assignmentStatus ENUM('active','inactive') NOT NULL DEFAULT 'active',
    assignmentStartDate DATETIME NOT NULL,
    assignmentEndDate DATETIME NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_vehicleDriver_vehicle (vehicleUniqueId),
    INDEX idx_vehicleDriver_ownership (ownershipUniqueId),
    INDEX idx_vehicleDriver_driver (driverUserUniqueId),
    FOREIGN KEY (vehicleUniqueId) REFERENCES Vehicle(vehicleUniqueId),
    FOREIGN KEY (ownershipUniqueId) REFERENCES VehicleOwnership(ownershipUniqueId),
    FOREIGN KEY (driverUserUniqueId) REFERENCES Users(userUniqueId)
) ;

-- Create the Ratings table

CREATE TABLE IF NOT EXISTS Ratings (
    ratingId INT AUTO_INCREMENT PRIMARY KEY,
    journeyId VARCHAR(36) NOT NULL,  -- Foreign key to Journey
    ratedBy VARCHAR(36) NOT NULL,  -- Foreign key to Users (who gave the rating)
    rating INT NOT NULL,  -- Rating score
    comment TEXT NULL  -- Rating comment
    -- ,FOREIGN KEY (journeyId) REFERENCES Journey(journeyId),
    --  FOREIGN KEY (ratedBy) REFERENCES Users(userUniqueId)
) ;

-- Create the SMSSender table

CREATE TABLE IF NOT EXISTS SMSSender (
    SMSSenderId INT AUTO_INCREMENT PRIMARY KEY, 
    phoneNumber VARCHAR(50) NOT NULL,  -- Phone number of SMS sender
    password VARCHAR(255) NOT NULL  -- Password of SMS sender
) ;

 -- Create the CancellationReasonsType table

CREATE TABLE IF NOT EXISTS CancellationReasonsType (
    cancellationReasonsTypeId INT AUTO_INCREMENT PRIMARY KEY, 
    cancellationReasonTypeUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for cancellation reason
    cancellationReason VARCHAR(150) NOT NULL,  -- Type of cancellation reason
    roleId int NOT NULL  -- Who canceled (could be driver, passenger, or admin)
    ,foreign key (roleId) references Roles(roleId)
) ;
 
-- Create the PaymentMethod table

CREATE TABLE IF NOT EXISTS PaymentMethod (
    paymentMethodId INT AUTO_INCREMENT PRIMARY KEY,
    paymentMethodUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for payment method
    paymentMethod VARCHAR(50) NOT NULL,  -- Name of the payment method (e.g., on cash, by bank, by tele birr)
    createdAt DATETIME NOT NULL  -- Creation time of the payment method
) ;  

 -- Create the PaymentStatus table

CREATE TABLE IF NOT EXISTS PaymentStatus (
    paymentStatusId INT AUTO_INCREMENT PRIMARY KEY,
    paymentStatusUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for payment status
    paymentStatus VARCHAR(50) UNIQUE NOT NULL,  -- Payment status (e.g., Pending, Completed, Failed)
    createdAt DATETIME NOT NULL,  -- Creation time of the payment status
    deletedAt DATETIME NULL  -- Deletion time of the payment status
) ;


-- Create the Payments table where passenger pay to driver

CREATE TABLE IF NOT EXISTS Payments (
    paymentId INT AUTO_INCREMENT PRIMARY KEY,
    paymentUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for payment
    driverUniqueId VARCHAR(36) NOT NULL,
    passengerUniqueId VARCHAR(36) NOT NULL,
    journeyUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to Journey
    amount DECIMAL(10, 2) NOT NULL,  -- Payment amount
    paymentMethodUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to PaymentMethod
    paymentStatusUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to PaymentStatus
    paymentTime TIMESTAMP NOT NULL  -- Time of payment
 , FOREIGN KEY (journeyUniqueId) REFERENCES Journey(journeyUniqueId),
     FOREIGN KEY (paymentMethodUniqueId) REFERENCES PaymentMethod(paymentMethodUniqueId),
     FOREIGN KEY (paymentStatusUniqueId) REFERENCES PaymentStatus(paymentStatusUniqueId),
     FOREIGN KEY (driverUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (passengerUniqueId) REFERENCES Users(userUniqueId)
) ;
 
 --  CREATE TABLE CanceledJourneys 
 
 CREATE TABLE IF NOT EXISTS CanceledJourneys (
    canceledJourneyId INT AUTO_INCREMENT PRIMARY KEY,
    canceledJourneyUniqueId VARCHAR(36) NOT NULL,  -- UUID for this cancellation record
    contextId INT NOT NULL,  -- ID from the relevant table (passenger request, driver request, journey decision, or journey)
    roleId INT NOT NULL,  -- ID from the Roles table
    contextType ENUM('PassengerRequest', 'DriverRequest', 'JourneyDecisions', 'Journey') NOT NULL,  -- Type of context being referenced
    driverUserUniqueId VARCHAR(36) , 
    passengerUserUniqueId VARCHAR(36),
    canceledBy VARCHAR(36) NOT NULL,  -- User who canceled (foreign key to Users)
    cancellationReasonsTypeId INT NOT NULL,  -- Reference to predefined cancellation reason
    canceledTime TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- Time of cancellation
    isSeenByAdmin TINYINT(1) NOT NULL DEFAULT 0,
   FOREIGN KEY (roleId) references Roles(roleId),
    FOREIGN KEY (cancellationReasonsTypeId) REFERENCES CancellationReasonsType(cancellationReasonsTypeId),
    FOREIGN KEY (canceledBy) REFERENCES Users(userUniqueId)
); 
-- tariff rate table

    CREATE TABLE IF NOT EXISTS TariffRate (
    tariffRateId INT AUTO_INCREMENT PRIMARY KEY,
    tariffRateUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for tariff rate
    standingTariffRate VARCHAR(50) NOT NULL,  -- a tariff rate where driver comes to passengers pick up place
    journeyTariffRate VARCHAR(50) NOT NULL,  -- a tariff rate between a place where driver pick up a passengers up to destination place and can be calculated by km
    timingTariffRate VARCHAR(50) NOT NULL,  -- a tariff rate between a place where driver pick up a passengers up to destination place and can be calculated by time
    tariffRateEffectiveDate DATE NOT NULL,  -- The date from which this rate is effective
    tariffRateExpirationDate DATE NOT NULL,  -- The date after which this rate is no longer effective
    tariffRateDescription TEXT NOT NULL,  -- Description of tariff rate
    tariffRateCreatedBy VARCHAR(36) NOT NULL,  -- Who created the tariff rate
    tariffRateCreatedAt DATETIME NOT NULL  -- Creation time of the tariff rate
) ;

 -- Create the TariffRateForVehicleTypes table

CREATE TABLE IF NOT EXISTS TariffRateForVehicleTypes (
    tariffRateForVehicleTypeId INT AUTO_INCREMENT PRIMARY KEY,
    
    tariffRateForVehicleTypeUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for tariff rate
    vehicleTypeUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to VehicleType
    tariffRateUniqueId varchar(36) NOT NULL  -- Foreign key to tariffRate
   , FOREIGN KEY (vehicleTypeUniqueId) REFERENCES VehicleTypes(vehicleTypeUniqueId),
    FOREIGN KEY (tariffRateUniqueId) REFERENCES TariffRate(tariffRateUniqueId)
) ;
 -- Create the CommissionRates table

 CREATE TABLE IF NOT EXISTS CommissionRates (
    commissionRateId INT AUTO_INCREMENT PRIMARY KEY,
    commissionRateUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for commission
    commissionRate DECIMAL(5, 2) NOT NULL,  -- Commission rate as a percentage (e.g., 10 for 10%)
    commissionRateEffectiveDate DATE NOT NULL,            -- The date from which this rate is effective
    commissionRateExpirationDate DATE NOT NULL,            -- The date after which this rate is no longer effective
    commissionRateCreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    commissionRateUpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    commissionRateDeletedAt DATETIME NULL,
    commissionRateCreatedBy VARCHAR(36) NOT NULL,  -- Who created the commission rate
    commissionRateUpdatedBy VARCHAR(36) NULL,  -- Who updated the commission rate
    commissionRateDeletedBy VARCHAR(36) NULL, -- Who deleted the commission rate
    FOREIGN KEY (commissionRateCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (commissionRateUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (commissionRateDeletedBy) REFERENCES Users(userUniqueId)
 );

-- commission table for every payment 

    CREATE TABLE IF NOT EXISTS Commission (
    commissionId INT AUTO_INCREMENT PRIMARY KEY,
    commissionUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for commission
   paymentUniqueId varchar(36) NOT NULL,  -- Foreign key to Payments if it is journey base charges not time base charges
    commissionRateUniqueId varchar(36) NOT NULL,  -- Foreign key to CommissionRates
    commissionAmount DECIMAL(10, 2) NOT NULL,  -- Commission amount
    FOREIGN KEY (paymentUniqueId) REFERENCES Payments(paymentUniqueId),
    FOREIGN KEY (commissionRateUniqueId) REFERENCES CommissionRates(commissionRateUniqueId)
);



CREATE TABLE IF NOT EXISTS SubscriptionPlan (
  subscriptionPlanId INT AUTO_INCREMENT PRIMARY KEY,
  subscriptionPlanUniqueId VARCHAR(36) NOT NULL UNIQUE,
  planName VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  isFree BOOLEAN DEFAULT FALSE,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);


--  pricing for Subscription Plan Dynamic by effective date
CREATE TABLE IF NOT EXISTS SubscriptionPlanPricing (
  pricingId INT AUTO_INCREMENT PRIMARY KEY,
  subscriptionPlanPricingUniqueId VARCHAR(36) NOT NULL UNIQUE,
  subscriptionPlanUniqueId VARCHAR(36) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  durationInDays INT NOT NULL,
  effectiveFrom DATE NOT NULL,
  effectiveTo DATE DEFAULT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subscriptionPlanUniqueId) REFERENCES SubscriptionPlan(subscriptionPlanUniqueId)
);

-- subscription to driver 

CREATE TABLE IF NOT EXISTS DriverSubscription (
  driverSubscriptionId INT AUTO_INCREMENT PRIMARY KEY,
  driverSubscriptionUniqueId VARCHAR(36) NOT NULL UNIQUE,
  driverUniqueId VARCHAR(36) NOT NULL,
  subscriptionPlanUniqueId varchar(36) NOT NULL,
  startDate DATETIME NOT NULL,
  endDate DATETIME NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (driverUniqueId) REFERENCES Users(userUniqueId),
  FOREIGN KEY (subscriptionPlanUniqueId) REFERENCES SubscriptionPlan(subscriptionPlanUniqueId)
);



-- driver deposit table lists


--   Master table for deposit sources (enum replacement)
CREATE TABLE IF NOT EXISTS DepositSource (
  depositSourceId INT AUTO_INCREMENT PRIMARY KEY,
  depositSourceUniqueId VARCHAR(36) NOT NULL UNIQUE,  -- UUID
  sourceKey VARCHAR(50) NOT NULL UNIQUE,              -- e.g., 'driver', 'bonus'
  sourceLabel VARCHAR(100) NOT NULL,                  -- e.g., 'Paid by Driver'
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);


-- Seed initial deposit sources
-- INSERT INTO DepositSource (sourceKey, sourceLabel) VALUES
  -- ('driver', 'Paid by Driver'),
  -- ('bonus', 'Referral Bonus'),
  -- ('admin', 'Manual Admin Deposit'),
  -- ('transfer', 'Transferred from Another Driver');

CREATE TABLE IF NOT EXISTS FinancialInstitutionAccounts (
  accountId INT AUTO_INCREMENT PRIMARY KEY,
  accountUniqueId VARCHAR(36) UNIQUE NOT NULL, -- UUID
  institutionName VARCHAR(100) NOT NULL,       -- e.g., 'Telebirr', 'CBE'
  accountHolderName VARCHAR(100) NOT NULL,     -- Person or entity name
  accountNumber VARCHAR(50) NOT NULL,          -- The actual account number
  accountType ENUM('bank', 'mobile_money', 'wallet') DEFAULT 'bank', -- optional
  isActive BOOLEAN DEFAULT TRUE,               -- To mark active/inactive accounts
  addedBy VARCHAR(36),                         -- admin or system user ID
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
--  Main table representing driver subscriptions via deposits
CREATE TABLE IF NOT EXISTS DriverDeposit (
  driverDepositId INT AUTO_INCREMENT PRIMARY KEY,
  driverDepositUniqueId VARCHAR(36) NOT NULL UNIQUE,
  driverUniqueId VARCHAR(36) NOT NULL,
  depositAmount DOUBLE NOT NULL,
  depositSourceUniqueId VARCHAR(36) NOT NULL,
  accountUniqueId varchar(36) null, 
  depositStatus enum('requested','approved','rejected','FAILED','PENDING','COMPLETED') default "requested",
  depositURL text NOT NULL,
  depositTime DATETIME NOT NULL,
  acceptRejectReason VARCHAR(2000),
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (accountUniqueId) REFERENCES FinancialInstitutionAccounts(accountUniqueId),
  
  FOREIGN KEY (driverUniqueId) REFERENCES Users(userUniqueId),
  FOREIGN KEY (depositSourceUniqueId) REFERENCES DepositSource(depositSourceUniqueId)
);

-- free gift records for drivers to encourage them to use the app
CREATE TABLE IF NOT EXISTS FreeGiftToDriver (
  freeGiftId INT AUTO_INCREMENT PRIMARY KEY,
  freeGiftUniqueId VARCHAR(36) NOT NULL UNIQUE,
  driverUniqueId VARCHAR(36) NOT NULL,
  subscriptionPlanUniqueId VARCHAR(36) NOT NULL, -- Foreign key to SubscriptionPlan
  
  giftCreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,     
  giftStartDate DATETIME NOT NULL, -- When the gift is valid from
  giftEndDate DATETIME NOT NULL, -- When the gift is valid until,
  isFreeGiftDeleted BOOLEAN DEFAULT FALSE, -- Soft delete flag,
  freeGiftDeletedAt DATETIME NULL, -- When the gift was deleted
  freeGiftDeletedBy VARCHAR(36) NULL, -- Who deleted the gift

 freeGiftUpdatedBy VARCHAR(36) NULL, -- Who updated the gift
 freeGiftUpdatedAt DATETIME NULL, -- When the gift was updated
    
    FOREIGN KEY (driverUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (subscriptionPlanUniqueId) REFERENCES SubscriptionPlan(subscriptionPlanUniqueId)
);

 

-- . Logs any deposit transferred from one driver to another
CREATE TABLE IF NOT EXISTS DriverBalanceTransfer (
  depositTransferId INT AUTO_INCREMENT PRIMARY KEY,
  depositTransferUniqueId VARCHAR(36) NOT NULL UNIQUE,
  fromDriverUniqueId VARCHAR(36) NOT NULL,
  toDriverUniqueId VARCHAR(36) NOT NULL,
  transferredAmount DECIMAL(10, 2) NOT NULL,
  reason TEXT,
  transferTime DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  transferredBy VARCHAR(36),
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fromDriverUniqueId) REFERENCES Users(userUniqueId),
  FOREIGN KEY (toDriverUniqueId) REFERENCES Users(userUniqueId)
);



 


CREATE TABLE IF NOT EXISTS DriverRefund (
  driverRefundId INT AUTO_INCREMENT PRIMARY KEY, -- Auto-incremented unique identifier for each refund record

  driverRefundUniqueId VARCHAR(36) NOT NULL UNIQUE, -- UUID used to uniquely identify each refund transaction across systems

  driverUniqueId VARCHAR(36) NOT NULL,  -- Foreign key referencing the driver receiving the refund (from Users.userUniqueId)

  refundAmount DECIMAL(10, 2) NOT NULL CHECK (refundAmount > 0), -- Amount of money refunded to the driver (must be greater than 0)

  refundReason TEXT, -- Optional explanation or reason for issuing the refund

  refundedBy VARCHAR(36), -- UUID of the admin or system user who approved or issued the refund

  refundStatus ENUM('requested','approved') NOT NULL  DEFAULT 'requested', -- Status of the refund: either 'requested' (pending) or 'approved'

  accountUniqueId VARCHAR(36),   -- Financial account (institution) where the refund is deposited (FK to FinancialInstitutionAccounts)

  refundUrl TEXT,   -- ✅ Receipt or proof document URL sent to the institution upon refund approval

  refundDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, -- Date and time when the refund was issued or logged

  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,  -- Timestamp when the refund record was created

  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,  -- Timestamp that auto-updates when the row is modified

  FOREIGN KEY (driverUniqueId) REFERENCES Users(userUniqueId),
  FOREIGN KEY (accountUniqueId) REFERENCES FinancialInstitutionAccounts(accountUniqueId),
 FOREIGN KEY (refundedBy) REFERENCES Users(userUniqueId)
);


-- a table to store drivers balance after Commission to payment or deposit

CREATE TABLE IF NOT EXISTS DriverBalance (
    driverBalanceId INT AUTO_INCREMENT PRIMARY KEY,
    driverBalanceUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for driver balance
    userUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to Users driver
    transactionType enum('Deposit', 'Commission','Transfer','Refund','Subscription',"freeGift") NOT NULL,  -- Type of transaction
    transactionUniqueId VARCHAR(36) NOT NULL,  -- UUID for 'Deposit', 'Commission','Transfer','Refund','Subscription'
    transactionTime DATETIME NOT NULL,  -- Time of transaction
    netBalance DECIMAL(10, 2) NOT NULL,  -- Balance which is previous balance + (deposit or - Commission)
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId)
) ; 

-- create  JourneyNotifications table which is used as  
CREATE TABLE IF NOT EXISTS JourneyNotifications (
    journeyNotificationId INT AUTO_INCREMENT PRIMARY KEY,  -- Primary key
    journeyNotificationUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for notification
    journeyUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to Journey (UUID)
    journeyStatusUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to JourneyStatus (UUID)
    message VARCHAR(255) NULL,  -- Optional message for notification
    isSeen TINYINT(1) DEFAULT 0,  -- 0 = Unseen, 1 = Seen
    journeyNotificationCreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- Created time
    journeyNotificationUpdatedAt DATETIME NULL DEFAULT NULL,  -- Updated time (optional)
    
    -- Foreign key to Journey table
    FOREIGN KEY (journeyUniqueId) REFERENCES Journey(journeyUniqueId),
    
    -- Foreign key to JourneyStatus table
    FOREIGN KEY (journeyStatusUniqueId) REFERENCES JourneyStatus(journeyStatusUniqueId),

    -- Unique constraint to avoid duplicate journey-status notifications
    UNIQUE (journeyUniqueId, journeyStatusUniqueId)
);
 
-- DelinquencyTypes table  is used to define delinquency type definitions with point values
CREATE TABLE IF NOT EXISTS DelinquencyTypes (
    delinquencyTypeId INT AUTO_INCREMENT PRIMARY KEY,
    delinquencyTypeUniqueId VARCHAR(36) UNIQUE NOT NULL,
    delinquencyTypeName VARCHAR(50) NOT NULL UNIQUE,  -- e.g., 'late_arrival', 'rude_behavior'
    delinquencyTypeDescription TEXT NOT NULL,
    defaultPoints INT NOT NULL DEFAULT 1,
    defaultSeverity ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'MEDIUM',
    applicableRoles VARCHAR(36) NOT NULL,  -- Which roles this applies to roleUniqueId
    isActive BOOLEAN NOT NULL DEFAULT TRUE,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- foreign key to role
    FOREIGN KEY (applicableRoles) REFERENCES Roles(roleUniqueId)
);
-- User Delinquency table  is used to track delinquency for specific user-role combinations
CREATE TABLE IF NOT EXISTS UserDelinquency (
    userDelinquencyId INT AUTO_INCREMENT PRIMARY KEY,
    userDelinquencyUniqueId VARCHAR(36) UNIQUE NOT NULL,
    userRoleUniqueId VARCHAR(36) NOT NULL,  -- Specific user-role combination
    delinquencyTypeUniqueId VARCHAR(36) NOT NULL,   -- e.g., 'late_arrival', 'cancellation', 'misbehavior'
    delinquencyDescription TEXT NOT NULL,
    delinquencySeverity ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'MEDIUM',
    delinquencyPoints INT NOT NULL DEFAULT 1,  -- Points assigned for this delinquency
    delinquencyCreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    delinquencyUpdatedAt DATETIME NULL DEFAULT NULL,
    delinquencyCreatedBy VARCHAR(36) NOT NULL DEFAULT 'system',  -- 'system' for automatic bans
    FOREIGN KEY (userRoleUniqueId) REFERENCES UserRole(userRoleUniqueId),
    FOREIGN KEY (delinquencyCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (delinquencyTypeUniqueId) REFERENCES DelinquencyTypes(delinquencyTypeUniqueId),
    INDEX idx_userrole_severity (userRoleUniqueId, delinquencySeverity),
    INDEX idx_created_severity (delinquencyCreatedAt, delinquencySeverity)
);

-- Banned Users table - Automatic role-based banning
CREATE TABLE IF NOT EXISTS BannedUsers (
    banId INT AUTO_INCREMENT PRIMARY KEY,
    banUniqueId VARCHAR(36) UNIQUE NOT NULL,
    userDelinquencyUniqueId VARCHAR(36) NOT NULL,  -- The triggering delinquency
    banAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    bannedBy VARCHAR(36) NOT NULL DEFAULT 'system',  -- 'system' for automatic bans
    banReason TEXT NOT NULL,
    banDurationDays INT NOT NULL,  -- Duration in days (7, 30, 90, etc.)
    banExpiresAt DATETIME NOT NULL,  -- Calculated: banAt + banDurationDays
    isActive BOOLEAN NOT NULL DEFAULT TRUE,
    FOREIGN KEY (userDelinquencyUniqueId) REFERENCES UserDelinquency(userDelinquencyUniqueId),
     INDEX idx_ban_expires (banExpiresAt, isActive)
);
 
`;

module.exports = { sqlQuery };
