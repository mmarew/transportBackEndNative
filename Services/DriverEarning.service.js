const { pool } = require("../Middleware/Database.config");
const { journeyStatusMap } = require("../Utils/ListOfSeedData");
const AppError = require("../Utils/AppError");
const { transactionStorage } = require("../Utils/TransactionContext");

exports.getDriverEarningsByFilter = async ({
  driverUniqueId,
  fromDate,
  toDate,
  offset = 0,
  limit = 10,
}) => {
  if (!driverUniqueId) {
    throw new AppError("Missing required parameters: driverUniqueId", 400);
  }

  const whereConditions = [
    "DR.userUniqueId = ?",
    "JD.journeyStatusId = ?",
  ];

  const params = [driverUniqueId, journeyStatusMap?.journeyCompleted];

  if (fromDate && toDate) {
    whereConditions.push("JD.decisionTime BETWEEN ? AND ?");
    params.push(fromDate, toDate);
  } else if (fromDate) {
    whereConditions.push("JD.decisionTime >= ?");
    params.push(fromDate);
  } else if (toDate) {
    whereConditions.push("JD.decisionTime <= ?");
    params.push(toDate);
  }

  const whereClause = whereConditions.join(" AND ");

  const sql = `
    SELECT
      -- Journey
      JD.journeyDecisionUniqueId,
      JD.decisionTime,
      JD.journeyStatusId,
      JD.shippingCostByDriver,
      JD.shippingDateByDriver,
      JD.deliveryDateByDriver,

      -- Shipper request
      SR.shipperRequestUniqueId,
      SR.requestMode,
      SR.originPlace,
      SR.destinationPlace,
      SR.shippableItemName,
      SR.shippableItemQtyInQuintal,
      SR.shippingCost            AS shipperShippingCost,
      SR.shippingDate,
      SR.deliveryDate,

      -- Shipper user
      SU.fullName                AS shipperFullName,
      SU.phoneNumber             AS shipperPhone,

      -- Driver request
      DR.driverRequestUniqueId,

      -- Driver user
      DU.fullName                AS driverFullName,
      DU.phoneNumber             AS driverPhone,

      -- Company bid (NULL for individual mode)
      CBR.companyBidRequestUniqueId,
      CBR.proposedCostPerVehicle,
      CBR.proposedTotalCost,
      CBR.numberOfVehiclesOffered,
      CBR.bidStatus,

      -- Company
      TC.companyUniqueId,
      TC.companyName

    FROM JourneyDecisions JD
    JOIN DriverRequest DR
      ON DR.driverRequestId = JD.driverRequestId
    JOIN ShipperRequest SR
      ON SR.shipperRequestId = JD.shipperRequestId
    LEFT JOIN Users SU
      ON SU.userUniqueId = SR.userUniqueId
    LEFT JOIN Users DU
      ON DU.userUniqueId = DR.userUniqueId
    LEFT JOIN CompanyBidVehicleAssignment CBVA
      ON CBVA.shipperRequestUniqueId = SR.shipperRequestUniqueId
    LEFT JOIN CompanyBidRequest CBR
      ON CBR.companyBidRequestUniqueId = CBVA.companyBidRequestUniqueId
    LEFT JOIN TransportCompany TC
      ON TC.companyUniqueId = CBR.companyUniqueId
    WHERE ${whereClause}
    ORDER BY JD.journeyDecisionId DESC
    LIMIT ? OFFSET ?
  `;

  params.push(Number(limit), Number(offset));

  const executor = transactionStorage.getStore() || pool;
  const [rows] = await executor.query(sql, params);

  const countParams = params.slice(0, -2);
  const countSql = `
    SELECT COUNT(*) AS total
    FROM JourneyDecisions JD
    JOIN DriverRequest DR
      ON DR.driverRequestId = JD.driverRequestId
    WHERE ${whereClause}
  `;
  const [countRows] = await executor.query(countSql, countParams);
  const total = countRows[0]?.total || 0;

  const data = rows.map((r) => ({
    journey: {
      journeyDecisionUniqueId: r.journeyDecisionUniqueId,
      decisionTime: r.decisionTime,
      effectiveEarning:
        r.requestMode === "company_target"
          ? r.proposedCostPerVehicle
          : r.shippingCostByDriver,
      shippingCostByDriver: r.shippingCostByDriver,
      shippingDateByDriver: r.shippingDateByDriver,
      deliveryDateByDriver: r.deliveryDateByDriver,
      journeyStatusId: r.journeyStatusId,
    },
    shipper: {
      shipperRequestUniqueId: r.shipperRequestUniqueId,
      requestMode: r.requestMode,
      fullName: r.shipperFullName,
      phoneNumber: r.shipperPhone,
      originPlace: r.originPlace,
      destinationPlace: r.destinationPlace,
      shippableItemName: r.shippableItemName,
      shippableItemQtyInQuintal: r.shippableItemQtyInQuintal,
      shippingCost: r.shipperShippingCost,
      shippingDate: r.shippingDate,
      deliveryDate: r.deliveryDate,
    },
    driver: {
      driverRequestUniqueId: r.driverRequestUniqueId,
      fullName: r.driverFullName,
      phoneNumber: r.driverPhone,
    },
    company: r.companyBidRequestUniqueId
      ? {
          companyBidRequestUniqueId: r.companyBidRequestUniqueId,
          companyUniqueId: r.companyUniqueId,
          companyName: r.companyName,
          proposedCostPerVehicle: r.proposedCostPerVehicle,
          proposedTotalCost: r.proposedTotalCost,
          numberOfVehiclesOffered: r.numberOfVehiclesOffered,
          bidStatus: r.bidStatus,
          companyFee:
            r.shipperShippingCost !== null && r.proposedCostPerVehicle !== null
              ? r.shipperShippingCost - r.proposedCostPerVehicle
              : null,
        }
      : null,
  }));

  return {
    message: "Driver earnings fetched successfully",
    pagination: {
      currentPage: Number(offset),
      limit: Number(limit),
      totalItems: total,
      totalPages: Math.ceil(total / limit),
    },
    data,
  };
};
