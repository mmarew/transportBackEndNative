const DATABASE_ENDPOINTS = {
  CREATE_TABLE: "/api/admin/createTable",
  GET_ALL_TABLES: "/api/admin/tables",
  DROP_TABLES: "/api/admin/dropTables",
  DROP_ALL_TABLES: "/api/admin/dropAllTables",
  UPDATE_TABLE: "/api/admin/updateTable/:tableName",
  ALTER_COLUMN: "/api/admin/alterColumn/:tableName",
  DROP_COLUMN: "/api/admin/dropColumn/:tableName/:columnName",
  ADD_INDEX: "/api/admin/addIndex/:tableName",
  DROP_INDEX: "/api/admin/dropIndex/:tableName",
  DROP_FK: "/api/admin/dropForeignKey/:tableName",
  ADD_FK: "/api/admin/addForeignKey/:tableName",
  GET_TABLE_COLUMNS: "/tableColumns/:tableName",
  GET_INSTALL_PREDEFINED_DATA: "/api/admin/installPreDefinedData",
  POST_INSTALL_PREDEFINED_DATA: "/api/admin/installPreDefinedData",
  GET_USER_OTP: "/api/admin/dev/getUserOtp",
  SEED_TEST_DOCUMENT: "/api/admin/dev/seedTestDocument",
};

module.exports = {
  DATABASE_ENDPOINTS,
};
