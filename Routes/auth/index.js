"use strict";

const express = require("express");
const authRoutes = require("./auth.routes");

const router = express.Router();

// Mount auth routes (already contain /api/user and /api/admin paths)
router.use("/", authRoutes);

module.exports = router;
