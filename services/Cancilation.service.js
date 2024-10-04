const { v4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const {
  verifyExistanceOfCancilationReasons,
} = require("../Validator/Cancillation.validator");

const updateCancilationReasons = async (req, res) => {
  const sqlToUpdateCancilationReasons = `update cancilationReasons set reason = ?, cancilationBy = ? where reasonUniqueId = ?`;
  console.log("req.body", req.body);
  const reason = req.body.reason;
  const cancilationBy = req.body.cancilationBy;
  const reasonUniqueId = req.body.reasonUniqueId;
  const reasonValues = [reason, cancilationBy, reasonUniqueId];
  const [result] = await pool.query(
    sqlToUpdateCancilationReasons,
    reasonValues
  );
  console.log("result", result);
  if (result.affectedRows > 0)
    return {
      message: "success",
    };
  return {
    message: "error",
    error: "something went wrong to update data",
  };
};
const deleteCancilationReasons = async (req, res) => {
  const sqlToDeleteCancilationReasons = `delete from cancilationReasons where reasonUniqueId = ?`;
  const reasonUniqueId = req.body.reasonUniqueId;
  const reasonValues = [reasonUniqueId];
  const [result] = await pool.query(
    sqlToDeleteCancilationReasons,
    reasonValues
  );
  if (result.affectedRows > 0)
    return {
      message: "success",
    };

  return {
    message: "error",
    error: "something went wrong",
  };
};
const getCancilationReasons = async (req, res) => {
  const sqlToGetAllCancilationReasons = `select * from cancilationReasonsType`;
  const [result] = await pool.query(sqlToGetAllCancilationReasons);
  return { message: "success", data: result };
};
const addCancilationReasons = async (req, res) => {
  try {
    const reasonUniqueId = v4();
    const cancilationBy = req.body.cancilationBy;
    const reason = req.body.reason;
    const isAvailable = await verifyExistanceOfCancilationReasons(reason);
    if (isAvailable)
      return { message: "error", error: "cancilation reason already exist" };
    const sqlToAddReasones = `insert into  cancilationReasonsType (cancilationReasonTypeUniqueId,cancilationReasonType,caneledBy ) values(?,?,?)`;

    const reasonValues = [reasonUniqueId, reason, cancilationBy];
    const [registerResult] = await pool.query(sqlToAddReasones, reasonValues);
    if (registerResult.affectedRows > 0)
      return {
        message: "success",
        data: "your reason registered successfully",
      };
    else
      return {
        message: "error",
        data: "cancilation reason registration failed",
      };
  } catch (error) {
    console.log("error", error);
    return { message: "error", data: "cancilation reason registration failed" };
  }
};
module.exports = {
  addCancilationReasons,
  getCancilationReasons,
  deleteCancilationReasons,
  updateCancilationReasons,
};
