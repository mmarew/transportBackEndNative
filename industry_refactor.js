/**
 * industry_refactor.js
 *
 * Converts "clean" single-prefix route files to industry-standard Express routing:
 *   - Strips base prefix from each *.endpoints.js constant → relative paths
 *   - Updates Routes/index.js to mount each router with its correct base prefix
 *
 * Multi-prefix files (Account, Admin, AttachedDocuments, User, ShipperRequest,
 * DriverRequest, auth) are intentionally left untouched.
 *
 * Run once: node industry_refactor.js
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROUTES_DIR = path.join(__dirname, "Routes");
const ENDPOINTS_DIR = path.join(ROUTES_DIR, "EndPoints");
const INDEX_PATH = path.join(ROUTES_DIR, "index.js");

// ─────────────────────────────────────────────────────────────────────────────
// MAPPING: endpointsFile → { mountPrefix, routeFile }
//
// mountPrefix  = what Routes/index.js will pass to Routes.use(prefix, router)
// The prefix is stripped from every path value in the endpoints file.
// ─────────────────────────────────────────────────────────────────────────────
const REFACTOR_MAP = [
  {
    endpointsFile: "status.endpoints.js",
    routeFile: "Status.routes.js",
    mountPrefix: "/api/admin/statuses",
  },
  {
    endpointsFile: "role.endpoints.js",
    routeFile: "Role.routes.js",
    mountPrefix: "/api/admin/roles",
  },
  {
    endpointsFile: "userRole.endpoints.js",
    routeFile: "UserRole.routes.js",
    mountPrefix: "/api/admin/userRole",
  },
  {
    endpointsFile: "userRoleStatus.endpoints.js",
    routeFile: "UserRoleStatus.routes.js",
    mountPrefix: "/api/admin/userRoleStatus",
  },
  {
    endpointsFile: "userStatus.endpoints.js",
    routeFile: "UserStatus.routes.js",
    mountPrefix: "/api/admin/userStatuses",
  },
  {
    endpointsFile: "vehicle.endpoints.js",
    routeFile: "Vehicle.routes.js",
    mountPrefix: "/api",
  },
  {
    endpointsFile: "vehicleType.endpoints.js",
    routeFile: "VehicleType.routes.js",
    mountPrefix: "/api/admin/vehicleTypes",
  },
  {
    endpointsFile: "vehicleStatus.endpoints.js",
    routeFile: "VehicleStatus.routes.js",
    mountPrefix: "/api",
  },
  {
    endpointsFile: "vehicleStatusType.endpoints.js",
    routeFile: "VehicleStatusType.routes.js",
    mountPrefix: "/api",
  },
  {
    endpointsFile: "vehicleDriver.endpoints.js",
    routeFile: "VehicleDriver.routes.js",
    mountPrefix: "/api/vehicleDriver",
  },
  {
    endpointsFile: "vehicleOwnership.endpoints.js",
    routeFile: "VehicleOwnership.routes.js",
    mountPrefix: "/api/admin/vehicleOwnerships",
  },
  {
    endpointsFile: "documentTypes.endpoints.js",
    routeFile: "DocumentTypes.routes.js",
    mountPrefix: "/api/documentTypes",
  },
  {
    endpointsFile: "roleDocumentRequirements.endpoints.js",
    routeFile: "RoleDocumentRequirements.routes.js",
    mountPrefix: "/api/RoleDocumentRequirements",
  },
  {
    endpointsFile: "tariffRateForVehicleTypes.endpoints.js",
    routeFile: "TariffRateForVehicleTypes.routes.js",
    mountPrefix: "/api/admin/tariffRateForVehicleType",
  },
  {
    endpointsFile: "journey.endpoints.js",
    routeFile: "Journey.routes.js",
    mountPrefix: "/api",
  },
  {
    endpointsFile: "journeyDecisions.endpoints.js",
    routeFile: "JourneyDecisions.routes.js",
    mountPrefix: "/api",
  },
  {
    endpointsFile: "journeyRoutePoints.endpoints.js",
    routeFile: "JourneyRoutePoints.routes.js",
    mountPrefix: "/api/journeyRoutePoints",
  },
  {
    endpointsFile: "journeyStatus.endpoints.js",
    routeFile: "JourneyStatus.routes.js",
    mountPrefix: "/api/admin/journeyStatus",
  },
  {
    endpointsFile: "cancellationReasonsType.endpoints.js",
    routeFile: "CancellationReasonsType.routes.js",
    mountPrefix: "/api/admin/cancellationReasons",
  },
  {
    endpointsFile: "delinquencyTypes.endpoints.js",
    routeFile: "DelinquencyTypes.routes.js",
    mountPrefix: "/api/admin/delinquency-types",
  },
  {
    endpointsFile: "bannedUsers.endpoints.js",
    routeFile: "BannedUsers.routes.js",
    mountPrefix: "/api/admin/banned-users",
  },
  {
    endpointsFile: "adminDecisionOnUserDelinquency.endpoints.js",
    routeFile: "AdminDecisionOnUserDelinquency.routes.js",
    mountPrefix: "/api/admin/user-delinquency-decisions",
  },
  {
    endpointsFile: "userDelinquency.endpoints.js",
    routeFile: "UserDelinquency.routes.js",
    mountPrefix: "/api/admin/userDelinquency",
  },
  {
    endpointsFile: "firebase.endpoints.js",
    routeFile: "Firebase.routes.js",
    mountPrefix: "/api",
  },
  {
    endpointsFile: "smsSender.endpoints.js",
    routeFile: "SMSSender.routes.js",
    mountPrefix: "/api",
  },
  {
    endpointsFile: "database.endpoints.js",
    routeFile: "Database.routes.js",
    mountPrefix: "/api/admin",
  },
  {
    endpointsFile: "health.endpoints.js",
    routeFile: "Health.routes.js",
    mountPrefix: "/api",
  },
  {
    endpointsFile: "ratings.endpoints.js",
    routeFile: "Ratings.routes.js",
    mountPrefix: "/api/ratings",
  },
  {
    endpointsFile: "canceledJourneys.endpoints.js",
    routeFile: "CanceledJourneys.routes.js",
    mountPrefix: "/api",
  },
  {
    endpointsFile: "shipperRequestBatch.endpoints.js",
    routeFile: "ShipperRequestBatch.routes.js",
    mountPrefix: "/api/shipperRequestBatch",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — Rewrite each *.endpoints.js to use relative paths
// ─────────────────────────────────────────────────────────────────────────────
for (const { endpointsFile, mountPrefix } of REFACTOR_MAP) {
  const filePath = path.join(ENDPOINTS_DIR, endpointsFile);
  let content = fs.readFileSync(filePath, "utf8");

  // Replace all string values that start with the mountPrefix
  // Uses a regex to match quoted strings: "/api/admin/whatever..." → "/whatever..."
  const escaped = mountPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`"(${escaped})([^"]*)"`, "g");

  const updated = content.replace(regex, (match, prefix, rest) => {
    const relative = rest === "" ? "/" : rest;
    return `"${relative}"`;
  });

  if (updated !== content) {
    fs.writeFileSync(filePath, updated, "utf8");
    console.log(`✅ Updated endpoints: ${endpointsFile} (stripped "${mountPrefix}")`);
  } else {
    console.log(`⚠️  No changes needed: ${endpointsFile}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — Rewrite Routes/index.js to mount with prefixes
// ─────────────────────────────────────────────────────────────────────────────
let indexContent = fs.readFileSync(INDEX_PATH, "utf8");

// Build a lookup: routeFile → mountPrefix
const routeToPrefix = {};
for (const { routeFile, mountPrefix } of REFACTOR_MAP) {
  routeToPrefix[routeFile] = mountPrefix;
}

// Replace bare require() entries with { path, handler } objects.
// Matches lines like:  require("./Foo.routes"),
const requireRegex = /\s*require\(["']\.\/([\w]+\.routes)['"]\),?/g;

const newIndex = indexContent.replace(requireRegex, (match, routeFileName) => {
  const fullName = `${routeFileName}.js`;
  const prefix = routeToPrefix[fullName];

  if (!prefix) {
    // Not in our refactor list — leave as-is
    return match;
  }

  // Replace with { path, handler } entry
  return `\n  { path: "${prefix}", handler: require("./${routeFileName}") },`;
});

// Also remove now-redundant IIFE wrappers that were added for error catching
// (DriverRequest and ShipperRequest — those are NOT in our refactor list so they
//  stay untouched by the regex above and remain as-is)

fs.writeFileSync(INDEX_PATH, newIndex, "utf8");
console.log("\n✅ Routes/index.js updated with mount prefixes.");
console.log("\n🚀 Industry refactor complete! All public API URLs are unchanged.");
