const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const currentDate = require("../Utils/currentDate");
const { getData } = require("../CRUD/Read/ReadData");
const { insertData } = require("../CRUD/Create/CreateData");
const createRole = async (body) => {
  const { roleName, roleDescription, user } = body;
  const roleUniqueId = uuidv4();
  const userUniqueId = user?.userUniqueId;
  const existedData = await getData({
    tableName: "Roles",
    conditions: { roleName },
  });
  console.log("existed role Data", existedData);
  if (existedData?.length > 0) {
    return { message: "error", data: "Role already exists" };
  }
  const colAndVal = {
    roleUniqueId,
    roleName,
    roleDescription,
    roleCreatedBy: userUniqueId,
    roleCreatedAt: currentDate(),
  };
  const tableName = "Roles";
  try {
    const registeredRole = await insertData({ tableName, colAndVal });

    if (registeredRole.affectedRows > 0) {
      return { message: "success", data: "Role created successfully" };
    }
    return { message: "error", data: "Role creation failed" };
  } catch (error) {
    console.error("Error:", error);
    return {
      message: "error",
      data: "An error occurred during role creation",
    };
  }
};

const getRole = async (id) => {
  const sql = `SELECT * FROM Roles WHERE roleUniqueId = ? AND roleDeletedAt IS NULL`;

  try {
    const [rows] = await pool.query(sql, [id]);
    if (rows.length > 0) {
      return { message: "success", data: rows[0] };
    }
    return { message: "error", data: "Role not found" };
  } catch (error) {
    console.error("Error:", error);
    return {
      message: "error",
      data: "An error occurred while retrieving the role",
    };
  }
};

const updateRole = async (id, body) => {
  const { roleName, roleDescription } = body;
  const sql = `UPDATE Roles SET roleName = ?, roleDescription = ? WHERE roleUniqueId = ? AND roleDeletedAt IS NULL`;
  const values = [roleName, roleDescription, id];

  try {
    const [result] = await pool.query(sql, values);
    if (result.affectedRows > 0) {
      return { message: "success", data: "Role updated successfully" };
    }
    return { message: "error", data: "Role update failed" };
  } catch (error) {
    console.error("Error:", error);
    return { message: "error", data: "An error occurred during role update" };
  }
};

const deleteRole = async (id) => {
  const sql = `UPDATE Roles SET roleDeletedAt = NOW() WHERE roleUniqueId = ?`;

  try {
    const [result] = await pool.query(sql, [id]);
    if (result.affectedRows > 0) {
      return { message: "success", data: "Role deleted successfully" };
    }
    return { message: "error", data: "Role deletion failed" };
  } catch (error) {
    console.error("Error:", error);
    return { message: "error", data: "An error occurred during role deletion" };
  }
};

const getAllRoles = async () => {
  const sql = `SELECT * FROM Roles WHERE roleDeletedAt IS NULL`;

  try {
    const [rows] = await pool.query(sql);
    if (rows.length > 0) {
      return { message: "success", data: rows };
    }
    return { message: "error", data: "No roles found" };
  } catch (error) {
    console.error("Error:", error);
    return {
      message: "error",
      data: "An error occurred while retrieving the roles",
    };
  }
};

module.exports = {
  createRole,
  getRole,
  updateRole,
  deleteRole,
  getAllRoles,
};
