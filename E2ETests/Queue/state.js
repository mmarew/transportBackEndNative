"use strict";

// Shared context for the Queue E2E suite. Each test file mutates this object as
// the flow progresses (mirrors the shared `usersData` pattern used across the
// framework). The orchestrator (index.js) seeds it during setup.
const queueState = {
  org: {
    main: { queueOrganizationUniqueId: null, queueOrganizationName: null },
    fence: { queueOrganizationUniqueId: null, queueOrganizationName: null },
  },
  vehicleTypes: { typeA: null, typeB: null, typeC: null },
  drivers: {
    d1: { userUniqueId: null, vehicleDriverUniqueId: null, vehicleTypeUniqueId: null },
    d2: { userUniqueId: null, vehicleDriverUniqueId: null, vehicleTypeUniqueId: null },
    d3: { userUniqueId: null, vehicleDriverUniqueId: null, vehicleTypeUniqueId: null },
    d4: { userUniqueId: null, vehicleDriverUniqueId: null, vehicleTypeUniqueId: null },
  },
  shipper: { userUniqueId: null },
};

module.exports = { queueState };
