"use strict";

// ORDERED composition of the schema slices.
//
// !! ORDER IS LOAD-BEARING !!
// createTable() executes Database.js `sqlQuery` as a single `multipleStatements`
// batch (Services/Database/tableManage.service.js). MySQL has no deferred
// foreign-key creation, so a child table emitted before its parent fails on a
// fresh database with ER_FK_CANNOT_OPEN_PARENT (1825). Do NOT reorder, merge or
// tidy this list without re-running the fresh-database DDL gate.
//
// Each slice is a verbatim contiguous line range of the original schema, so
// this list is the only place emission order is expressed.
module.exports = [
  require("./01_core_identity"),
  require("./02_journey_users"),
  require("./03_roles_permissions"),
  require("./04_documents"),
  require("./05_shipper_orders"),
  require("./06_driver_orders"),
  require("./07_vehicles_drivers"),
  require("./08_ratings_profile"),
  require("./09_comms"),
  require("./10_payments"),
  require("./11_canceled_tariff"),
  require("./12_commission"),
  require("./13_subscriptions"),
  require("./14_finance"),
  require("./15_notifications"),
  require("./16_delinquency"),
  require("./17_company_core"),
  require("./18_company_bidding"),
  require("./19_driver_bid"),
  require("./20_queue"),
  require("./21_delivery"),
];
