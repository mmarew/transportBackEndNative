const { pool } = require("../Middleware/Database.config");
const createTable = async () => {
  const sqlQuery = `
  -- Roles Table
   CREATE TABLE IF NOT EXISTS Roles (
    roleId INT AUTO_INCREMENT PRIMARY KEY,
    roleUniqueId VARCHAR(150) UNIQUE NOT NULL,
    roleName VARCHAR(50) NOT NULL,
    roleDescription VARCHAR(255) NULL,
    roleCreatedAt DATETIME NOT NULL,
    roleDeletedAt DATETIME NULL
);

-- Users Table
    CREATE TABLE IF NOT EXISTS Users (
    userId INT AUTO_INCREMENT PRIMARY KEY,
    userUniqueId VARCHAR(150) UNIQUE NOT NULL,
    fullName VARCHAR(255) NOT NULL,
    phoneNumber VARCHAR(15) NOT NULL,
    email VARCHAR(255) NULL,
    createdAt DATETIME NOT NULL ); 

-- Status Table
CREATE TABLE IF NOT EXISTS Statuses (
    statusId INT AUTO_INCREMENT PRIMARY KEY,
    statusUniqueId VARCHAR(150) UNIQUE NOT NULL,
    statusName VARCHAR(50) NOT NULL,
    statusCreatedAt DATETIME NOT NULL,
    statusDeletedAt DATETIME NULL
);

-- UserRoleStatuses Table , this table register userid roleid and status id
CREATE TABLE IF NOT EXISTS UserRoleStatuses (
    userRoleStatusId INT AUTO_INCREMENT PRIMARY KEY,
    userRoleStatusUniqueId VARCHAR(150) UNIQUE NOT NULL,
    statusId INT NOT NULL,
    userUniqueId VARCHAR(150) NOT NULL,
    RoleId INT NOT NULL,
    FOREIGN KEY (userUniqueId) REFERENCES users(userUniqueId),
    FOREIGN KEY (statusId) REFERENCES Statuses(statusId),
    FOREIGN KEY (RoleId) REFERENCES Role(RoleId)
);


-- UsersCredential Table
CREATE TABLE IF NOT EXISTS usersCredential (
    credentialId INT AUTO_INCREMENT PRIMARY KEY,
    credentialUniqueId VARCHAR(150) UNIQUE NOT NULL,
    userUniqueId VARCHAR(150) NOT NULL,
    hashedPassword VARCHAR(255) NOT NULL,
    OTP VARCHAR(255) NULL,
    createdAt DATETIME NOT NULL,
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId)
);
-- Create the JourneyStatus table
CREATE TABLE IF NOT EXISTS JourneyStatus (
    journeyStatusId INT AUTO_INCREMENT PRIMARY KEY,
    journeyStatusUniqueId VARCHAR(150) UNIQUE NOT NULL,
    journeyStatusName VARCHAR(50) NOT NULL, 
    journeyStatusDescription VARCHAR(255) NULL,
    createdAt DATETIME NOT NULL,
    deletedAt DATETIME NULL
    
); 
 -- Create the Requests table, it can store passenger and driver requests 
  CREATE TABLE IF NOT EXISTS PassengerRequest (
    passengerRequestId INT AUTO_INCREMENT PRIMARY KEY,
    passengerRequestUniqueId VARCHAR(150) UNIQUE NOT NULL,
    userUniqueId VARCHAR(150) NOT NULL,
    vehicleTypeUniqueId VARCHAR(150) NOT NULL,
    originLatitude VARCHAR(22) NOT NULL,
    originLongitude VARCHAR(22) NOT NULL,
    originPlace VARCHAR(255) NOT NULL,
    destinationLatitude VARCHAR(22) NULL DEFAULT 0.0,
    destinationLongitude VARCHAR(22) NULL DEFAULT 0.0,
    destinationPlace VARCHAR(255) NULL DEFAULT 0.0,
    requestTime TIMESTAMP NOT NULL,
    journeyStatusId INT NOT NULL, -- Foreign Key to JourneyStatus
    FOREIGN KEY (vehicleTypeUniqueId) REFERENCES VehicleType(vehicleTypeUniqueId),
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (journeyStatusId) REFERENCES JourneyStatus(journeyStatusId)
);

-- Create the driverWaiting table, it can store drivers waiting for a passenger 
    CREATE TABLE IF NOT EXISTS DriverRequest (
    driverRequestId INT AUTO_INCREMENT PRIMARY KEY,
    driverRequestUniqueId VARCHAR(150) UNIQUE NOT NULL,
    userUniqueId VARCHAR(150) NOT NULL,
    originLatitude VARCHAR(22) NOT NULL,
    originLongitude VARCHAR(22) NOT NULL,
    originPlace VARCHAR(255) NOT NULL,
    requestTime TIMESTAMP NOT NULL,
    journeyStatusId INT NOT NULL, -- Foreign Key to JourneyStatus
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (journeyStatusId) REFERENCES JourneyStatus(journeyStatusId)
);

-- Create the JourneyDecisions table this is based on Requests of passenger and driver
CREATE TABLE IF NOT EXISTS JourneyDecisions (
    journeyDecisionId INT AUTO_INCREMENT PRIMARY KEY,
    journeyDecisionUniqueId VARCHAR(150) UNIQUE NOT NULL,
    passengerRequestId INT NOT NULL, -- Foreign Key to PassengerRequest table
    driverRequestId INT NOT NULL, -- Foreign Key to DriverRequest table
    journeyStatusId INT NOT NULL, -- Foreign Key to JourneyStatus table
    decisionTime TIMESTAMP NOT NULL,
    FOREIGN KEY (passengerRequestId) REFERENCES PassengerRequest(passengerRequestId),
    FOREIGN KEY (driverRequestId) REFERENCES DriverRequest(driverRequestId),
    FOREIGN KEY (journeyStatusId) REFERENCES JourneyStatus(journeyStatusId)
);

-- Create the Journey table based on JourneyDecisions
CREATE TABLE IF NOT EXISTS Journey (
    journeyId INT AUTO_INCREMENT PRIMARY KEY,
    journeyUniqueId VARCHAR(150) UNIQUE NOT NULL,
    journeyDecisionUniqueId VARCHAR(150) UNIQUE NOT NULL,
    startTime TIMESTAMP NOT NULL,
    endTime TIMESTAMP  null,
    fare DECIMAL(10, 2) default 0,
    journeyStatusId INT NOT NULL, 
     -- References JourneyStatus table
    FOREIGN KEY (journeyDecisionUniqueId) REFERENCES JourneyDecisions (journeyDecisionUniqueId),
    FOREIGN KEY (journeyStatusId) REFERENCES JourneyStatus(journeyStatusId)
);
-- Payments Table
    CREATE TABLE IF NOT EXISTS Payments (
    paymentId INT AUTO_INCREMENT PRIMARY KEY,
    journeyId VARCHAR(150) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    paymentMethodUniqueId VARCHAR(150) NOT NULL,
    paymentStatusUniqueId VARCHAR(150) NOT NULL,
    paymentTime TIMESTAMP NOT NULL,
    FOREIGN KEY (journeyId) REFERENCES Journey(journeyId),
    FOREIGN KEY (paymentMethodUniqueId) REFERENCES PaymentMethod(paymentMethodUniqueId),
    FOREIGN KEY (paymentStatusUniqueId) REFERENCES PaymentStatus(paymentStatusUniqueId)
);

-- PaymentStatus Table
CREATE TABLE IF NOT EXISTS PaymentStatus (
    paymentStatusId INT AUTO_INCREMENT PRIMARY KEY,
    paymentStatusUniqueId VARCHAR(150) UNIQUE NOT NULL,
    paymentStatusList VARCHAR(50) NOT NULL,
    createdAt DATETIME NOT NULL
);

-- PaymentMethod Table
CREATE TABLE IF NOT EXISTS PaymentMethod (
    paymentMethodId INT AUTO_INCREMENT PRIMARY KEY,
    paymentMethodUniqueId VARCHAR(150) UNIQUE NOT NULL,
    paymentMethod VARCHAR(50) NOT NULL,
    createdAt DATETIME NOT NULL
);

-- Vehicle Table
    CREATE TABLE IF NOT EXISTS Vehicle (
    vehicleId INT AUTO_INCREMENT PRIMARY KEY,
    vehicleUniqueId VARCHAR(150) NOT NULL,
    vehicleTypeUniqueId VARCHAR(50) NOT NULL,
    licensePlate VARCHAR(50) NOT NULL,
    FOREIGN KEY (vehicleTypeUniqueId) REFERENCES VehicleType(vehicleTypeUniqueId)
);
-- VehicleStatusType Table
CREATE TABLE IF NOT EXISTS VehicleStatusType (
    statusTypeId INT AUTO_INCREMENT PRIMARY KEY,
    statusTypeName VARCHAR(50) NOT NULL,
    statusTypeDescription VARCHAR(255) NULL,
    createdAt DATETIME NOT NULL,
    deletedAt DATETIME NULL
); 
CREATE TABLE IF NOT EXISTS VehicleStatus (
    vehicleStatusId INT AUTO_INCREMENT PRIMARY KEY,
    vehicleId INT NOT NULL,
    statusTypeId INT NOT NULL,
    statusStartDate DATETIME NOT NULL,
    statusEndDate DATETIME NULL,
    FOREIGN KEY (vehicleId) REFERENCES Vehicle(vehicleId),
    FOREIGN KEY (statusTypeId) REFERENCES VehicleStatusType(statusTypeId)
);

-- VehicleType Table
CREATE TABLE IF NOT EXISTS VehicleType (
    vehicleTypeId INT AUTO_INCREMENT PRIMARY KEY,
    vehicleTypeUniqueId VARCHAR(150) UNIQUE NOT NULL,
    vehicleTypeName VARCHAR(50) NOT NULL,
    carryingCapacity VARCHAR(3000) NULL,
    vehicleImage VARCHAR(150) NULL,
    vehicleTypeCreatedAt DATETIME NOT NULL,
    vehicleTypeDeletedAt DATETIME NULL
);
-- VehicleOwnership which can show which vehicle is owned by which user and who can drive it
CREATE TABLE IF NOT EXISTS VehicleOwnership (
    ownershipId INT AUTO_INCREMENT PRIMARY KEY,
    ownershipUniqueId VARCHAR(150) UNIQUE NOT NULL,
    vehicleUniqueId INT NOT NULL,
    userUniqueId varchar(150) NOT NULL,
    roleId INT NOT NULL,
    ownershipStartDate DATETIME NOT NULL,
    ownershipEndDate DATETIME NULL,
    FOREIGN KEY (vehicleUniqueId) REFERENCES Vehicle(vehicleUniqueId),
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (roleId) REFERENCES Roles(roleId)
);

-- Ratings Table
CREATE TABLE IF NOT EXISTS Ratings (
    ratingId INT AUTO_INCREMENT PRIMARY KEY,
    journeyId VARCHAR(150) NOT NULL,
    ratedBy VARCHAR(150) NOT NULL,
    rating INT NOT NULL,
    comment TEXT NULL,
    FOREIGN KEY (journeyId) REFERENCES Journey(journeyId),
    FOREIGN KEY (ratedBy) REFERENCES Users(userId)
);
-- smssender
CREATE TABLE IF NOT EXISTS SMSSender (
    SMSSenderId INT AUTO_INCREMENT PRIMARY KEY, 
    phoneNumber VARCHAR(50) NOT NULL,
    password VARCHAR(255) NOT NULL
);
-- cancilationReasonsType
create table if not exists cancilationReasonsType
(cancilationReasonsTypeId int AUTO_INCREMENT PRIMARY KEY, cancilationReasonTypeUniqueId varchar(150),cancilationReasonType varchar(150),caneledBy varchar(150))
`;
  const [queryResult] = await pool.query(sqlQuery);
  //   console.log("queryResult", queryResult);
};

module.exports = { createTable };
