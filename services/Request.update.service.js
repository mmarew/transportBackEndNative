const { getData, performJoinSelect } = require("../CRUD/Read/ReadData");
const { updateData } = require("../CRUD/Update/Data.update");
const { sendNotificationToPassenger } = require("../Utils/Notifications");
const uuidv4 = require("uuid").v4;
const acceptPassengerRequest = async (req) => {
  try {
    const {
      journeyDecisionUniqueId,
      passengerRequestUniqueId,
      driverWaitUniqueId,
    } = req.body;

    const isDataInCorrectStatus = await verifyRecordsByConditions([
      {
        tableName: "JourneyDecisions",
        conditions: {
          journeyDecisionUniqueId: journeyDecisionUniqueId,
          journeyStatusId: 2, // You can use any condition here
        },
      },
      {
        tableName: "Requests",
        conditions: {
          requestUniqueId: passengerRequestUniqueId,
          journeyStatusId: 2, // Dynamic condition
        },
      },
      {
        tableName: "Requests",
        conditions: {
          requestUniqueId: driverWaitUniqueId,
          journeyStatusId: 2, // Another dynamic condition
        },
      },
    ]);

    if (!isDataInCorrectStatus) {
      return { message: "error", error: "Request not in correct status" };
    }
    // update journey Decisions
    const journeyDecisionStatus = await updateData({
      tableName: "journeyDecisions",
      updateValues: { journeyStatusId: 3 },
      conditions: { journeyDecisionUniqueId },
    });
    //update passengers Reqests journey status
    const passangerRequestStatus = await updateData({
      tableName: "Requests",
      updateValues: { journeyStatusId: 3 },
      conditions: { requestUniqueId: passengerRequestUniqueId },
    });
    // update drivers request waitting status
    const driverWaitStatus = await updateData({
      tableName: "Requests",
      updateValues: { journeyStatusId: 3 },
      conditions: { requestUniqueId: driverWaitUniqueId },
    });
    if (
      journeyDecisionStatus.affectedRows > 0 &&
      driverWaitStatus.affectedRows > 0 &&
      passangerRequestStatus.affectedRows > 0
    ) {
      // get passengers info and current request
      const passenger = await performJoinSelect({
          baseTable: "Users",
          joins: [
            {
              table: "Requests",
              on: "Requests.userUniqueId = Users.userUniqueId",
            },
          ],

          conditions: { requestUniqueId: passengerRequestUniqueId },
        }),
        driver = await performJoinSelect({
          baseTable: "Users",
          joins: [
            {
              table: "Requests",
              on: "Requests.userUniqueId = Users.userUniqueId",
            },
          ],
          conditions: { requestUniqueId: driverWaitUniqueId },
        }),
        decision = await getData({
          tableName: "journeyDecisions",
          conditions: { journeyDecisionUniqueId },
        });
      const userPassengerPhoneNumber = passenger[0].phoneNumber;
      sendNotificationToPassenger({
        phoneNumber: userPassengerPhoneNumber,
        message: {
          status: 3,
          message: {
            driver: driver[0],
            passenger: passenger[0],
            decision: decision[0],
          },
        },
      });
      return {
        data: {
          driver: driver[0],
          passenger: passenger[0],
          decision: decision[0],
          status: 3,
        },
        message: "success",
      };
    } else {
      console.log("  error @acceptPassangersRequest");
      return { message: "error", error: "Request acceptance failed" };
    }
  } catch (error) {
    console.log("  error @acceptPassangersRequest", error);
    return { message: "error", error: "Request acceptance failed" };
  }
};
const verifyRecordsByConditions = async (dataArray) => {
  // Use Promise.all to check all entries concurrently
  const promises = dataArray.map(({ tableName, conditions }) =>
    getData({
      tableName,
      conditions,
    })
  );

  // Wait for all promises to resolve
  const results = await Promise.all(promises);
  console.log("results", results);
  // Check if all results have entries (length > 0)
  return results.every((result) => result.length > 0);
};
const startJourney = async (req) => {
  try {
    const {
      journeyDecisionUniqueId,
      passengerRequestUniqueId,
      driverWaitUniqueId,
    } = req.body;
    console.log("startJourney");
    // return;
    const expectedStatusId = 3;
    // verify if records exist
    const isDataExist = await verifyRecordsByConditions([
      {
        tableName: "JourneyDecisions",
        conditions: {
          journeyDecisionUniqueId: journeyDecisionUniqueId,
          journeyStatusId: expectedStatusId, // You can use any condition here
        },
      },
      {
        tableName: "Requests",
        conditions: {
          journeyStatusId: expectedStatusId,
          requestUniqueId: passengerRequestUniqueId,
        },
      },
      {
        tableName: "Requests",
        conditions: {
          journeyStatusId: expectedStatusId,
          requestUniqueId: driverWaitUniqueId,
        },
      },
    ]);
    console.log("isDataExist", isDataExist);

    if (!isDataExist) {
      return { message: "error", error: "Request not found" };
    }
    const journeyStatusId = 4;
    // update journey Decisions
    const decisionStatus = await updateData({
      tableName: "journeyDecisions",
      updateValues: { journeyStatusId },
      conditions: { journeyDecisionUniqueId },
    });
    // update passengers Reqests journey status
    const passangerRequestStatus = await updateData({
      tableName: "Requests",
      updateValues: { journeyStatusId },
      conditions: { requestUniqueId: passengerRequestUniqueId },
    });
    // update drivers request waitting status
    const driverWaitStatus = await updateData({
      tableName: "Requests",
      updateValues: { journeyStatusId },
      conditions: { requestUniqueId: driverWaitUniqueId },
    });
    // get passengers info and current request
    const passenger = await performJoinSelect({
        baseTable: "Users",
        joins: [
          {
            table: "Requests",
            on: "Requests.userUniqueId = Users.userUniqueId",
          },
        ],

        conditions: { requestUniqueId: passengerRequestUniqueId },
      }),
      // get drivers info and current request
      driver = await performJoinSelect({
        baseTable: "Users",
        joins: [
          {
            table: "Requests",
            on: "Requests.userUniqueId = Users.userUniqueId",
          },
        ],
        conditions: { requestUniqueId: driverWaitUniqueId },
      }),
      // update journey decisions
      decision = await getData({
        tableName: "journeyDecisions",
        conditions: { journeyDecisionUniqueId },
      });
    // verify if journey exists
    let journey = await getData({
      tableName: "Journey",
      conditions: { journeyDecisionUniqueId },
    });
    if (journey.length <= 0) {
      // insert data to journey table if journey doesn't exist
      const journeyUniqueId = uuidv4();
      const registerJourney = await insertData({
        tableName: "Journey",
        colAndVal: {
          journeyUniqueId,
          journeyDecisionUniqueId,
          startTime: currentDate(),
          journeyStatusId,
        },
      });
      journey = await getData({
        tableName: "Journey",
        conditions: { journeyUniqueId },
      });
    }
    return {
      message: "success",
      data: {
        passenger: passenger[0],
        driver: driver[0],
        decision: decision[0],
        journey: journey[0],
        status: journeyStatusId,
      },
    };
  } catch (error) {
    console.error("Error starting journey:", error);
    return { message: "error", error: "Failed to start journey" };
  }
};
const journeyCompleted = async (req) => {
  try {
    const {
      journeyDecisionUniqueId,
      passengerRequestUniqueId,
      driverWaitUniqueId,
    } = req.body;
    const expectedStatusId = 4;
    // verify if records exist
    const isDataExist = await verifyRecordsByConditions([
      {
        tableName: "JourneyDecisions",
        conditions: {
          journeyDecisionUniqueId: journeyDecisionUniqueId,
          journeyStatusId: expectedStatusId, // You can use any condition here
        },
      },
      {
        tableName: "Requests",
        conditions: {
          journeyStatusId: expectedStatusId,
          requestUniqueId: passengerRequestUniqueId,
        },
      },
      {
        tableName: "Requests",
        conditions: {
          journeyStatusId: expectedStatusId, // You can use any condition here
          requestUniqueId: driverWaitUniqueId,
        },
      },
    ]);

    if (!isDataExist) {
      return { message: "error", error: "Request not found" };
    }
    const journeyStatusId = 5;
    // update journey Decisions
    const decisionStatus = await updateData({
        tableName: "journeyDecisions",
        updateValues: { journeyStatusId },
        conditions: { journeyDecisionUniqueId },
      }),
      // update passengers Reqests journey status
      passangerRequestStatus = await updateData({
        tableName: "Requests",
        updateValues: { journeyStatusId },
        conditions: { requestUniqueId: passengerRequestUniqueId },
      }),
      // update drivers request waitting status
      driverWaitStatus = await updateData({
        tableName: "Requests",
        updateValues: { journeyStatusId },
        conditions: { requestUniqueId: driverWaitUniqueId },
      }),
      // get passengers info and current request
      passenger = await performJoinSelect({
        baseTable: "Users",
        joins: [
          {
            table: "Requests",
            on: "Requests.userUniqueId = Users.userUniqueId",
          },
        ],

        conditions: { requestUniqueId: passengerRequestUniqueId },
      }),
      // get drivers info and current request
      driver = await performJoinSelect({
        baseTable: "Users",
        joins: [
          {
            table: "Requests",
            on: "Requests.userUniqueId = Users.userUniqueId",
          },
        ],
        conditions: { requestUniqueId: driverWaitUniqueId },
      }),
      decision = await getData({
        tableName: "journeyDecisions",
        conditions: { journeyDecisionUniqueId },
      }),
      // insert data to journey table
      updateJourney = await updateData({
        tableName: "Journey",
        conditions: { journeyDecisionUniqueId },
        updateValues: { journeyStatusId },
      }),
      journey = await getData({
        tableName: "Journey",
        conditions: { journeyDecisionUniqueId },
      }),
      passengersPhoneNumber = passenger[0].phoneNumber,
      Notifications = await sendNotificationToPassenger({
        phoneNumber: passengersPhoneNumber,
        message: {
          passenger: passenger[0],
          driver: driver[0],
          decision: decision[0],
          journey: journey[0],
          status: journeyStatusId,
        },
      });
    return {
      message: "success",
      data: {
        passenger: passenger[0],
        driver: driver[0],
        decision: decision[0],
        journey: journey[0],
        status: journeyStatusId,
      },
    };
  } catch (error) {
    console.error("Error completing journey:", error);
    return { message: "error", error: "Failed to complete journey" };
  }
};

module.exports = { acceptPassengerRequest, startJourney, journeyCompleted };
