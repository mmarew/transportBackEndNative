"use strict";

// core identity
// Tables: Users, Roles, VehicleTypes, VehicleTypesHistory
//
// Verbatim contiguous slice of the former Database/Database.js `sqlQuery`
// (original lines 53-141). It stays at this index because the
// whole schema runs as ONE `multipleStatements` batch and FK parents must
// precede their children - see ./index.js.
module.exports = `

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
    roleUpdatedAt DATETIME NULL,  -- When the role was updated
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

-- Create the VehicleTypesHistory Table

CREATE TABLE IF NOT EXISTS VehicleTypesHistory (
    vehicleTypeHistoryId INT AUTO_INCREMENT PRIMARY KEY,
    vehicleTypeHistoryUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the history record
    vehicleTypeId INT NOT NULL,  -- Reference to the original VehicleTypes
    vehicleTypeUniqueId VARCHAR(36) NOT NULL,  -- UUID of the vehicle type
    vehicleTypeName VARCHAR(50) NOT NULL,  -- Name of the vehicle type
    vehicleTypeIconName VARCHAR(255) NULL,  -- Icon name of the vehicle type
    vehicleTypeDescription VARCHAR(255) NULL,  -- Description of the vehicle type
    vehicleTypeCreatedBy VARCHAR(36) NOT NULL,  -- Who created the vehicle type
    changeType ENUM('UPDATE', 'DELETE') NOT NULL,  -- Whether it was an update or delete
    vehicleTypeUpdatedBy VARCHAR(36) NULL,  -- Who updated the vehicle type
    vehicleTypeDeletedBy VARCHAR(36) NULL,  -- Who deleted the vehicle type
    carryingCapacity INT NULL,  -- Max carrying capacity in quintal
    cargoType ENUM('bulk_only', 'container_only', 'both') NULL,  -- Cargo the vehicle class supported at the time of the change
    vehicleTypeCreatedAt DATETIME NOT NULL,  -- When the vehicle type was created
    changedByUserId VARCHAR(36) NOT NULL,  -- The user who made the change
    vehicleTypeUpdatedAt DATETIME NULL,  -- Vehicle type update date at the time of the change
    vehicleTypeDeletedAt DATETIME NULL,  -- Vehicle type deletion date at the time of the change
    vehicleTypeVersion INT NOT NULL DEFAULT 1,
    INDEX idx_vth_vehicleType (vehicleTypeId)
) ;`;
