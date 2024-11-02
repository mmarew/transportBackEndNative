const sqlQuery = `

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

-- Create the VehicleType table
   CREATE TABLE IF NOT EXISTS VehicleType (
    vehicleTypeId INT AUTO_INCREMENT PRIMARY KEY,
    vehicleTypeUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the vehicle type
    vehicleTypeName VARCHAR(50) NOT NULL,  -- Name of the vehicle type
    vehicleTypeCreatedBy VARCHAR(36) NOT NULL,  -- Who created the vehicle type
    vehicleTypeUpdatedBy VARCHAR(36) NULL,  -- Who updated the vehicle type
    vehicleTypeDeletedBy VARCHAR(36) NULL,  -- Who deleted the vehicle type
    carryingCapacity VARCHAR(255) NULL,  -- Carrying capacity of the vehicle
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
) ;

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
    userRoleDeletedAt DATETIME NULL  -- When the user role was deleted
    -- ,FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId),  -- Link to Users
    -- FOREIGN KEY (roleId) REFERENCES Roles(roleId)  -- Link to Roles
) ; 

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
) ;

-- Table to hold the current status of each user-role combination
CREATE TABLE IF NOT EXISTS UserRoleStatusCurrent (
    userRoleStatusId INT AUTO_INCREMENT PRIMARY KEY,
    userRoleStatusUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for user-role-status link
    statusId INT NOT NULL,  -- Foreign key to Statuses
    userRoleId INT NOT NULL,  -- Foreign key to UserRole
    userRoleStatusDescription TEXT NULL,  -- Description of the current role status
    userRoleStatusCreatedBy VARCHAR(36) NOT NULL,  -- Who created the current status
    userRoleStatusCreatedAt DATETIME NOT NULL  -- When the current status was created    
) ;

-- Table to hold the history of all user-role statuses, including updates and deletions
CREATE TABLE IF NOT EXISTS UserRoleStatusHistory (
    userRoleStatusId INT AUTO_INCREMENT PRIMARY KEY,
    userRoleStatusUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for user-role-status link (copied from current table)
    statusId INT NOT NULL,  -- Foreign key to Statuses
    userRoleId INT NOT NULL,  -- Foreign key to UserRole
    userRoleStatusDescription TEXT NULL,  -- Description of the role status (copied from current table)
    userRoleStatusCreatedBy VARCHAR(36) NOT NULL,  -- Who created the status (copied from current table)
    userRoleStatusCreatedAt DATETIME NOT NULL,  -- When the status was created (copied from current table)
    userRoleStatusUpdatedBy VARCHAR(36) NULL,  -- Who updated the status
    userRoleStatusUpdatedAt DATETIME NULL,  -- When the status was updated
    userRoleStatusDeletedBy VARCHAR(36) NULL,  -- Who deleted the status
    userRoleStatusDeletedAt DATETIME NULL, -- When the status was deleted
    INDEX (userRoleId),  -- Index for faster lookups on user roles
    INDEX (statusId)  -- Index for faster lookups on status
) ;

-- Create the DocumentTypes Table
CREATE TABLE IF NOT EXISTS DocumentTypes (
    documentTypeId INT AUTO_INCREMENT PRIMARY KEY,
    documentTypeUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the document type list
    documentTypeName VARCHAR(50) UNIQUE NOT NULL,  -- Name of the document type (e.g., "ID", "License", "Plate")
    uploadedDocumentName  VARCHAR(50) UNIQUE NOT NULL, -- it is used in file input fieled of front end 
    uploadedDocumentTypeId  VARCHAR(50) UNIQUE NOT NULL, -- it is used in file input fieled of front end
    uploadedDocumentDescription  VARCHAR(50) UNIQUE NOT NULL, -- it is used in file input fieled of front end
    uploadedDocumentExpirationDate  VARCHAR(50) UNIQUE NOT NULL, -- it is used in file input fieled of front end
     documentTypeDescription  TEXT(2000)    not NULL ,  -- Optional description of the document type
    documentTypeCreatedBy VARCHAR(36) NOT NULL,  -- Who created the document type
    documentTypeCreatedAt DATETIME NOT NULL,  -- When the document type was created
    INDEX idx_createdByUserId (documentTypeCreatedBy),  -- Index for fast lookups
    FOREIGN KEY (documentTypeCreatedBy) REFERENCES Users(userUniqueId)  -- Link to the Users table
) ;

-- Create the DocumentTypesHistory Table 

CREATE TABLE IF NOT EXISTS DocumentTypesHistory (
    documentTypeHistoryId INT AUTO_INCREMENT PRIMARY KEY,
    documentTypeId INT NOT NULL,  -- Reference to the original DocumentTypes
    documentTypeUniqueId VARCHAR(36) NOT NULL,  -- UUID
    documentTypeName VARCHAR(255) NOT NULL,
    documentTypeDescription VARCHAR(255) NULL,
    documentTypeCreatedBy VARCHAR(36) NOT NULL,
    changeType ENUM('UPDATE', 'DELETE') NOT NULL,  -- Whether it was an update or delete
    changedByUserId VARCHAR(36) NOT NULL,  -- The user who made the change
    changedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- Time when the change was made
    FOREIGN KEY (documentTypeId) REFERENCES DocumentTypes(documentTypeId)
) ;

-- Create the RoleDocumentRequirements Table

    CREATE TABLE IF NOT EXISTS RoleDocumentRequirements(
    roleDocumentRequirementId INT AUTO_INCREMENT PRIMARY KEY,
    roleDocumentRequirementUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the requirement
    roleId INT NOT NULL,  -- Foreign key to the Roles table
    documentTypeId INT NOT NULL,  -- Foreign key to the DocumentTypes table
    isDocumentMandatory BOOLEAN NOT NULL DEFAULT TRUE,  -- Whether the document is mandatory for the role
    isExpirationDateRequired BOOLEAN NOT NULL DEFAULT FALSE,  -- Whether the expiration date is required for the document
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
) ; 

-- Create the AttachedDocuments Table (Active Documents Only)
CREATE TABLE IF NOT EXISTS AttachedDocuments (
    attachedDocumentId INT AUTO_INCREMENT PRIMARY KEY,
    attachedDocumentUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the attached document
    userUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to Users and is used to show owner of documents
    attachedDocumentDescription VARCHAR(255) NULL,  -- Description of the attached document
    documentTypeId INT NOT NULL,  -- Foreign key to DocumentTypes
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
) ; 
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
) ;

 
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
) ;

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
    driverRequestId INT NOT NULL,  -- Foreign key to DriverRequest
    journeyStatusId INT NOT NULL,  -- Foreign key to JourneyStatus
    decisionTime TIMESTAMP NOT NULL,  -- Time of the decision
    decisionBy ENUM('passenger', 'driver', 'admin') NOT NULL,  -- Who made the decision
    FOREIGN KEY (passengerRequestId) REFERENCES PassengerRequest(passengerRequestId),
    FOREIGN KEY (driverRequestId) REFERENCES DriverRequest(driverRequestId),
    FOREIGN KEY (journeyStatusId) REFERENCES JourneyStatus(journeyStatusId)
) ;

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
) ;
-- Create the JourneyRoutePoints table
CREATE TABLE IF NOT EXISTS JourneyRoutePoints (
    pointId INT AUTO_INCREMENT PRIMARY KEY,
    journeyUniqueId varchar(36) NOT NULL,  -- Foreign key to the Journey table
    latitude DECIMAL(10, 8) NOT NULL,  -- Latitude of the GPS point
    longitude DECIMAL(11, 8) NOT NULL,  -- Longitude of the GPS point
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- Timestamp of when the GPS point was recorded
    FOREIGN KEY (journeyUniqueId) REFERENCES Journey(journeyUniqueId) ON DELETE CASCADE  -- Link to the Journey table
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
    vehicleDeletedBy VARCHAR(36) NULL,  -- Who deleted the vehicle
    vehicleCreatedAt DATETIME NOT NULL,  -- Vehicle creation date
    vehicleDeletedAt DATETIME NULL,  -- Vehicle deletion date
    FOREIGN KEY (vehicleTypeUniqueId) REFERENCES VehicleType(vehicleTypeUniqueId)
) ; 

-- Create the VehicleStatusType table
CREATE TABLE IF NOT EXISTS VehicleStatusType (
    statusTypeId INT AUTO_INCREMENT PRIMARY KEY,
    statusTypeName VARCHAR(50) NOT NULL,  -- Name of the vehicle status type
    statusTypeDescription VARCHAR(255) NULL,  -- Description of the vehicle status type
    createdAt DATETIME NOT NULL,  -- Creation time
    deletedAt DATETIME NULL  -- Deletion time
) ;

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
    paymentStatus VARCHAR(50) NOT NULL,  -- Payment status (e.g., Pending, Completed, Failed)
    createdAt DATETIME NOT NULL,  -- Creation time of the payment status
    deletedAt DATETIME NULL  -- Deletion time of the payment status
) ;


-- Create the Payments table
CREATE TABLE IF NOT EXISTS Payments (
    paymentId INT AUTO_INCREMENT PRIMARY KEY,
    paymentUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for payment
    journeyUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to Journey
    amount DECIMAL(10, 2) NOT NULL,  -- Payment amount
    paymentMethodUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to PaymentMethod
    paymentStatusUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to PaymentStatus
    paymentTime TIMESTAMP NOT NULL  -- Time of payment
 , FOREIGN KEY (journeyUniqueId) REFERENCES Journey(journeyUniqueId),
     FOREIGN KEY (paymentMethodUniqueId) REFERENCES PaymentMethod(paymentMethodUniqueId),
     FOREIGN KEY (paymentStatusUniqueId) REFERENCES PaymentStatus(paymentStatusUniqueId)
) ;
 
 --  CREATE TABLE CanceledJourneys 
 
 CREATE TABLE IF NOT EXISTS CanceledJourneys (
    canceledJourneyId INT AUTO_INCREMENT PRIMARY KEY,
    canceledJourneyUniqueId VARCHAR(36) NOT NULL,  -- UUID for this cancellation record
    contextId INT NOT NULL,  -- ID from the relevant table (passenger request, driver request, journey decision, or journey)
    contextType ENUM('PassengerRequest', 'DriverRequest', 'JourneyDecisions', 'Journey') NOT NULL,  -- Type of context being referenced
    canceledBy VARCHAR(36) NOT NULL,  -- User who canceled (foreign key to Users)
    cancellationReasonsTypeId INT NOT NULL,  -- Reference to predefined cancellation reason
    canceledTime TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- Time of cancellation
    FOREIGN KEY (cancellationReasonsTypeId) REFERENCES CancellationReasonsType(cancellationReasonsTypeId),
    FOREIGN KEY (canceledBy) REFERENCES Users(userUniqueId)
); 
-- tarrif rate table
    CREATE TABLE IF NOT EXISTS TarrifRate (
    tarrifRateId INT AUTO_INCREMENT PRIMARY KEY,
    tarrifRateUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for tarrif rate
    standingTarrifRate VARCHAR(50) NOT NULL,  -- a tarrif rate wher driver comes to passangers pick up place
    journeyTarrifRate VARCHAR(50) NOT NULL,  -- a tarrif rate between a place where driver pick up a passangers up to destination place and can be calculated by km
    timingTarrifRate VARCHAR(50) NOT NULL,  -- a tarrif rate between a place where driver pick up a passangers up to destination place and can be calculated by time
    tarifRateDescription TEXT NOT NULL,  -- Description of tarrif rate
    createdBy VARCHAR(36) NOT NULL,  -- Who created the tarrif rate
    createdAt DATETIME NOT NULL  -- Creation time of the tarrif rate
) ;

 -- Create the TarrifRateForVehcleTypes table

CREATE TABLE IF NOT EXISTS TarrifRateForVehcleTypes (
    tarrifRateForVehcleTypeId INT AUTO_INCREMENT PRIMARY KEY,
    tarrifRateForVehcleTypeUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for tarrif rate
    vehicleTypeUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to VehicleType
    tarrifRateUniqueId varchar(36) NOT NULL  -- Foreign key to TarrifRate
   , FOREIGN KEY (vehicleTypeUniqueId) REFERENCES VehicleType(vehicleTypeUniqueId),
    FOREIGN KEY (tarrifRateUniqueId) REFERENCES TarrifRate(tarrifRateUniqueId)
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

-- commision table for every payment 

    CREATE TABLE IF NOT EXISTS Commission (
    commissionId INT AUTO_INCREMENT PRIMARY KEY,
    commissionUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for commission
    paymentUniqueId varchar(36) NOT NULL,  -- Foreign key to Payments
    commissionRateUniqueId varchar(36) NOT NULL,  -- Foreign key to CommissionRates
    commissionAmount DECIMAL(10, 2) NOT NULL,  -- Commission amount
    FOREIGN KEY (paymentUniqueId) REFERENCES Payments(paymentUniqueId),
    FOREIGN KEY (commissionRateUniqueId) REFERENCES CommissionRates(commissionRateUniqueId)
);

-- a table to store drivers deposit to pay for commision 

  CREATE TABLE IF NOT EXISTS DriverDeposit (
    driverDepositId INT AUTO_INCREMENT PRIMARY KEY,
    driverDepositUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for driver deposit
    driverUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to Users
    amount DECIMAL(10, 2) NOT NULL,  -- Amount of deposit
    commissionId INT NOT NULL,  -- Foreign key to Commission
    depositTime DATETIME NOT NULL,  -- Time of deposit
    FOREIGN KEY (commissionId) REFERENCES Commission(commissionId),
    FOREIGN KEY (driverUniqueId) REFERENCES Users(userUniqueId)
);
-- a table to store drivers balance after payment or deposit
CREATE TABLE IF NOT EXISTS DriverBalance (
    driverBalanceId INT AUTO_INCREMENT PRIMARY KEY,
    driverBalanceUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for driver balance
    userUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to Users
    transactionType enum('deposit', 'payment') NOT NULL,  -- Type of transaction
    transactionUniqueId VARCHAR(36) NOT NULL,  -- UUID for DriverDeposit or DriverPayment
    transactionTime DATETIME NOT NULL,  -- Time of transaction
    netBalance DECIMAL(10, 2) NOT NULL,  -- Balance which is previous balance + (deposit or - payment)
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId)
) ;
`;

module.exports = { sqlQuery };
