"use strict";

// driver orders
// Tables: DriverRequest, JourneyDecisions, Journey, JourneyRoutePoints
//
// Verbatim contiguous slice of the former Database/Database.js `sqlQuery`
// (original lines 595-733). It stays at this index because the
// whole schema runs as ONE `multipleStatements` batch and FK parents must
// precede their children - see ./index.js.
module.exports = `

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
    -- DB-level guard: 1 while the request is active (statuses 1-5), NULL once terminal.
    -- Combined with UNIQUE (userUniqueId, activeRequestGuard) this makes it IMPOSSIBLE
    -- for a driver to hold two active requests, even under concurrent API calls.
    activeRequestGuard TINYINT GENERATED ALWAYS AS (
        IF(journeyStatusId IN (1, 2, 3, 4, 5), 1, NULL)
    ) STORED,
    isCancellationByShipperSeenByDriver ENUM('no need to see it', 'not seen by driver yet', 'seen by driver') DEFAULT 'no need to see it',  -- Track if driver has seen cancellation notification
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
    FOREIGN KEY (driverRequestDeletedBy) REFERENCES Users(userUniqueId),
    UNIQUE INDEX uq_driver_active_request (userUniqueId, activeRequestGuard)
) ;

-- Create the JourneyDecisions table

CREATE TABLE IF NOT EXISTS JourneyDecisions (
    journeyDecisionId INT AUTO_INCREMENT PRIMARY KEY,
    journeyDecisionUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for journey decision
    shipperRequestId INT NOT NULL,  -- Foreign key to ShipperRequest
    driverRequestId INT UNIQUE NOT NULL,  -- Foreign key to DriverRequest
    journeyStatusId INT NOT NULL,  -- Foreign key to JourneyStatus
    decisionTime TIMESTAMP NOT NULL,  -- Time of the decision
    decisionBy ENUM('shipper', 'driver', 'admin', 'queue', 'company') NOT NULL,  -- Who made the decision (queue = queue-dispatch offer, company = company assignment)

    shippingDateByDriver DATETIME DEFAULT NULL,                        -- Date of shipping
    deliveryDateByDriver DATETIME DEFAULT NULL,                        -- Date of delivery
    shippingCostByDriver DECIMAL(10,2) DEFAULT NULL,               -- Cost of the shipment
    isNotSelectedSeenByDriver ENUM('no need to see it', 'not seen by driver yet', 'seen by driver') DEFAULT 'no need to see it',  -- Track if driver has seen not selected notification
    isCancellationByDriverSeenByShipper ENUM('no need to see it', 'not seen by shipper yet', 'seen by shipper') DEFAULT 'no need to see it',  -- Track if shipper has seen driver cancellation notification
    isRejectionByShipperSeenByDriver ENUM('no need to see it', 'not seen by driver yet', 'seen by driver') DEFAULT 'no need to see it',  -- Track if driver has seen shipper rejection notification (before bid completion)
    journeyDecisionCreatedBy VARCHAR(36) NOT NULL,  -- Who created the journey decision
    journeyDecisionUpdatedBy VARCHAR(36) NULL,  -- Who updated the journey decision
    journeyDecisionDeletedBy VARCHAR(36) NULL,  -- Who deleted the journey decision
    journeyDecisionCreatedAt DATETIME NOT NULL,  -- When the journey decision was created
    journeyDecisionUpdatedAt DATETIME NULL,  -- When the journey decision was updated
    journeyDecisionDeletedAt DATETIME NULL,  -- When the journey decision was deleted
    
    FOREIGN KEY (shipperRequestId) REFERENCES ShipperRequest(shipperRequestId),
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

    fare DECIMAL(10, 2) DEFAULT 0,  -- Fare for the journey
    journeyStatusId INT NOT NULL,   -- Foreign key to JourneyStatus

    -- Stage 5: goToLoadingPlace — driver confirmed heading to loading place
    journeyGoingToLoadingLat DECIMAL(10, 8) NULL,
    journeyGoingToLoadingLng DECIMAL(11, 8) NULL,
    journeyGoingToLoadingAt  DATETIME NULL,

    -- Stage 6: loading — driver arrived, loading in progress
    journeyLoadingStartedLat DECIMAL(10, 8) NULL,
    journeyLoadingStartedLng DECIMAL(11, 8) NULL,
    loadingStartedAt         DATETIME NULL,

    -- Stage 7: loaded — loading completed, ready to depart
    journeyLoadingCompletedLat DECIMAL(10, 8) NULL,
    journeyLoadingCompletedLng DECIMAL(11, 8) NULL,
    loadingCompletedAt         DATETIME NULL,

    -- Stage 8: journeyStarted — driver left loading place
    journeyStartingLat  DECIMAL(10, 8) NULL,
    journeyStartingLng  DECIMAL(11, 8) NULL,
    journeyStartedAt    DATETIME NULL,
    journeyStartedByUser VARCHAR(36) NULL,  -- Who triggered startJourney

    -- Stage 9: journeyCompleted — driver arrived at destination
    journeyCompletingLat  DECIMAL(10, 8) NULL,
    journeyCompletingLng  DECIMAL(11, 8) NULL,
    journeyCompletedAt    DATETIME NULL,
    journeyCompletedByUser VARCHAR(36) NULL,  -- Who triggered completeJourney

    -- Proof of loading (JSON array of photo URLs, collected at stage 7)
    journeyProofOfLoading TEXT NULL,

    journeyCreatedBy  VARCHAR(36) NOT NULL,
    journeyUpdatedBy  VARCHAR(36) NULL,
    journeyDeletedBy  VARCHAR(36) NULL,
    journeyCreatedAt  DATETIME NOT NULL,
    journeyUpdatedAt  DATETIME NULL,
    journeyDeletedAt  DATETIME NULL,

    FOREIGN KEY (journeyDecisionUniqueId) REFERENCES JourneyDecisions(journeyDecisionUniqueId),
    FOREIGN KEY (journeyStatusId)         REFERENCES JourneyStatus(journeyStatusId),
    FOREIGN KEY (journeyCreatedBy)        REFERENCES Users(userUniqueId),
    FOREIGN KEY (journeyUpdatedBy)        REFERENCES Users(userUniqueId),
    FOREIGN KEY (journeyDeletedBy)        REFERENCES Users(userUniqueId)
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
);`;
