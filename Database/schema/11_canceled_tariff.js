"use strict";

// canceled tariff
// Tables: CanceledJourneys, TariffRate, TariffRateForVehicleTypes
//
// Verbatim contiguous slice of the former Database/Database.js `sqlQuery`
// (original lines 1001-1073). It stays at this index because the
// whole schema runs as ONE `multipleStatements` batch and FK parents must
// precede their children - see ./index.js.
module.exports = `

 
 --  CREATE TABLE CanceledJourneys 
 
 CREATE TABLE IF NOT EXISTS CanceledJourneys (
    canceledJourneyId INT AUTO_INCREMENT PRIMARY KEY,
    canceledJourneyUniqueId VARCHAR(36) NOT NULL,  -- UUID for this cancellation record
    contextId INT NOT NULL,  -- ID from the relevant table (shipper request, driver request, journey decision, or journey)
    roleId INT NOT NULL,  -- ID from the Roles table
    contextType ENUM('ShipperRequest', 'DriverRequest', 'JourneyDecisions', 'Journey', 'ShipperRequestBatch') NOT NULL,  -- Type of context being referenced
    driverUserUniqueId VARCHAR(36) , 
    shipperUserUniqueId VARCHAR(36),
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
    standingTariffRate DECIMAL(10, 2) NOT NULL,  -- a tariff rate where driver comes to shippers pick up place
    journeyTariffRate DECIMAL(10, 2) NOT NULL,  -- a tariff rate between a place where driver pick up a shippers up to destination place and can be calculated by km
    timingTariffRate DECIMAL(10, 2) NOT NULL,  -- a tariff rate between a place where driver pick up a shippers up to destination place and can be calculated by time
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
) ;`;
