const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const { verifyExistanceOfVechle } = require("../Validator/Vechle.validator");
const deleteVechleType = async (req) => {
    try {
      const sqlToDelete = `delete from vechleType where vehicleTypeUniqueId=?`;
      const vehicleTypeUniqueId = req?.body?.vehicleTypeUniqueId;
      console.log("vehicleTypeUniqueId", vehicleTypeUniqueId);
      const value = [vehicleTypeUniqueId];
      const [deleteResult] = await pool.query(sqlToDelete, value);
      if (deleteResult.affectedRows > 0) {
        return { message: "success", data: "vechle type deleted successfully" };
      } else {
        return {
          message: "error",
          data: "unable to get data",
        };
      }
    } catch (error) {
      console.log("error", error);
      return { message: "error", data: "vechle type deletion failed" };
    }
  },
  updateVechleVechleType = async () => {},
  registerVechleVechleType = async (req) => {
    try {
      const body = req.body;
      const isVechleExist = await verifyExistanceOfVechle(body.vehicleTypeName);
      if (isVechleExist) {
        return { message: "error", data: "vechle type already exist" };
      }
      const insertQuery = `insert into vechleType (vehicleTypeUniqueId,vehicleTypeName,carryingCapacity,createdAt,updatedAt) values(?,?,?,?,?)`;

      const values = [
        uuidv4(),
        body.vehicleTypeName,
        body.carryingCapacity,
        body.createdAt,
        body.updatedAt,
      ];
      const [result] = await pool.query(insertQuery, values);
      console.log("body", body);
      if (result.affectedRows > 0)
        return {
          message: "success",
          data: "vechle type registered successfully",
        };
      else return { message: "error", data: "not connected" };
    } catch (error) {
      console.log("error", error);
      return { message: "error", error: "something went wrong" };
    }
  },
  getListOfVechleType = async () => {
    try {
      const query = `select * from vechleType`;
      const [result] = await pool.query(query);
      console.log("result", result);
      return { message: "success", data: result };
    } catch (error) {
      console.log("error", error);
      return { message: "error", error: "something went wrong" };
    }
  };

module.exports = {
  deleteVechleType,
  updateVechleVechleType,
  registerVechleVechleType,
  getListOfVechleType,
};
