"use strict";

// vehicles drivers
// Tables: Vehicle, VehicleStatusTypes, VehicleStatus, VehicleOwnership, VehicleDriver
//
// Verbatim contiguous slice of the former Database/Database.js `sqlQuery`
// (original lines 734-838). It stays at this index because the
// whole schema runs as ONE `multipleStatements` batch and FK parents must
// precede their children - see ./index.js.
module.exports = `


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
    VehicleStatusTypeUniqueId VARCHAR(36) UNIQUE NOT NULL, -- UUID for the vehicle status type
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
) ;`;
