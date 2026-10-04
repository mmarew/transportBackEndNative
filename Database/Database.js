"use strict";

// Full schema DDL, split into ordered per-domain slices under ./schema/.
//
// Was one 2114-code-line string behind an `eslint-disable max-lines` opt-out.
// The slices are verbatim contiguous ranges of the original text and `sqlQuery`
// is reassembled byte-identically - see DATABASE_JS_SLICE_PLAN.md.
//
// Consumers keep importing { sqlQuery, driverQueueHistoryDdl } from here: this
// module remains the public surface.
const slices = require("./schema");
const driverQueueHistoryDdl = require("./schema/00_driver_queue_history");

// Trailing newline reproduces the original template literal's final newline.
const sqlQuery = `${slices.join("")}\n`;

module.exports = { sqlQuery, driverQueueHistoryDdl };
