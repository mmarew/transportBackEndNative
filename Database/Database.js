const sqlQuery = `

-- Ensure session defaults use InnoDB and utf8mb4 for all created tables
SET default_storage_engine=INNODB;
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET character_set_client = utf8mb4;
SET character_set_connection = utf8mb4;
SET collation_connection = utf8mb4_unicode_ci;

-- Create the Users Table FIRST (no FK dependencies)

CREATE TABLE IF NOT EXISTS Users (
    userId INT AUTO_INCREMENT PRIMARY KEY,
    userUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the user
    fullName VARCHAR(255),  -- Full name of the user
    phoneNumber VARCHAR(20) NOT NULL UNIQUE,  -- Phone number of the user
    email VARCHAR(255) NOT NULL UNIQUE,  -- Email of the user
    isPhoneVerified BOOLEAN NOT NULL DEFAULT FALSE, -- True if the user has successfully entered a phone OTP
    isEmailVerified BOOLEAN NOT NULL DEFAULT FALSE, -- True if the user has clicked their email verification link
    userCreatedAt DATETIME NOT NULL,  -- When the user was created
    userCreatedBy VARCHAR(36) NOT NULL,  -- Who created the user
    userDeletedAt DATETIME NULL,  -- When the user was deleted
    userDeletedBy VARCHAR(36) NULL,  -- Who deleted the user
    isDeleted BOOLEAN NOT NULL DEFAULT FALSE,  -- Soft deletion flag
    INDEX idx_users_isDeleted (isDeleted),
    INDEX idx_users_deletedAt (userDeletedAt),
    INDEX idx_users_phoneNumber (phoneNumber)
);

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
    vehicleTypeIconName VARCHAR(255) NULL,  -- Icon name of the vehicle type
    vehicleTypeDescription VARCHAR(255) NULL,  -- Description of the vehicle type
    vehicleTypeCreatedBy VARCHAR(36) NOT NULL,  -- Who created the vehicle type
    vehicleTypeUpdatedBy VARCHAR(36) NULL,  -- Who updated the vehicle type
    vehicleTypeDeletedBy VARCHAR(36) NULL,  -- Who deleted the vehicle type
    carryingCapacity INT NULL,  -- Max carrying capacity in quintal
    -- cargoType: what kind of cargo this vehicle class supports
    --   'bulk_only'      → open flatbed / curtain-sider; cannot carry ISO containers
    --   'container_only' → specialised rig (low-bed multi-axle); containers only
    --   'both'           → can carry bulk cargo OR ISO containers interchangeably
    cargoType ENUM('bulk_only', 'container_only', 'both') NOT NULL DEFAULT 'bulk_only',
    vehicleTypeUpdatedAt DATETIME NULL,  -- Vehicle type update date
    vehicleTypeCreatedAt DATETIME NOT NULL,  -- Vehicle type creation date
    vehicleTypeDeletedAt DATETIME NULL  -- Vehicle type deletion date
) ; 

 -- Create the JourneyStatus table

CREATE TABLE IF NOT EXISTS JourneyStatus (
    journeyStatusId INT AUTO_INCREMENT PRIMARY KEY,
    journeyStatusUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for journey status
    journeyStatusName VARCHAR(50) NOT NULL,  -- Name of the journey status
    journeyStatusDescription VARCHAR(2255) NULL,  -- Description of the journey status
    journeyStatusCreatedBy VARCHAR(36) NOT NULL,  -- Who created the journey status
    journeyStatusUpdatedBy VARCHAR(36) NULL,  -- Who updated the journey status
    journeyStatusDeletedBy VARCHAR(36) NULL,  -- Who deleted the journey status
    journeyStatusCreatedAt DATETIME NOT NULL,  -- When the journey status was created
    journeyStatusUpdatedAt DATETIME NULL,  -- When the journey status was updated
    journeyStatusDeletedAt DATETIME NULL,  -- When the journey status was deleted
    FOREIGN KEY (journeyStatusCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (journeyStatusUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (journeyStatusDeletedBy) REFERENCES Users(userUniqueId)
) ;


 -- Create the UsersHistory Table

CREATE TABLE IF NOT EXISTS UsersHistory (
    userHistoryId INT AUTO_INCREMENT PRIMARY KEY,
    userUniqueId VARCHAR(36) NOT NULL,  -- UUID of the user, foreign key to Users table
    fullName VARCHAR(255) NOT NULL,  -- Full name of the user
    phoneNumber VARCHAR(20) NOT NULL,  -- Phone number of the user
    email VARCHAR(255) NOT NULL,  -- Email of the user
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
    -- Hybrid Verification Logic Overview:
    -- 1. Unverified: Phone gets phoneVerificationOTP (SMS), Email gets emailVerificationToken (Link).
    -- 2. Verified: Both get the same emailVerificationOTP/phoneVerificationOTP (Unified OTP mode).
    sharedOTP VARCHAR(255) NOT NULL,              -- Legacy fallback (usually stores hashed phoneVerificationOTP)
    phoneVerificationOTP VARCHAR(255) NULL,             -- Hashed 6-digit code sent via SMS
    emailVerificationOTP VARCHAR(255) NULL,             -- Hashed 6-digit code sent via Email (Unified mode only)
    emailVerificationToken VARCHAR(255) NULL,      -- Secret UUID for the "Click to Verify" email link
    emailVerificationExpiresAt DATETIME NULL,      -- Link expiration time (standard 2 hours)
    hashedPassword VARCHAR(255) NOT NULL,   -- Storeshashed OTP (used for the initial login/verification)
    usersCredentialCreatedBy VARCHAR(36) NULL,  -- Who created the credential (nullable for initial seeding)
    usersCredentialUpdatedBy VARCHAR(36) NULL,  -- Who updated the credential
    usersCredentialDeletedBy VARCHAR(36) NULL,  -- Who deleted the credential
    usersCredentialCreatedAt DATETIME NOT NULL,  -- When the credential was created
    usersCredentialUpdatedAt DATETIME NULL,  -- When the credential was updated
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (usersCredentialCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (usersCredentialUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (usersCredentialDeletedBy) REFERENCES Users(userUniqueId)
) ;

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
    deviceTokenCreatedBy VARCHAR(36) NULL,            -- Who created the device token
    deviceTokenUpdatedBy VARCHAR(36) NULL,            -- Who updated the device token
    deviceTokenDeletedBy VARCHAR(36) NULL,            -- Who deleted the device token
    deviceTokenCreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,     -- Created time
    deviceTokenUpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, -- Updated time
    deviceTokenDeletedAt DATETIME NULL,               -- When the device token was deleted
    UNIQUE (token),
    INDEX idx_deviceTokens_userUniqueId (userUniqueId),
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (roleId) REFERENCES Roles(roleId),
    FOREIGN KEY (deviceTokenCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (deviceTokenUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (deviceTokenDeletedBy) REFERENCES Users(userUniqueId)
) ;

 
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

    -- Request mode: controls whether this is open to individual drivers or targeted at one company
    requestMode ENUM('individual_target', 'company_target') NOT NULL DEFAULT 'individual_target',
    -- Only set when requestMode = 'company_target'; the specific company the shipper is targeting
    targetCompanyUniqueId VARCHAR(36) NULL DEFAULT NULL,

    originLatitude DECIMAL(10, 8) NOT NULL,                -- Latitude of origin
    originLongitude DECIMAL(11, 8) NOT NULL,               -- Longitude of origin
    originPlace VARCHAR(255) NOT NULL,                     -- Origin place

    destinationLatitude DECIMAL(10, 8) DEFAULT 0.0,        -- Latitude of destination
    destinationLongitude DECIMAL(11, 8) DEFAULT 0.0,       -- Longitude of destination
    destinationPlace VARCHAR(255) DEFAULT '',              -- Destination place

    shipperRequestCreatedAt   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- Time of the request
    
    -- requestTime TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- Time of the request

    shippableItemName VARCHAR(100) DEFAULT NULL,           -- Name of the item to ship
    shippableItemQtyInQuintal DECIMAL(15,2) DEFAULT NULL,   -- Quantity in quintals
    shippingDate DATETIME DEFAULT NULL,                        -- Date of shipping
    deliveryDate DATETIME DEFAULT NULL,                        -- Date of delivery
    shippingCost DECIMAL(10,2) DEFAULT NULL,               -- Cost of the shipment
    isCompletionSeen BOOLEAN DEFAULT FALSE,               -- if it is completed and seen by passenger 
    shipperRequestCreatedBy VARCHAR(36) NOT NULL,          -- Who created the request an admin  from call center, passenger himself or driver take from street
    shipperRequestCreatedByRoleId INT NOT NULL,          -- roleId of the creator when it create this request
    passengerRequestUpdatedBy VARCHAR(36) NULL,  -- Who updated the passenger request
    passengerRequestDeletedBy VARCHAR(36) NULL,  -- Who deleted the passenger request
    passengerRequestUpdatedAt DATETIME NULL,  -- When the passenger request was updated
    passengerRequestDeletedAt DATETIME NULL,  -- When the passenger request was deleted

    foreign key (shipperRequestCreatedByRoleId) references Roles(roleId),
    foreign key (shipperRequestCreatedBy) references Users(userUniqueId),
    FOREIGN KEY (vehicleTypeUniqueId) REFERENCES VehicleTypes(vehicleTypeUniqueId),
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (journeyStatusId) REFERENCES JourneyStatus(journeyStatusId),
    FOREIGN KEY (passengerRequestUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (passengerRequestDeletedBy) REFERENCES Users(userUniqueId)
    -- NOTE: FK to TransportCompany(companyUniqueId) is defined after that table is created below
    -- INDEX added after company tables: idx_passengerRequest_targetCompany (targetCompanyUniqueId)
);

-- Create the DriverRequest table

CREATE TABLE IF NOT EXISTS DriverRequest (
    driverRequestId INT AUTO_INCREMENT PRIMARY KEY,
    driverRequestUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the driver request
    userUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to Users
    originLatitude DECIMAL(10, 8) NOT NULL,  -- Latitude of origin
    originLongitude DECIMAL(11, 8) NOT NULL,  -- Longitude of origin
    originPlace VARCHAR(255) NOT NULL,  -- Origin place
   --   TIMESTAMP NOT NULL,  -- Time of the request
    journeyStatusId INT NOT NULL,  -- Foreign key to JourneyStatus
    isCancellationByPassengerSeenByDriver ENUM('no need to see it', 'not seen by driver yet', 'seen by driver') DEFAULT 'no need to see it',  -- Track if driver has seen cancellation notification
   -- driverRequestCreatedBy VARCHAR(36) NOT NULL,  -- Who created the driver request
    driverRequestUpdatedBy VARCHAR(36) NULL,  -- Who updated the driver request
    driverRequestDeletedBy VARCHAR(36) NULL,  -- Who deleted the driver request
    driverRequestCreatedAt DATETIME NOT NULL,  -- When the driver request was created
    driverRequestUpdatedAt DATETIME NULL,  -- When the driver request was updated
    driverRequestDeletedAt DATETIME NULL,  -- When the driver request was deleted
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (journeyStatusId) REFERENCES JourneyStatus(journeyStatusId),
    -- FOREIGN KEY (driverRequestCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (driverRequestUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (driverRequestDeletedBy) REFERENCES Users(userUniqueId)
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
    isNotSelectedSeenByDriver ENUM('no need to see it', 'not seen by driver yet', 'seen by driver') DEFAULT 'no need to see it',  -- Track if driver has seen not selected notification
    isCancellationByDriverSeenByPassenger ENUM('no need to see it', 'not seen by passenger yet', 'seen by passenger') DEFAULT 'no need to see it',  -- Track if passenger has seen driver cancellation notification
    isRejectionByPassengerSeenByDriver ENUM('no need to see it', 'not seen by driver yet', 'seen by driver') DEFAULT 'no need to see it',  -- Track if driver has seen passenger rejection notification (before bid completion)
    journeyDecisionCreatedBy VARCHAR(36) NOT NULL,  -- Who created the journey decision
    journeyDecisionUpdatedBy VARCHAR(36) NULL,  -- Who updated the journey decision
    journeyDecisionDeletedBy VARCHAR(36) NULL,  -- Who deleted the journey decision
    journeyDecisionCreatedAt DATETIME NOT NULL,  -- When the journey decision was created
    journeyDecisionUpdatedAt DATETIME NULL,  -- When the journey decision was updated
    journeyDecisionDeletedAt DATETIME NULL,  -- When the journey decision was deleted
    
    FOREIGN KEY (passengerRequestId) REFERENCES PassengerRequest(passengerRequestId),
    FOREIGN KEY (driverRequestId) REFERENCES DriverRequest(driverRequestId),
    FOREIGN KEY (journeyStatusId) REFERENCES JourneyStatus(journeyStatusId),
    FOREIGN KEY (journeyDecisionCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (journeyDecisionUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (journeyDecisionDeletedBy) REFERENCES Users(userUniqueId)
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
    journeyCreatedBy VARCHAR(36) NOT NULL,  -- Who created the journey
    journeyUpdatedBy VARCHAR(36) NULL,  -- Who updated the journey
    journeyDeletedBy VARCHAR(36) NULL,  -- Who deleted the journey
    journeyCreatedAt DATETIME NOT NULL,  -- When the journey was created
    journeyUpdatedAt DATETIME NULL,  -- When the journey was updated
    journeyDeletedAt DATETIME NULL,  -- When the journey was deleted
    FOREIGN KEY (journeyDecisionUniqueId) REFERENCES JourneyDecisions(journeyDecisionUniqueId),
    FOREIGN KEY (journeyStatusId) REFERENCES JourneyStatus(journeyStatusId),
    FOREIGN KEY (journeyCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (journeyUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (journeyDeletedBy) REFERENCES Users(userUniqueId)
) ;
-- Create the JourneyRoutePoints table to register each points

CREATE TABLE IF NOT EXISTS JourneyRoutePoints (
    pointId INT AUTO_INCREMENT PRIMARY KEY,
    journeyRoutePointsUniqueId varchar(36) NOT NULL, 
    journeyDecisionUniqueId varchar(36) NOT NULL,  -- Foreign key to the Journey table
    latitude DECIMAL(10, 8) NOT NULL,  -- Latitude of the GPS point
    longitude DECIMAL(11, 8) NOT NULL,  -- Longitude of the GPS point
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- Timestamp of when the GPS point was recorded
    journeyRoutePointsCreatedBy VARCHAR(36) NOT NULL,  -- Who created the route point
    journeyRoutePointsUpdatedBy VARCHAR(36) NULL,  -- Who updated the route point
    journeyRoutePointsDeletedBy VARCHAR(36) NULL,  -- Who deleted the route point
    journeyRoutePointsCreatedAt DATETIME NOT NULL,  -- When the route point was created
    journeyRoutePointsUpdatedAt DATETIME NULL,  -- When the route point was updated
    journeyRoutePointsDeletedAt DATETIME NULL,  -- When the route point was deleted
    FOREIGN KEY (journeyDecisionUniqueId) REFERENCES JourneyDecisions(journeyDecisionUniqueId) ON DELETE CASCADE,  -- Link to the JourneyDecisions table
    FOREIGN KEY (journeyRoutePointsCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (journeyRoutePointsUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (journeyRoutePointsDeletedBy) REFERENCES Users(userUniqueId)
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

CREATE TABLE IF NOT EXISTS VehicleStatusTypes (
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
    vehicleStatusCreatedBy VARCHAR(36) NOT NULL,  -- Who created the vehicle status
    vehicleStatusUpdatedBy VARCHAR(36) NULL,  -- Who updated the vehicle status
    vehicleStatusDeletedBy VARCHAR(36) NULL,  -- Who deleted the vehicle status
    vehicleStatusCreatedAt DATETIME NOT NULL,  -- When the vehicle status was created
    vehicleStatusUpdatedAt DATETIME NULL,  -- When the vehicle status was updated
    vehicleStatusDeletedAt DATETIME NULL,  -- When the vehicle status was deleted
    FOREIGN KEY (vehicleUniqueId) REFERENCES Vehicle(vehicleUniqueId),
    FOREIGN KEY (VehicleStatusTypeId) REFERENCES VehicleStatusTypes(VehicleStatusTypeId),
    FOREIGN KEY (vehicleStatusCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (vehicleStatusUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (vehicleStatusDeletedBy) REFERENCES Users(userUniqueId)
) ;

-- Create the VehicleOwnership table

CREATE TABLE IF NOT EXISTS VehicleOwnership (
    ownershipId INT AUTO_INCREMENT PRIMARY KEY,
    ownershipUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for ownership
    vehicleUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to Vehicle
    userUniqueId VARCHAR(36) Default NULL,  -- Foreign key to Users
    roleId INT NOT NULL,  -- Foreign key to Roles
    ownershipStartDate DATETIME NOT NULL,  -- Ownership start date
    ownershipEndDate DATETIME NULL,  -- Ownership end date
    vehicleOwnershipCreatedBy VARCHAR(36) NOT NULL,  -- Who created the ownership
    vehicleOwnershipUpdatedBy VARCHAR(36) NULL,  -- Who updated the ownership
    vehicleOwnershipDeletedBy VARCHAR(36) NULL,  -- Who deleted the ownership
    vehicleOwnershipCreatedAt DATETIME NOT NULL,  -- When the ownership was created
    vehicleOwnershipUpdatedAt DATETIME NULL,  -- When the ownership was updated
    vehicleOwnershipDeletedAt DATETIME NULL,  -- When the ownership was deleted
    FOREIGN KEY (vehicleUniqueId) REFERENCES Vehicle(vehicleUniqueId),
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (roleId) REFERENCES Roles(roleId),
    FOREIGN KEY (vehicleOwnershipCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (vehicleOwnershipUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (vehicleOwnershipDeletedBy) REFERENCES Users(userUniqueId)
)  ;

-- Create the VehicleDriver table (relation among vehicle, ownership and driver)

CREATE TABLE IF NOT EXISTS VehicleDriver (
    vehicleDriverId INT AUTO_INCREMENT PRIMARY KEY,
    vehicleDriverUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the assignment
    vehicleUniqueId VARCHAR(36) NOT NULL,               -- FK to Vehicle
     driverUserUniqueId VARCHAR(36) NOT NULL,            -- FK to Users (driver)
    assignmentStatus ENUM('active','inactive') NOT NULL DEFAULT 'active',
    assignmentStartDate DATETIME NOT NULL,
    assignmentEndDate DATETIME NULL,
    vehicleDriverCreatedBy VARCHAR(36) NOT NULL,  -- Who created the vehicle driver assignment
    vehicleDriverUpdatedBy VARCHAR(36) NULL,  -- Who updated the vehicle driver assignment
    vehicleDriverDeletedBy VARCHAR(36) NULL,  -- Who deleted the vehicle driver assignment
    vehicleDriverCreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    vehicleDriverUpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    vehicleDriverDeletedAt DATETIME NULL,  -- When the vehicle driver assignment was deleted
    INDEX idx_vehicleDriver_vehicle (vehicleUniqueId),
     INDEX idx_vehicleDriver_driver (driverUserUniqueId),
    FOREIGN KEY (vehicleUniqueId) REFERENCES Vehicle(vehicleUniqueId),
     FOREIGN KEY (driverUserUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (vehicleDriverCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (vehicleDriverUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (vehicleDriverDeletedBy) REFERENCES Users(userUniqueId)
) ;

-- Create the Ratings table, record every journey rating via journeyDecisionUniqueId

CREATE TABLE IF NOT EXISTS Ratings (
    ratingId INT AUTO_INCREMENT PRIMARY KEY,
    journeyDecisionUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- Foreign key to JourneyDecisions
    ratedBy VARCHAR(36) NOT NULL,  -- Foreign key to Users (who gave the rating)
    rating INT NOT NULL,  -- Rating score
    comment TEXT NULL,  -- Rating comment
    ratingCreatedBy VARCHAR(36) NOT NULL,  -- Who created the rating
    ratingUpdatedBy VARCHAR(36) NULL,  -- Who updated the rating
    ratingDeletedBy VARCHAR(36) NULL,  -- Who deleted the rating
    ratingCreatedAt DATETIME NOT NULL,  -- When the rating was created
    ratingUpdatedAt DATETIME NULL,  -- When the rating was updated
    ratingDeletedAt DATETIME NULL,  -- When the rating was deleted
    FOREIGN KEY (journeyDecisionUniqueId) REFERENCES JourneyDecisions(journeyDecisionUniqueId),
    FOREIGN KEY (ratedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (ratingCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (ratingUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (ratingDeletedBy) REFERENCES Users(userUniqueId)
) ;

-- Create the SMSSender table

CREATE TABLE IF NOT EXISTS SMSSender (
    SMSSenderId INT AUTO_INCREMENT PRIMARY KEY, 
    phoneNumber VARCHAR(50) NOT NULL,  -- Phone number of SMS sender
    password VARCHAR(255) NOT NULL,  -- Password of SMS sender
    SMSSenderCreatedBy VARCHAR(36) NOT NULL,  -- Who created the SMS sender
    SMSSenderUpdatedBy VARCHAR(36) NULL,  -- Who updated the SMS sender
    SMSSenderDeletedBy VARCHAR(36) NULL,  -- Who deleted the SMS sender
    SMSSenderCreatedAt DATETIME NOT NULL,  -- When the SMS sender was created
    SMSSenderUpdatedAt DATETIME NULL,  -- When the SMS sender was updated
    SMSSenderDeletedAt DATETIME NULL,  -- When the SMS sender was deleted
    FOREIGN KEY (SMSSenderCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (SMSSenderUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (SMSSenderDeletedBy) REFERENCES Users(userUniqueId)
) ;

 -- Create the CancellationReasonsType table

CREATE TABLE IF NOT EXISTS CancellationReasonsType (
    cancellationReasonsTypeId INT AUTO_INCREMENT PRIMARY KEY, 
    cancellationReasonTypeUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for cancellation reason
    cancellationReason VARCHAR(150) NOT NULL,  -- Type of cancellation reason
    roleId int NOT NULL,  -- Who canceled (could be driver, passenger, or admin)
    cancellationReasonTypeCreatedBy VARCHAR(36) NOT NULL,  -- Who created the cancellation reason
    cancellationReasonTypeUpdatedBy VARCHAR(36) NULL,  -- Who updated the cancellation reason
    cancellationReasonTypeDeletedBy VARCHAR(36) NULL,  -- Who deleted the cancellation reason
    cancellationReasonTypeCreatedAt DATETIME NOT NULL,  -- When the cancellation reason was created
    cancellationReasonTypeUpdatedAt DATETIME NULL,  -- When the cancellation reason was updated
    cancellationReasonTypeDeletedAt DATETIME NULL,  -- When the cancellation reason was deleted
    FOREIGN KEY (roleId) REFERENCES Roles(roleId),
    FOREIGN KEY (cancellationReasonTypeCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (cancellationReasonTypeUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (cancellationReasonTypeDeletedBy) REFERENCES Users(userUniqueId)
) ;
 
-- Create the PaymentMethod table

CREATE TABLE IF NOT EXISTS PaymentMethod (
    paymentMethodId INT AUTO_INCREMENT PRIMARY KEY,
    paymentMethodUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for payment method
    paymentMethod VARCHAR(50) NOT NULL,  -- Name of the payment method (e.g., on cash, by bank, by tele birr)
    paymentMethodCreatedBy VARCHAR(36) NOT NULL,  -- Who created the payment method
    paymentMethodUpdatedBy VARCHAR(36) NULL,  -- Who updated the payment method
    paymentMethodDeletedBy VARCHAR(36) NULL,  -- Who deleted the payment method
    paymentMethodCreatedAt DATETIME NOT NULL,  -- Creation time of the payment method
    paymentMethodUpdatedAt DATETIME NULL,  -- When the payment method was updated
    paymentMethodDeletedAt DATETIME NULL,  -- When the payment method was deleted
    FOREIGN KEY (paymentMethodCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (paymentMethodUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (paymentMethodDeletedBy) REFERENCES Users(userUniqueId)
) ;  

 -- Create the PaymentStatus table

CREATE TABLE IF NOT EXISTS PaymentStatus (
    paymentStatusId INT AUTO_INCREMENT PRIMARY KEY,
    paymentStatusUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for payment status
    paymentStatus VARCHAR(50) UNIQUE NOT NULL,  -- Payment status (e.g., Pending, Completed, Failed)
    paymentStatusCreatedAt DATETIME NOT NULL,  -- Creation time of the payment status
    paymentStatusUpdatedBy VARCHAR(36) NULL,  -- Who updated the payment status
    paymentStatusUpdatedAt DATETIME NULL,  -- When the payment status was updated
    paymentStatusDeletedBy VARCHAR(36) NULL,  -- Who deleted the payment status
    paymentStatusDeletedAt DATETIME NULL,  -- Deletion time of the payment status
    FOREIGN KEY (paymentStatusUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (paymentStatusDeletedBy) REFERENCES Users(userUniqueId)
) ;


-- Create the JourneyPayments table where passenger pays to driver for journey service

CREATE TABLE IF NOT EXISTS JourneyPayments (
    paymentId INT AUTO_INCREMENT PRIMARY KEY,
    paymentUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for payment
    journeyDecisionUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to JourneyDecisions
    amount DECIMAL(10, 2) NOT NULL,  -- Payment amount
    paymentMethodUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to PaymentMethod
    paymentStatusUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to PaymentStatus
    paymentTime TIMESTAMP NOT NULL,  -- Time of payment
    journeyPaymentCreatedBy VARCHAR(36) NOT NULL,  -- Who created the payment
    journeyPaymentUpdatedBy VARCHAR(36) NULL,  -- Who updated the payment
    journeyPaymentDeletedBy VARCHAR(36) NULL,  -- Who deleted the payment
    journeyPaymentCreatedAt DATETIME NOT NULL,  -- When the payment was created
    journeyPaymentUpdatedAt DATETIME NULL,  -- When the payment was updated
    journeyPaymentDeletedAt DATETIME NULL,  -- When the payment was deleted
    
    FOREIGN KEY (journeyDecisionUniqueId) REFERENCES JourneyDecisions(journeyDecisionUniqueId),
    FOREIGN KEY (paymentMethodUniqueId) REFERENCES PaymentMethod(paymentMethodUniqueId),
    FOREIGN KEY (paymentStatusUniqueId) REFERENCES PaymentStatus(paymentStatusUniqueId),
    FOREIGN KEY (journeyPaymentCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (journeyPaymentUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (journeyPaymentDeletedBy) REFERENCES Users(userUniqueId),
    
    INDEX idx_journeyPayments_journeyDecision (journeyDecisionUniqueId),
    INDEX idx_journeyPayments_paymentTime (paymentTime)
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
    canceledJourneySeenByAdminAt DATETIME NULL,
    canceledJourneyCreatedBy VARCHAR(36) NOT NULL,  -- Who created the canceled journey record
    canceledJourneyUpdatedBy VARCHAR(36) NULL,  -- Who updated the canceled journey record
    canceledJourneyDeletedBy VARCHAR(36) NULL,  -- Who deleted the canceled journey record
    canceledJourneyCreatedAt DATETIME NOT NULL,  -- When the canceled journey was created
    canceledJourneyUpdatedAt DATETIME NULL,  -- When the canceled journey was updated
    canceledJourneyDeletedAt DATETIME NULL,  -- When the canceled journey was deleted
    FOREIGN KEY (roleId) REFERENCES Roles(roleId),
    FOREIGN KEY (cancellationReasonsTypeId) REFERENCES CancellationReasonsType(cancellationReasonsTypeId),
    FOREIGN KEY (canceledBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (canceledJourneyCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (canceledJourneyUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (canceledJourneyDeletedBy) REFERENCES Users(userUniqueId)
); 
-- tariff rate table

    CREATE TABLE IF NOT EXISTS TariffRate (
    tariffRateId INT AUTO_INCREMENT PRIMARY KEY,
    tariffRateUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for tariff rate
    tariffRateName VARCHAR(255) NOT NULL,  -- Name of the tariff rate
    standingTariffRate DECIMAL(10, 2) NOT NULL,  -- a tariff rate where driver comes to passengers pick up place
    journeyTariffRate DECIMAL(10, 2) NOT NULL,  -- a tariff rate between a place where driver pick up a passengers up to destination place and can be calculated by km
    timingTariffRate DECIMAL(10, 2) NOT NULL,  -- a tariff rate between a place where driver pick up a passengers up to destination place and can be calculated by time
    tariffRateEffectiveDate DATE NOT NULL,  -- The date from which this rate is effective
    tariffRateExpirationDate DATE NOT NULL,  -- The date after which this rate is no longer effective
    tariffRateDescription TEXT NOT NULL,  -- Description of tariff rate
    tariffRateCreatedBy VARCHAR(36) NOT NULL,  -- Who created the tariff rate
    tariffRateUpdatedBy VARCHAR(36) NULL,  -- Who updated the tariff rate
    tariffRateDeletedBy VARCHAR(36) NULL,  -- Who deleted the tariff rate
    tariffRateCreatedAt DATETIME NOT NULL,  -- Creation time of the tariff rate
    tariffRateUpdatedAt DATETIME NULL,  -- When the tariff rate was updated
    tariffRateDeletedAt DATETIME NULL,  -- When the tariff rate was deleted
    FOREIGN KEY (tariffRateCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (tariffRateUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (tariffRateDeletedBy) REFERENCES Users(userUniqueId)
) ;

 -- Create the TariffRateForVehicleTypes table

CREATE TABLE IF NOT EXISTS TariffRateForVehicleTypes (
    tariffRateForVehicleTypeId INT AUTO_INCREMENT PRIMARY KEY,
    
    tariffRateForVehicleTypeUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for tariff rate
    vehicleTypeUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to VehicleType
    tariffRateUniqueId varchar(36) NOT NULL,  -- Foreign key to tariffRate
    tariffRateForVehicleTypeCreatedBy VARCHAR(36) NOT NULL,  -- Who created the tariff rate for vehicle type
    tariffRateForVehicleTypeUpdatedBy VARCHAR(36) NULL,  -- Who updated the tariff rate for vehicle type
    tariffRateForVehicleTypeDeletedBy VARCHAR(36) NULL,  -- Who deleted the tariff rate for vehicle type
    tariffRateForVehicleTypeCreatedAt DATETIME NOT NULL,  -- When the tariff rate for vehicle type was created
    tariffRateForVehicleTypeUpdatedAt DATETIME NULL,  -- When the tariff rate for vehicle type was updated
    tariffRateForVehicleTypeDeletedAt DATETIME NULL,  -- When the tariff rate for vehicle type was deleted
    FOREIGN KEY (vehicleTypeUniqueId) REFERENCES VehicleTypes(vehicleTypeUniqueId),
    FOREIGN KEY (tariffRateUniqueId) REFERENCES TariffRate(tariffRateUniqueId),
    FOREIGN KEY (tariffRateForVehicleTypeCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (tariffRateForVehicleTypeUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (tariffRateForVehicleTypeDeletedBy) REFERENCES Users(userUniqueId)
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

 -- Create the CommissionStatus table
 CREATE TABLE IF NOT EXISTS CommissionStatus (
    commissionStatusId INT AUTO_INCREMENT PRIMARY KEY,
    commissionStatusUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for commission status
    statusName VARCHAR(50) UNIQUE NOT NULL,  -- PAID, PENDING, REQUESTED, FREE, CANCELED
    description VARCHAR(255) NULL,
    effectiveFrom DATETIME NULL,
    effectiveTo DATETIME NULL,
    commissionStatusCreatedBy VARCHAR(36) NOT NULL,  -- Who created the commission status
    commissionStatusUpdatedBy VARCHAR(36) NULL,  -- Who updated the commission status
    commissionStatusCreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    commissionStatusUpdatedAt DATETIME NULL,  -- When the commission status was updated
    commissionStatusDeletedAt DATETIME NULL,
    commissionStatusDeletedBy VARCHAR(36) NULL,
    FOREIGN KEY (commissionStatusCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (commissionStatusUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (commissionStatusDeletedBy) REFERENCES Users(userUniqueId)
 );

-- commission table for every payment load now, when shipper pay to driver some amount must be taken as commission based on commission rate

    CREATE TABLE IF NOT EXISTS Commission (
    commissionId INT AUTO_INCREMENT PRIMARY KEY,
    commissionUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for commission
   paymentUniqueId varchar(36) NULL,  -- Optional foreign key to Payments if payment exists
   journeyDecisionUniqueId varchar(36) NOT NULL,  -- Foreign key to JourneyDecisions
    commissionRateUniqueId varchar(36) NOT NULL,  -- Foreign key to CommissionRates
    commissionAmount DECIMAL(10, 2) NOT NULL,  -- Commission amount
    commissionStatusUniqueId VARCHAR(36) NOT NULL, -- Foreign key to CommissionStatus
    commissionCreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    commissionUpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    commissionDeletedAt DATETIME NULL,
    commissionCreatedBy VARCHAR(36) NOT NULL,  -- Who created the commission
    commissionUpdatedBy VARCHAR(36) NULL,  -- Who updated the commission
    commissionDeletedBy VARCHAR(36) NULL, -- Who deleted the commission
    FOREIGN KEY (journeyDecisionUniqueId) REFERENCES JourneyDecisions(journeyDecisionUniqueId),
    FOREIGN KEY (paymentUniqueId) REFERENCES JourneyPayments(paymentUniqueId),
    FOREIGN KEY (commissionRateUniqueId) REFERENCES CommissionRates(commissionRateUniqueId),
    FOREIGN KEY (commissionStatusUniqueId) REFERENCES CommissionStatus(commissionStatusUniqueId)
);



CREATE TABLE IF NOT EXISTS SubscriptionPlan (
  subscriptionPlanId INT AUTO_INCREMENT PRIMARY KEY,
  subscriptionPlanUniqueId VARCHAR(36) NOT NULL UNIQUE,
  planName VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  isFree BOOLEAN DEFAULT FALSE,
  durationInDays INT NOT NULL,
  subscriptionPlanCreatedBy VARCHAR(36) NOT NULL,  -- Who created the subscription plan
  subscriptionPlanUpdatedBy VARCHAR(36) NULL,  -- Who updated the subscription plan
  subscriptionPlanDeletedBy VARCHAR(36) NULL,  -- Who deleted the subscription plan
  subscriptionPlanCreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,  -- When the subscription plan was created
  subscriptionPlanUpdatedAt DATETIME NULL,  -- When the subscription plan was updated
  subscriptionPlanDeletedAt DATETIME NULL,  -- When the subscription plan was deleted
  FOREIGN KEY (subscriptionPlanCreatedBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (subscriptionPlanUpdatedBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (subscriptionPlanDeletedBy) REFERENCES Users(userUniqueId)
);


--  Pricing for Subscription Plan Dynamic by effective date

CREATE TABLE IF NOT EXISTS SubscriptionPlanPricing (
  pricingId INT AUTO_INCREMENT PRIMARY KEY,
  subscriptionPlanPricingUniqueId VARCHAR(36) NOT NULL UNIQUE,
  subscriptionPlanUniqueId VARCHAR(36) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  effectiveFrom DATE NOT NULL,
  effectiveTo DATE NULL,
  subscriptionPlanPricingCreatedBy VARCHAR(36) NOT NULL,  -- Who created the pricing
  subscriptionPlanPricingUpdatedBy VARCHAR(36) NULL,  -- Who updated the pricing
  subscriptionPlanPricingDeletedBy VARCHAR(36) NULL,  -- Who deleted the pricing
  subscriptionPlanPricingCreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,  -- When the pricing was created
  subscriptionPlanPricingUpdatedAt DATETIME NULL,  -- When the pricing was updated
  subscriptionPlanPricingDeletedAt DATETIME NULL,  -- When the pricing was deleted
  FOREIGN KEY (subscriptionPlanUniqueId) REFERENCES SubscriptionPlan(subscriptionPlanUniqueId),
  FOREIGN KEY (subscriptionPlanPricingCreatedBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (subscriptionPlanPricingUpdatedBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (subscriptionPlanPricingDeletedBy) REFERENCES Users(userUniqueId)
);

-- subscription to driver 

CREATE TABLE IF NOT EXISTS UserSubscription (
  userSubscriptionId INT AUTO_INCREMENT PRIMARY KEY,
  userSubscriptionUniqueId VARCHAR(36) NOT NULL UNIQUE,
  driverUniqueId VARCHAR(36) NOT NULL,
  -- subscriptionPlanUniqueId varchar(36) NOT NULL,
  subscriptionPlanPricingUniqueId VARCHAR(36) NOT NULL,  -- Exact pricing tier at time of subscription
  startDate DATETIME NOT NULL,
  endDate DATETIME NOT NULL,
  userSubscriptionCreatedBy VARCHAR(36) NOT NULL,  -- Who created the driver subscription
  userSubscriptionUpdatedBy VARCHAR(36) NULL,  -- Who updated the driver subscription
  userSubscriptionDeletedBy VARCHAR(36) NULL,  -- Who deleted the driver subscription
  userSubscriptionCreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  userSubscriptionUpdatedAt DATETIME NULL,  -- When the driver subscription was updated
  userSubscriptionDeletedAt DATETIME NULL,  -- When the driver subscription was deleted
  FOREIGN KEY (driverUniqueId) REFERENCES Users(userUniqueId),
  -- FOREIGN KEY (subscriptionPlanUniqueId) REFERENCES SubscriptionPlan(subscriptionPlanUniqueId),
  FOREIGN KEY (subscriptionPlanPricingUniqueId) REFERENCES SubscriptionPlanPricing(subscriptionPlanPricingUniqueId),
  FOREIGN KEY (userSubscriptionCreatedBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (userSubscriptionUpdatedBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (userSubscriptionDeletedBy) REFERENCES Users(userUniqueId)
);



-- driver deposit table lists


--   Master table for deposit sources (enum replacement)
CREATE TABLE IF NOT EXISTS DepositSource (
  depositSourceId INT AUTO_INCREMENT PRIMARY KEY,
  depositSourceUniqueId VARCHAR(36) NOT NULL UNIQUE,  -- UUID
  sourceKey VARCHAR(50) NOT NULL UNIQUE,              -- e.g., 'driver', 'bonus'
  sourceLabel VARCHAR(100) NOT NULL,                  -- e.g., 'Paid by Driver'
  depositSourceCreatedBy VARCHAR(36) NOT NULL,  -- Who created the deposit source
  depositSourceUpdatedBy VARCHAR(36) NULL,  -- Who updated the deposit source
  depositSourceDeletedBy VARCHAR(36) NULL,  -- Who deleted the deposit source
  depositSourceCreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,  -- When the deposit source was created
  depositSourceUpdatedAt DATETIME NULL,  -- When the deposit source was updated
  depositSourceDeletedAt DATETIME NULL,  -- When the deposit source was deleted
  FOREIGN KEY (depositSourceCreatedBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (depositSourceUpdatedBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (depositSourceDeletedBy) REFERENCES Users(userUniqueId)
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
  financialInstitutionAccountsCreatedBy VARCHAR(36) NOT NULL,  -- Who created the account
  financialInstitutionAccountUpdatedBy VARCHAR(36) NULL,  -- Who updated the account
  financialInstitutionAccountDeletedBy VARCHAR(36) NULL,  -- Who deleted the account
  financialInstitutionAccountsCreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,  -- When the account was created
  financialInstitutionAccountsUpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,  -- When the account was updated
  financialInstitutionAccountDeletedAt DATETIME NULL,  -- When the account was deleted
  FOREIGN KEY (addedBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (financialInstitutionAccountsCreatedBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (financialInstitutionAccountUpdatedBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (financialInstitutionAccountDeletedBy) REFERENCES Users(userUniqueId)
);
--  Main table representing driver subscriptions via deposits
CREATE TABLE IF NOT EXISTS UserDeposit (
  userDepositId INT AUTO_INCREMENT PRIMARY KEY,
  userDepositUniqueId VARCHAR(36) NOT NULL UNIQUE,
  driverUniqueId VARCHAR(36) NOT NULL,
  depositAmount DOUBLE NOT NULL,
  depositSourceUniqueId VARCHAR(36) NOT NULL,
  accountUniqueId varchar(36) null, 
  depositStatus enum('requested','approved','rejected','FAILED','PENDING','COMPLETED') default "requested",
  depositURL text NOT NULL,
  depositTime DATETIME NOT NULL,
  acceptRejectReason VARCHAR(2000),
  userDepositCreatedBy VARCHAR(36) NOT NULL,  -- Who created the driver deposit
  userDepositUpdatedBy VARCHAR(36) NULL,  -- Who updated the driver deposit
  userDepositDeletedBy VARCHAR(36) NULL,  -- Who deleted the driver deposit
  userDepositCreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  userDepositUpdatedAt DATETIME NULL,  -- When the driver deposit was updated
  userDepositDeletedAt DATETIME NULL,  -- When the driver deposit was deleted

  FOREIGN KEY (accountUniqueId) REFERENCES FinancialInstitutionAccounts(accountUniqueId),
  
  FOREIGN KEY (driverUniqueId) REFERENCES Users(userUniqueId),
  FOREIGN KEY (depositSourceUniqueId) REFERENCES DepositSource(depositSourceUniqueId),
  FOREIGN KEY (userDepositCreatedBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (userDepositUpdatedBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (userDepositDeletedBy) REFERENCES Users(userUniqueId)
);
 
 

-- . Logs any deposit transferred from one driver to another
CREATE TABLE IF NOT EXISTS UserBalanceTransfer (
  depositTransferId INT AUTO_INCREMENT PRIMARY KEY,
  depositTransferUniqueId VARCHAR(36) NOT NULL UNIQUE,
  fromDriverUniqueId VARCHAR(36) NOT NULL,
  toDriverUniqueId VARCHAR(36) NOT NULL,
  transferredAmount DECIMAL(10, 2) NOT NULL,
  reason TEXT,
  transferTime DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  transferredBy VARCHAR(36),
  userBalanceTransferCreatedBy VARCHAR(36) NOT NULL,  -- Who created the transfer
  userBalanceTransferUpdatedBy VARCHAR(36) NULL,  -- Who updated the transfer
  userBalanceTransferDeletedBy VARCHAR(36) NULL,  -- Who deleted the transfer
  userBalanceTransferCreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  userBalanceTransferUpdatedAt DATETIME NULL,  -- When the transfer was updated
  userBalanceTransferDeletedAt DATETIME NULL,  -- When the transfer was deleted
  FOREIGN KEY (fromDriverUniqueId) REFERENCES Users(userUniqueId),
  FOREIGN KEY (toDriverUniqueId) REFERENCES Users(userUniqueId),
  FOREIGN KEY (transferredBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (userBalanceTransferCreatedBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (userBalanceTransferUpdatedBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (userBalanceTransferDeletedBy) REFERENCES Users(userUniqueId)
);



 

-- UserRefund can be used to give back users money from ride hailing account (drivers, passengers, etc.)
CREATE TABLE IF NOT EXISTS UserRefund (
  userRefundId INT AUTO_INCREMENT PRIMARY KEY, -- Auto-incremented unique identifier for each refund record

  userRefundUniqueId VARCHAR(36) NOT NULL UNIQUE, -- UUID used to uniquely identify each refund transaction across systems

  userUniqueId VARCHAR(36) NOT NULL,  -- Foreign key referencing the user receiving the refund (from Users.userUniqueId)

  refundAmount DECIMAL(10, 2) NOT NULL CHECK (refundAmount > 0), -- Amount of money refunded to the user (must be greater than 0)

  refundReason TEXT, -- Optional explanation or reason for issuing the refund

  refundedBy VARCHAR(36), -- UUID of the admin or system user who approved or issued the refund

  refundStatus ENUM('requested','approved') NOT NULL  DEFAULT 'requested', -- Status of the refund: either 'requested' (pending) or 'approved'

  accountUniqueId VARCHAR(36),   -- Financial account (institution) where the refund is deposited (FK to FinancialInstitutionAccounts)

  refundUrl TEXT,   -- ✅ Receipt or proof document URL sent to the institution upon refund approval

  refundDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, -- Date and time when the refund was issued or logged

  userRefundCreatedBy VARCHAR(36) NOT NULL,  -- Who created the refund
  userRefundUpdatedBy VARCHAR(36) NULL,  -- Who updated the refund
  userRefundDeletedBy VARCHAR(36) NULL,  -- Who deleted the refund
  userRefundCreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,  -- Timestamp when the refund record was created
  userRefundUpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,  -- Timestamp that auto-updates when the row is modified
  userRefundDeletedAt DATETIME NULL,  -- When the refund was deleted

  FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId),
  FOREIGN KEY (accountUniqueId) REFERENCES FinancialInstitutionAccounts(accountUniqueId),
  FOREIGN KEY (refundedBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (userRefundCreatedBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (userRefundUpdatedBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (userRefundDeletedBy) REFERENCES Users(userUniqueId)
);


-- a table to store drivers balance after Commission to payment or deposit

CREATE TABLE IF NOT EXISTS UserBalance (
    userBalanceId INT AUTO_INCREMENT PRIMARY KEY,
    userBalanceUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for driver balance
    userUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to Users driver
    transactionType enum('Deposit', 'Commission','Transfer','Refund','Subscription',"freeGift") NOT NULL,  -- Type of transaction
    transactionUniqueId VARCHAR(36) NOT NULL,  -- UUID for 'Deposit', 'Commission','Transfer','Refund','Subscription'
    transactionTime DATETIME NOT NULL,  -- Time of transaction
    userBalanceAdjustmentType enum('reversal','adjustment', 'creation') NOT NULL,  -- Type of adjustment for user balance
    netBalance DECIMAL(10, 2) NOT NULL,  -- Balance which is previous balance + (deposit or - Commission)
    userBalanceCreatedBy VARCHAR(36) NOT NULL,  -- Who created the driver balance
    userBalanceUpdatedBy VARCHAR(36) NULL,  -- Who updated the driver balance
    userBalanceDeletedBy VARCHAR(36) NULL,  -- Who deleted the driver balance
    userBalanceCreatedAt DATETIME NOT NULL,  -- When the driver balance was created
    userBalanceUpdatedAt DATETIME NULL,  -- When the driver balance was updated
    userBalanceDeletedAt DATETIME NULL,  -- When the driver balance was deleted
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (userBalanceCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (userBalanceUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (userBalanceDeletedBy) REFERENCES Users(userUniqueId)
) ; 

-- create  JourneyNotifications table which is used as  
CREATE TABLE IF NOT EXISTS JourneyNotifications (
    journeyNotificationId INT AUTO_INCREMENT PRIMARY KEY,  -- Primary key
    journeyNotificationUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for notification
    journeyUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to Journey (UUID)
    journeyStatusUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to JourneyStatus (UUID)
    message VARCHAR(255) NULL,  -- Optional message for notification
    isSeen TINYINT(1) DEFAULT 0,  -- 0 = Unseen, 1 = Seen
    journeyNotificationCreatedBy VARCHAR(36) NOT NULL,  -- Who created the notification
    journeyNotificationUpdatedBy VARCHAR(36) NULL,  -- Who updated the notification
    journeyNotificationDeletedBy VARCHAR(36) NULL,  -- Who deleted the notification
    journeyNotificationCreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- Created time
    journeyNotificationUpdatedAt DATETIME NULL DEFAULT NULL,  -- Updated time (optional)
    journeyNotificationDeletedAt DATETIME NULL,  -- When the notification was deleted
    
    -- Foreign key to Journey table
    FOREIGN KEY (journeyUniqueId) REFERENCES Journey(journeyUniqueId),
    
    -- Foreign key to JourneyStatus table
    FOREIGN KEY (journeyStatusUniqueId) REFERENCES JourneyStatus(journeyStatusUniqueId),
    
    FOREIGN KEY (journeyNotificationCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (journeyNotificationUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (journeyNotificationDeletedBy) REFERENCES Users(userUniqueId),

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
    delinquencyTypeCreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    delinquencyTypeCreatedBy VARCHAR(36) NOT NULL,
    delinquencyTypeUpdatedAt DATETIME NULL,
    delinquencyTypeUpdatedBy VARCHAR(36) NULL,
    delinquencyTypeDeletedAt DATETIME NULL,
    delinquencyTypeDeletedBy VARCHAR(36) NULL,
    -- foreign key to role
    FOREIGN KEY (applicableRoles) REFERENCES Roles(roleUniqueId),
    FOREIGN KEY (delinquencyTypeCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (delinquencyTypeUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (delinquencyTypeDeletedBy) REFERENCES Users(userUniqueId)
);
-- User Delinquency table  is used to track delinquency for specific user-role combinations
CREATE TABLE IF NOT EXISTS UserDelinquency (
    userDelinquencyId INT AUTO_INCREMENT PRIMARY KEY,
    userDelinquencyUniqueId VARCHAR(36) UNIQUE NOT NULL,
    userUniqueId VARCHAR(36) NOT NULL,  -- Specific user who committed the delinquency action
    roleId INT NOT NULL,  -- Specific role-id of the user who committed the delinquency action
    delinquencyTypeUniqueId VARCHAR(36) NOT NULL,   -- e.g., 'late_arrival', 'cancellation', 'misbehavior'
    delinquencyDescription TEXT NOT NULL,
    delinquencySeverity ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'MEDIUM',
    delinquencyPoints INT NOT NULL DEFAULT 1,  -- Points assigned for this delinquency
    delinquencyCreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    delinquencyUpdatedAt DATETIME NULL DEFAULT NULL,
    delinquencyCreatedBy VARCHAR(36) NOT NULL DEFAULT 'system',  -- 'system' for automatic bans
    journeyDecisionUniqueId VARCHAR(36) NULL, -- for which journey decision this delinquency is applied if it is from journey may be passenger complay againest driver
    isDeliquencySeenByAdmin TINYINT(1) NOT NULL DEFAULT 0, -- 0 = Unseen, 1 = Seen
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (roleId) REFERENCES Roles(roleId),
    FOREIGN KEY (delinquencyCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (delinquencyTypeUniqueId) REFERENCES DelinquencyTypes(delinquencyTypeUniqueId),
    FOREIGN KEY (journeyDecisionUniqueId) REFERENCES JourneyDecisions(journeyDecisionUniqueId),
    INDEX idx_userrole_severity (userUniqueId, roleId, delinquencySeverity),
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
 

-- ============================================================
-- COMPANY TRANSPORT SCHEMA
-- Added to support Ethiopian freight transport companies that
-- own fleets (100-500+ vehicles) bidding on bulk shipper requests.
-- ============================================================


-- TransportCompany: Core entity representing a registered freight company.
-- A company may have hundreds of vehicles and can bid on shipper requests
-- as an organisation rather than as individual drivers.

CREATE TABLE IF NOT EXISTS TransportCompany (
    companyId INT AUTO_INCREMENT PRIMARY KEY,
    companyUniqueId VARCHAR(36) UNIQUE NOT NULL,           -- UUID
    companyName VARCHAR(255) NOT NULL,                     -- Official registered company name
    companyRegistrationNumber VARCHAR(100) UNIQUE NULL,    -- Ethiopian trade/transport license number
    companyPhone VARCHAR(20) NULL,                         -- Company contact phone
    companyEmail VARCHAR(255) NULL,                        -- Company contact email
    companyAddress VARCHAR(500) NULL,                      -- Physical address
    companyLogoUrl VARCHAR(500) NULL,                      -- URL to uploaded logo
    approvalStatus ENUM('pending','approved','rejected','suspended') NOT NULL DEFAULT 'pending',
    approvalReason VARCHAR(500) NULL,                      -- Admin note when approving or rejecting
    approvedBy VARCHAR(36) NULL,                           -- Admin who approved/rejected
    approvedAt DATETIME NULL,
    companyCreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    companyCreatedBy VARCHAR(36) NOT NULL,
    companyUpdatedAt DATETIME NULL,
    companyUpdatedBy VARCHAR(36) NULL,
    companyDeletedAt DATETIME NULL,
    companyDeletedBy VARCHAR(36) NULL,
    isDeleted BOOLEAN NOT NULL DEFAULT FALSE,
    INDEX idx_company_approvalStatus (approvalStatus),
    INDEX idx_company_isDeleted (isDeleted),
    FOREIGN KEY (companyCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (companyUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (companyDeletedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (approvedBy) REFERENCES Users(userUniqueId)
);


-- CompanyMembership: Links individual users (owner, manager, dispatcher, driver)
-- to a TransportCompany. A driver can belong to a company AND still take
-- individual passenger requests — membership does NOT lock the driver.
-- One user can have one active membership per company.

CREATE TABLE IF NOT EXISTS CompanyMembership (
    membershipId INT AUTO_INCREMENT PRIMARY KEY,
    membershipUniqueId VARCHAR(36) UNIQUE NOT NULL,
    companyUniqueId VARCHAR(36) NOT NULL,                  -- FK → TransportCompany
    userUniqueId VARCHAR(36) NOT NULL,                     -- FK → Users
    membershipRole ENUM('owner','manager','dispatcher','driver') NOT NULL,
    isActive BOOLEAN NOT NULL DEFAULT TRUE,
    membershipStartDate DATETIME NOT NULL,
    membershipEndDate DATETIME NULL,
    membershipCreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    membershipCreatedBy VARCHAR(36) NOT NULL,
    membershipUpdatedAt DATETIME NULL,
    membershipUpdatedBy VARCHAR(36) NULL,
    membershipDeletedAt DATETIME NULL,
    membershipDeletedBy VARCHAR(36) NULL,
    UNIQUE KEY uq_company_user (companyUniqueId, userUniqueId),  -- One active membership per user per company
    INDEX idx_membership_companyUniqueId (companyUniqueId),
    INDEX idx_membership_userUniqueId (userUniqueId),
    INDEX idx_membership_role (membershipRole),
    FOREIGN KEY (companyUniqueId) REFERENCES TransportCompany(companyUniqueId),
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (membershipCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (membershipUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (membershipDeletedBy) REFERENCES Users(userUniqueId)
);


-- CompanyVehicle: Assigns vehicles to a company fleet.
-- Separate from VehicleOwnership (which links vehicles to individual users).
-- A vehicle may be owned by an individual user AND assigned to a company.

CREATE TABLE IF NOT EXISTS CompanyVehicle (
    companyVehicleId INT AUTO_INCREMENT PRIMARY KEY,
    companyVehicleUniqueId VARCHAR(36) UNIQUE NOT NULL,
    companyUniqueId VARCHAR(36) NOT NULL,                  -- FK → TransportCompany
    vehicleUniqueId VARCHAR(36) NOT NULL,                  -- FK → Vehicle
    assignmentStatus ENUM('active','inactive') NOT NULL DEFAULT 'active',
    assignmentStartDate DATETIME NOT NULL,
    assignmentEndDate DATETIME NULL,
    companyVehicleCreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    companyVehicleCreatedBy VARCHAR(36) NOT NULL,
    companyVehicleUpdatedAt DATETIME NULL,
    companyVehicleUpdatedBy VARCHAR(36) NULL,
    companyVehicleDeletedAt DATETIME NULL,
    companyVehicleDeletedBy VARCHAR(36) NULL,
    UNIQUE KEY uq_company_vehicle (companyUniqueId, vehicleUniqueId),  -- One vehicle per company at a time
    INDEX idx_companyVehicle_company (companyUniqueId),
    INDEX idx_companyVehicle_vehicle (vehicleUniqueId),
    INDEX idx_companyVehicle_status (assignmentStatus),
    FOREIGN KEY (companyUniqueId) REFERENCES TransportCompany(companyUniqueId),
    FOREIGN KEY (vehicleUniqueId) REFERENCES Vehicle(vehicleUniqueId),
    FOREIGN KEY (companyVehicleCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (companyVehicleUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (companyVehicleDeletedBy) REFERENCES Users(userUniqueId)
);


-- CompanyBidRequest: A company's bid on a shipper's batch request.
-- When requestMode = 'company_target', only the targeted company can see and bid.
-- No partial bids: numberOfVehiclesOffered MUST equal the shipper's batch size.
-- One company submits one bid per batch (UNIQUE on companyUniqueId + passengerRequestBatchId).
-- Commission for company bids is tracked in CompanyCommission (not the per-journey Commission table).

CREATE TABLE IF NOT EXISTS CompanyBidRequest (
    companyBidRequestId INT AUTO_INCREMENT PRIMARY KEY,
    companyBidRequestUniqueId VARCHAR(36) UNIQUE NOT NULL,

    -- The shipper's batch being bid on (links to PassengerRequest.passengerRequestBatchId)
    passengerRequestBatchId VARCHAR(36) NOT NULL,

    -- Who is bidding
    companyUniqueId VARCHAR(36) NOT NULL,                  -- FK → TransportCompany
    bidSubmittedByUserUniqueId VARCHAR(36) NOT NULL,       -- Manager or dispatcher who submitted

    -- Bid terms — must match full batch (no partial bids)
    numberOfVehiclesOffered INT NOT NULL,                  -- Must equal shipper's numberOfVehicles
    vehicleTypeUniqueId VARCHAR(36) NOT NULL,              -- Type of vehicles being offered
    proposedCostPerVehicle DECIMAL(10,2) NULL,             -- Negotiated price per vehicle
    proposedTotalCost DECIMAL(10,2) NULL,                  -- Total cost for all vehicles
    proposedShippingDate DATETIME NULL,
    proposedDeliveryDate DATETIME NULL,
    bidNotes TEXT NULL,                                    -- Optional message from company to shipper

    -- Bid lifecycle status
    bidStatus ENUM(
        'submitted',           -- Company submitted; waiting for shipper
        'accepted_by_shipper', -- Shipper accepted; dispatcher must now assign vehicles
        'rejected_by_shipper', -- Shipper rejected this bid
        'cancelled_by_company',-- Company withdrew before shipper decided
        'expired'              -- Bid expired without action
    ) NOT NULL DEFAULT 'submitted',
    bidStatusUpdatedAt DATETIME NULL,
    bidStatusUpdatedBy VARCHAR(36) NULL,

    -- Journey linkage
    journeyStatusId INT NOT NULL,                          -- FK → JourneyStatus (starts at 'waiting')

    companyBidRequestCreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    companyBidRequestCreatedBy VARCHAR(36) NOT NULL,
    companyBidRequestUpdatedAt DATETIME NULL,
    companyBidRequestUpdatedBy VARCHAR(36) NULL,
    companyBidRequestDeletedAt DATETIME NULL,
    companyBidRequestDeletedBy VARCHAR(36) NULL,

    UNIQUE KEY uq_company_batch_bid (companyUniqueId, passengerRequestBatchId),  -- One bid per company per batch
    INDEX idx_companyBid_batchId (passengerRequestBatchId),
    INDEX idx_companyBid_company (companyUniqueId),
    INDEX idx_companyBid_status (bidStatus),
    FOREIGN KEY (companyUniqueId) REFERENCES TransportCompany(companyUniqueId),
    FOREIGN KEY (bidSubmittedByUserUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (vehicleTypeUniqueId) REFERENCES VehicleTypes(vehicleTypeUniqueId),
    FOREIGN KEY (journeyStatusId) REFERENCES JourneyStatus(journeyStatusId),
    FOREIGN KEY (companyBidRequestCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (companyBidRequestUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (companyBidRequestDeletedBy) REFERENCES Users(userUniqueId)
);


-- CompanyBidVehicleAssignment: After shipper accepts a company bid, the dispatcher
-- assigns specific vehicles and their drivers — one row per PassengerRequest slot.
-- Each row maps: one PassengerRequest row ↔ one Vehicle ↔ one Driver.
--
-- DriverRequest creation sequence (IMPORTANT):
--   JourneyDecisions.driverRequestId is NOT NULL, so a DriverRequest record MUST exist
--   before a JourneyDecision can be created. In the company flow this works as follows:
--
--   Step 1 — Dispatcher assigns driver:
--     → System auto-creates a DriverRequest row on behalf of the assigned driver
--       (origin/status copied from the linked PassengerRequest; journeyStatusId = acceptedByDriver)
--     → driverRequestUniqueId is stored in this table immediately
--
--   Step 2 — Driver confirms assignment (assignmentStatus → confirmed_by_driver):
--     → System creates JourneyDecision using passengerRequestId + driverRequestId
--     → journeyDecisionUniqueId is then stored in this table
--
--   Step 3 — If driver rejects (assignmentStatus → rejected_by_driver):
--     → The DriverRequest status is updated to cancelledByDriver
--     → Dispatcher must create a new assignment row (status = reassigned)
--     → A fresh DriverRequest is created for the replacement driver

CREATE TABLE IF NOT EXISTS CompanyBidVehicleAssignment (
    assignmentId INT AUTO_INCREMENT PRIMARY KEY,
    assignmentUniqueId VARCHAR(36) UNIQUE NOT NULL,

    -- Links back to the company bid and the specific PassengerRequest slot
    companyBidRequestUniqueId VARCHAR(36) NOT NULL,        -- FK → CompanyBidRequest
    passengerRequestUniqueId VARCHAR(36) NOT NULL,         -- FK → PassengerRequest (one row in the batch)

    -- The assigned vehicle and driver
    vehicleUniqueId VARCHAR(36) NOT NULL,                  -- FK → Vehicle
    driverUserUniqueId VARCHAR(36) NOT NULL,               -- FK → Users (driver must be a company member)

    -- Auto-created by the system when a driver is assigned (Step 1 above).
    -- Stored here so JourneyDecisions can be created using it (Step 2 above).
    -- NULL only briefly before the DriverRequest insert completes (same transaction).
    driverRequestUniqueId VARCHAR(36) NULL,                -- FK → DriverRequest

    -- Assignment lifecycle
    assignmentStatus ENUM(
        'assigned',            -- Dispatcher assigned; DriverRequest created; waiting for driver to confirm
        'confirmed_by_driver', -- Driver confirmed; JourneyDecision created
        'rejected_by_driver',  -- Driver refused; DriverRequest cancelled; dispatcher must reassign
        'reassigned',          -- Replacement row after a rejection
        'cancelled',           -- Cancelled before driver confirmed
        'completed'            -- Journey completed successfully
    ) NOT NULL DEFAULT 'assigned',

    -- Populated in Step 2 after driver confirms
    journeyDecisionUniqueId VARCHAR(36) NULL,              -- FK → JourneyDecisions

    assignmentCreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    assignmentCreatedBy VARCHAR(36) NOT NULL,
    assignmentUpdatedAt DATETIME NULL,
    assignmentUpdatedBy VARCHAR(36) NULL,
    assignmentDeletedAt DATETIME NULL,
    assignmentDeletedBy VARCHAR(36) NULL,

    -- One active assignment per PassengerRequest slot per bid
    UNIQUE KEY uq_bid_request_slot (companyBidRequestUniqueId, passengerRequestUniqueId),
    INDEX idx_assignment_bid (companyBidRequestUniqueId),
    INDEX idx_assignment_driver (driverUserUniqueId),
    INDEX idx_assignment_vehicle (vehicleUniqueId),
    INDEX idx_assignment_status (assignmentStatus),
    FOREIGN KEY (companyBidRequestUniqueId) REFERENCES CompanyBidRequest(companyBidRequestUniqueId),
    FOREIGN KEY (passengerRequestUniqueId) REFERENCES PassengerRequest(passengerRequestUniqueId),
    FOREIGN KEY (vehicleUniqueId) REFERENCES Vehicle(vehicleUniqueId),
    FOREIGN KEY (driverUserUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (driverRequestUniqueId) REFERENCES DriverRequest(driverRequestUniqueId),
    FOREIGN KEY (journeyDecisionUniqueId) REFERENCES JourneyDecisions(journeyDecisionUniqueId),
    FOREIGN KEY (assignmentCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (assignmentUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (assignmentDeletedBy) REFERENCES Users(userUniqueId)
);


-- CompanyCommission: Commission charged to a TransportCompany per accepted bid.
-- This is SEPARATE from the per-journey Commission table (which tracks individual driver commissions).
-- Company commission is calculated at the bid level, not per individual journey.
-- Applies when bidStatus = 'accepted_by_shipper' in CompanyBidRequest.

CREATE TABLE IF NOT EXISTS CompanyCommission (
    companyCommissionId INT AUTO_INCREMENT PRIMARY KEY,
    companyCommissionUniqueId VARCHAR(36) UNIQUE NOT NULL,

    companyBidRequestUniqueId VARCHAR(36) NOT NULL,        -- FK → CompanyBidRequest (one commission per bid)
    companyUniqueId VARCHAR(36) NOT NULL,                  -- FK → TransportCompany (denormalized for easy query)
    commissionRateUniqueId VARCHAR(36) NOT NULL,           -- FK → CommissionRates (rate used at time of bid)

    -- Calculated amounts
    baseTotalCost DECIMAL(10,2) NOT NULL,                  -- proposedTotalCost from the winning bid
    commissionRate DECIMAL(5,2) NOT NULL,                  -- Rate snapshot (in %) at time of calculation
    commissionAmount DECIMAL(10,2) NOT NULL,               -- baseTotalCost * commissionRate / 100

    -- Payment status (reuses CommissionStatus table for consistency)
    commissionStatusUniqueId VARCHAR(36) NOT NULL,         -- FK → CommissionStatus

    -- Optional: reference to a company-level payment if paid via the system
    paymentReference VARCHAR(255) NULL,                    -- External payment ref (bank transfer, Telebirr, etc.)
    paidAt DATETIME NULL,                                  -- When commission was paid
    paidBy VARCHAR(36) NULL,                               -- Admin who confirmed payment

    companyCommissionCreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    companyCommissionCreatedBy VARCHAR(36) NOT NULL,
    companyCommissionUpdatedAt DATETIME NULL,
    companyCommissionUpdatedBy VARCHAR(36) NULL,
    companyCommissionDeletedAt DATETIME NULL,
    companyCommissionDeletedBy VARCHAR(36) NULL,

    UNIQUE KEY uq_company_commission_bid (companyBidRequestUniqueId),  -- One commission record per bid
    INDEX idx_companyCommission_company (companyUniqueId),
    INDEX idx_companyCommission_status (commissionStatusUniqueId),
    FOREIGN KEY (companyBidRequestUniqueId) REFERENCES CompanyBidRequest(companyBidRequestUniqueId),
    FOREIGN KEY (companyUniqueId) REFERENCES TransportCompany(companyUniqueId),
    FOREIGN KEY (commissionRateUniqueId) REFERENCES CommissionRates(commissionRateUniqueId),
    FOREIGN KEY (commissionStatusUniqueId) REFERENCES CommissionStatus(commissionStatusUniqueId),
    FOREIGN KEY (paidBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (companyCommissionCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (companyCommissionUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (companyCommissionDeletedBy) REFERENCES Users(userUniqueId)
);

`;

module.exports = { sqlQuery };
