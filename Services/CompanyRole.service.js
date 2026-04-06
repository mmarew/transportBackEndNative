"use strict";

const { db } = require("./CompanyHelper.service");

exports.getCompanyRoles = async () => {
  const [roles] = await db().query(
    "SELECT * FROM CompanyRoles ORDER BY companyRoleName ASC"
  );
  return { message: "success", data: roles };
};
