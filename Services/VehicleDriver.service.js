const { getData } = require("../CRUD/Read/ReadData");
const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");

// Create a new VehicleDriver assignment
const createVehicleDriver = async (data) => {
  const {
    vehicleUniqueId,
    ownershipUniqueId: ownershipUniqueIdInput,
    ownerUserUniqueId, // backward-compat: map to ownershipUniqueId
    driverUserUniqueId,
    assignmentStatus = "active",
    assignmentStartDate,
    assignmentEndDate = null,
  } = data || {};

  // Basic validation
  if (!vehicleUniqueId || !driverUserUniqueId || !assignmentStartDate) {
    return { message: "error", error: "Missing required fields" };
  }
  // validate assignmentStatus
  const allowedStatuses = ["active", "inactive"];
  if (!allowedStatuses.includes(assignmentStatus)) {
    return { message: "error", error: "Invalid assignmentStatus" };
  }
  // first check if this vehicle is reserved by another user driver

  const vehicleDriver = await getData({
    tableName: "VehicleDriver",
    conditions: { vehicleUniqueId, assignmentStatus: "active" },
  });
  console.log("@vehicleDriver", vehicleDriver);
  // if vehicle is reserved by current user driver
  for (let data of vehicleDriver) {
    if (
      data.driverUserUniqueId == driverUserUniqueId &&
      data.assignmentStatus == "active"
    ) {
      return { message: "error", error: "Vehicle is already reserved by you" };
    }
  }
  // if vehicle is reserved by another user driver
  if (vehicleDriver.length) {
    return {
      message: "error",
      error: "Vehicle is already reserved by another user",
    };
  }
  // Resolve ownershipUniqueId (support legacy ownerUserUniqueId)
  // let ownershipUniqueId = ownershipUniqueIdInput;
  // if (!ownershipUniqueId) {
  //   if (!ownerUserUniqueId) {
  //     return {
  //       message: "error",
  //       error: "ownershipUniqueId or ownerUserUniqueId is required",
  //     };
  //   }
  // find active ownership for this vehicle and owner
  // const [owRows] = await pool.query(
  //   `SELECT ownershipUniqueId FROM VehicleOwnership
  //    WHERE vehicleUniqueId = ? AND userUniqueId = ?
  //    AND (ownershipEndDate IS NULL OR ownershipEndDate > NOW())
  //    ORDER BY ownershipStartDate DESC LIMIT 1`,
  //   [vehicleUniqueId, ownerUserUniqueId]
  // );
  // ownershipUniqueId = owRows?.[0]?.ownershipUniqueId;
  // if (!ownershipUniqueId) {
  //   return {
  //     message: "error",
  //     error: "Active ownership not found for given vehicle and owner",
  //   };
  // }
  // }

  const vehicleDriverUniqueId = uuidv4();
  const sql = `
    INSERT INTO VehicleDriver (
      vehicleDriverUniqueId,
      vehicleUniqueId,
      
      driverUserUniqueId,
      assignmentStatus,
      assignmentStartDate,
      assignmentEndDate
    ) VALUES (?, ?, ?, ?, ?, ?)
  `;

  try {
    const [result] = await pool.query(sql, [
      vehicleDriverUniqueId,
      vehicleUniqueId,
      driverUserUniqueId,
      assignmentStatus,
      assignmentStartDate,
      assignmentEndDate,
    ]);

    if (!result.affectedRows)
      return { message: "error", error: "Insert failed" };

    return { message: "success", data: { vehicleDriverUniqueId } };
  } catch (error) {
    console.error("@createVehicleDriver", error);
    return { message: "error", error: "Unable to create assignment" };
  }
};

// Consolidated, secure, paginated GET
const getVehicleDrivers = async (filters = {}) => {
  const {
    vehicleDriverUniqueId,
    vehicleUniqueId,
    ownershipUniqueId,
    ownerUserUniqueId,
    driverUserUniqueId,
    assignmentStatus,
    assignmentStartStart, // range for assignmentStartDate
    assignmentStartEnd,
    assignmentEndStart, // range for assignmentEndDate
    assignmentEndEnd,
    createdStart,
    createdEnd,
    updatedStart,
    updatedEnd,
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortOrder = "DESC",
  } = filters;
  console.log("@filters", filters);
  const where = [];
  const params = [];

  if (vehicleDriverUniqueId) {
    where.push("vd.vehicleDriverUniqueId = ?");
    params.push(vehicleDriverUniqueId);
  }
  if (vehicleUniqueId) {
    where.push("vd.vehicleUniqueId = ?");
    params.push(vehicleUniqueId);
  }
  if (ownershipUniqueId) {
    where.push("vd.ownershipUniqueId = ?");
    params.push(ownershipUniqueId);
  }

  if (driverUserUniqueId) {
    where.push("vd.driverUserUniqueId = ?");
    params.push(driverUserUniqueId);
  }
  if (assignmentStatus) {
    const allowed = ["active", "inactive"];
    if (!allowed.includes(assignmentStatus)) {
      return { message: "error", error: "Invalid assignmentStatus" };
    }
    where.push("vd.assignmentStatus = ?");
    params.push(assignmentStatus);
  }
  if (assignmentStartStart) {
    where.push("vd.assignmentStartDate >= ?");
    params.push(assignmentStartStart);
  }
  if (assignmentStartEnd) {
    where.push("vd.assignmentStartDate <= ?");
    params.push(assignmentStartEnd);
  }
  if (assignmentEndStart) {
    where.push("vd.assignmentEndDate >= ?");
    params.push(assignmentEndStart);
  }
  if (assignmentEndEnd) {
    where.push("vd.assignmentEndDate <= ?");
    params.push(assignmentEndEnd);
  }
  if (createdStart) {
    where.push("vd.createdAt >= ?");
    params.push(createdStart);
  }
  if (createdEnd) {
    where.push("vd.createdAt <= ?");
    params.push(createdEnd);
  }
  if (updatedStart) {
    where.push("vd.updatedAt >= ?");
    params.push(updatedStart);
  }
  if (updatedEnd) {
    where.push("vd.updatedAt <= ?");
    params.push(updatedEnd);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const numPage = Math.max(1, Number(page) || 1);
  const numLimit = Math.max(1, Math.min(Number(limit) || 10, 100));
  const offset = (numPage - 1) * numLimit;

  const sortableMap = {
    createdAt: "vd.createdAt",
    updatedAt: "vd.updatedAt",
    assignmentStartDate: "vd.assignmentStartDate",
    assignmentEndDate: "vd.assignmentEndDate",
  };
  const safeSortBy = sortableMap[sortBy] || sortableMap.createdAt;
  const safeSortOrder =
    String(sortOrder).toUpperCase() === "ASC" ? "ASC" : "DESC";

  const sql = `
    SELECT 
      vd.*, 
      v.vehicleTypeUniqueId, v.licensePlate, v.color,
      vt.*
     -- ow.fullName as ownerFullName, dr.fullName as driverFullName
    FROM VehicleDriver vd
    LEFT JOIN Vehicle v ON vd.vehicleUniqueId = v.vehicleUniqueId
    LEFT JOIN VehicleTypes vt ON v.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
   --  LEFT JOIN Users ow ON vo.userUniqueId = ow.userUniqueId
    LEFT JOIN Users dr ON vd.driverUserUniqueId = dr.userUniqueId
    ${whereClause}
    ORDER BY ${safeSortBy} ${safeSortOrder}
    LIMIT ? OFFSET ?
  `;
  const countSql = `
    SELECT COUNT(*) as total
    FROM VehicleDriver vd
     ${whereClause}
  `;

  const [rows] = await pool.query(sql, [...params, numLimit, offset]);
  const [countRows] = await pool.query(countSql, params);
  const total = countRows[0]?.total || 0;
  const totalPages = Math.ceil(total / numLimit);

  return {
    message: "success",
    data: rows,
    pagination: {
      currentPage: numPage,
      itemsPerPage: numLimit,
      totalItems: total,
      totalPages,
      hasNext: numPage < totalPages,
      hasPrev: numPage > 1,
    },
  };
};

// Update assignment
const updateVehicleDriverByUniqueId = async (
  vehicleDriverUniqueId,
  data = {}
) => {
  if (!vehicleDriverUniqueId) return { message: "error", error: "Missing ID" };

  const fields = [];
  const params = [];
  const allowedStatuses = ["active", "inactive"];

  if (data.vehicleUniqueId) {
    fields.push("vehicleUniqueId = ?");
    params.push(data.vehicleUniqueId);
  }
  if (data.ownerUserUniqueId) {
    fields.push("ownerUserUniqueId = ?");
    params.push(data.ownerUserUniqueId);
  }
  if (data.driverUserUniqueId) {
    fields.push("driverUserUniqueId = ?");
    params.push(data.driverUserUniqueId);
  }
  if (data.assignmentStatus) {
    if (!allowedStatuses.includes(data.assignmentStatus)) {
      return { message: "error", error: "Invalid assignmentStatus" };
    }
    fields.push("assignmentStatus = ?");
    params.push(data.assignmentStatus);
  }
  if (data.assignmentStartDate) {
    fields.push("assignmentStartDate = ?");
    params.push(data.assignmentStartDate);
  }
  if (typeof data.assignmentEndDate !== "undefined") {
    fields.push("assignmentEndDate = ?");
    params.push(data.assignmentEndDate);
  }

  if (!fields.length) return { message: "error", error: "No fields to update" };

  const sql = `UPDATE VehicleDriver SET ${fields.join(
    ", "
  )}, updatedAt = CURRENT_TIMESTAMP WHERE vehicleDriverUniqueId = ?`;
  params.push(vehicleDriverUniqueId);

  try {
    const [result] = await pool.query(sql, params);
    if (!result.affectedRows)
      return { message: "error", error: "Update failed" };
    return { message: "success", data: { updated: true } };
  } catch (error) {
    console.error("@updateVehicleDriverByUniqueId", error);
    return { message: "error", error: "Unable to update assignment" };
  }
};

// Delete assignment
const deleteVehicleDriverByUniqueId = async (vehicleDriverUniqueId) => {
  if (!vehicleDriverUniqueId) return { message: "error", error: "Missing ID" };
  try {
    const [result] = await pool.query(
      `DELETE FROM VehicleDriver WHERE vehicleDriverUniqueId = ?`,
      [vehicleDriverUniqueId]
    );
    if (!result.affectedRows)
      return { message: "error", error: "Delete failed" };
    return { message: "success", data: { deleted: true } };
  } catch (error) {
    console.error("@deleteVehicleDriverByUniqueId", error);
    return { message: "error", error: "Unable to delete assignment" };
  }
};

module.exports = {
  createVehicleDriver,
  getVehicleDrivers,
  updateVehicleDriverByUniqueId,
  deleteVehicleDriverByUniqueId,
};
