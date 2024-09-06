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
    createdAt DATETIME NOT NULL
);

 

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
    createdAt DATETIME NOT NULL
); 
 -- Create the Requests table, it can store passenger and driver requests 
    CREATE TABLE IF NOT EXISTS Requests (
    requestId INT AUTO_INCREMENT PRIMARY KEY,
    requestUniqueId VARCHAR(150) UNIQUE NOT NULL,
    userUniqueId VARCHAR(150) NOT NULL,
    vehicleTypeId VARCHAR(150) NOT NULL,
    originLatitude VARCHAR(22) NOT NULL ,
    originLongitude VARCHAR(22) NOT NULL,
    originPlace VARCHAR(255) NOT NULL default 0.0,

    destinationLatitude VARCHAR(22) NUll  default 0.0,
    destinationLongitude VARCHAR(22) NULL default 0.0,
    destinationPlace VARCHAR(255) NULL default 0.0,

    requestTime TIMESTAMP NOT NULL,
    requestType ENUM('PASSENGER', 'DRIVER') NOT NULL, 
    -- Identifies if it's a passenger or driver request
    journeyStatusId INT NOT NULL,
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (journeyStatusId) REFERENCES JourneyStatus(journeyStatusId)
);

-- Create the JourneyDecisions table this is based on Requests of passenger and driver
CREATE TABLE IF NOT EXISTS JourneyDecisions (
    journeyDecisionId INT AUTO_INCREMENT PRIMARY KEY,
    journeyDecisionUniqueId VARCHAR(150) UNIQUE NOT NULL,
    passengerRequestId varchar(150) NOT NULL UNIQUE,
    driverWaitId varchar(150) NOT NULL UNIQUE,
    journeyStatusId INT NOT NULL ,  
    -- References JourneyStatus table
    decisionTime TIMESTAMP NOT NULL,
    FOREIGN KEY (passengerRequestId) REFERENCES Requests(requestUniqueId),
    FOREIGN KEY (driverWaitId) REFERENCES Requests(requestUniqueId),
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
    driverId VARCHAR(150) NOT NULL,
    vehicleType VARCHAR(50) NOT NULL,
    licensePlate VARCHAR(50) NOT NULL,
    vehicleStatus VARCHAR(50) NOT NULL,
    FOREIGN KEY (driverId) REFERENCES Users(userId)
);

-- VehicleType Table
CREATE TABLE IF NOT EXISTS VehicleType (
    vehicleTypeId INT AUTO_INCREMENT PRIMARY KEY,
    vehicleTypeUniqueId VARCHAR(150) UNIQUE NOT NULL,
    vehicleTypeName VARCHAR(50) NOT NULL,
    vehicleTypeDescription VARCHAR(3000) NULL,
    vehicleTypeCreatedAt DATETIME NOT NULL,
    vehicleTypeDeletedAt DATETIME NULL
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
`;
  const [queryResult] = await pool.query(sqlQuery);
  //   console.log("queryResult", queryResult);
};

module.exports = { createTable };
