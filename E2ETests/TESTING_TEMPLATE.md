# E2E Testing Template & Guidelines

## Test File Structure

Each route should have a corresponding test file following this pattern:

```
E2ETests/
├── [Domain]/
│   ├── [Entity].js          # Main CRUD test for entity
│   ├── [SubEntity].js       # Related sub-entity tests
│   └── index.js             # Export all domain tests
```

## Test File Template

```javascript
// CRUD for [EntityName]
// Brief description of what this entity represents

const axios = require("axios");
const { backendURL, usersData } = require("../constants");

const BASE_URL = "/api/[route-prefix]/[entity]";
const cache = { data: null };

// ── GET all ───────────────────────────────────────────────────────────────────
const testGet[EntityName] = async ({ user, filters = {} } = {}) => {
  try {
    const token = user?.token;
    if (!token) throw new Error("token not found");

    const queryString = new URLSearchParams(filters).toString();
    const url = queryString ? `${BASE_URL}?${queryString}` : BASE_URL;
    
    const result = await axios.get(backendURL + url, {
      headers: { Authorization: "Bearer " + token },
    });
    
    console.log("✅ [EntityName] fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGet[EntityName]:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── CREATE ────────────────────────────────────────────────────────────────────
const testCreate[EntityName] = async ({ user, payload }) => {
  try {
    const token = user?.token;
    if (!token) throw new Error("token not found");
    
    const result = await axios.post(backendURL + BASE_URL, payload, {
      headers: { Authorization: "Bearer " + token },
    });
    
    console.log("✅ [EntityName] created:", result.data.[uniqueIdField]);
    return result.data;
  } catch (error) {
    console.error("❌ testCreate[EntityName]:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── UPDATE ────────────────────────────────────────────────────────────────────
const testUpdate[EntityName] = async ({ user, uniqueId, payload }) => {
  try {
    const token = user?.token;
    if (!token) throw new Error("token not found");
    
    const id = uniqueId || cache.data?.[0]?.[uniqueIdField];
    if (!id) throw new Error("No ID found to update");
    
    const result = await axios.put(`${backendURL}${BASE_URL}/${id}`, payload, {
      headers: { Authorization: "Bearer " + token },
    });
    
    console.log("✅ [EntityName] updated:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdate[EntityName]:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── DELETE (soft-delete) ──────────────────────────────────────────────────────
const testDelete[EntityName] = async ({ user, uniqueId }) => {
  try {
    const token = user?.token;
    if (!token) throw new Error("token not found");
    
    const id = uniqueId || cache.data?.[0]?.[uniqueIdField];
    if (!id) throw new Error("No ID found to delete");
    
    const result = await axios.delete(`${backendURL}${BASE_URL}/${id}`, {
      headers: { Authorization: "Bearer " + token },
    });
    
    console.log("✅ [EntityName] deleted:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDelete[EntityName]:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── Full workflow ─────────────────────────────────────────────────────────────
const test[EntityName]Workflow = async ({
  user = usersData.admin,
  createPayload = {},
  updatePayload = {},
} = {}) => {
  console.log("\n── [EntityName] Workflow ──");

  // GET (initial state)
  await testGet[EntityName]({ user });

  // CREATE
  const created = await testCreate[EntityName]({ user, payload: createPayload });
  const uniqueId = created?.[uniqueIdField];
  
  if (!uniqueId) {
    console.warn("⚠️  No ID returned - cannot continue workflow");
    return { skipped: true };
  }

  // GET (after create)
  await testGet[EntityName]({ user });

  // UPDATE
  await testUpdate[EntityName]({ user, uniqueId, payload: updatePayload });

  // GET (after update)
  await testGet[EntityName]({ user });

  // DELETE
  await testDelete[EntityName]({ user, uniqueId });

  // GET (after delete)
  await testGet[EntityName]({ user });

  console.log("── [EntityName] Workflow complete ──\n");
  return { uniqueId };
};

module.exports = {
  test[EntityName]Workflow,
  testGet[EntityName],
  testCreate[EntityName],
  testUpdate[EntityName],
  testDelete[EntityName],
};
```

## Testing Checklist

For each route/table, ensure:

- [ ] GET endpoint tested with filters
- [ ] CREATE endpoint tested with valid payload
- [ ] UPDATE endpoint tested (full and partial updates)
- [ ] DELETE endpoint tested (soft-delete where applicable)
- [ ] Error cases tested (missing fields, invalid IDs)
- [ ] Authorization tested (correct user roles)
- [ ] Full workflow tested (CREATE → GET → UPDATE → DELETE)
- [ ] Cleanup after tests to avoid data pollution

## Priority Testing Order

1. **Core Entities** (already done)
   - [x] Users (Auth, Driver, Shipper, Admin)
   - [x] Roles
   - [x] Delinquency system (Types, Delinquencies, Responses, Decisions, Bans)

2. **Journey System** (high priority)
   - [ ] JourneyDecisions
   - [ ] Journey
   - [ ] JourneyStatus
   - [ ] JourneyRoutePoints
   - [ ] CanceledJourneys
   - [ ] CancellationReasonsType

3. **Vehicle System** (high priority)
   - [x] Vehicle (partial)
   - [ ] VehicleType
   - [ ] VehicleStatus
   - [ ] VehicleStatusType
   - [ ] VehicleOwnership
   - [ ] VehicleDriver

4. **Request System**
   - [ ] DriverRequest
   - [ ] ShipperRequest
   - [ ] ShipperRequestBatch

5. **Document System**
   - [ ] DocumentTypes
   - [ ] AttachedDocuments
   - [ ] RoleDocumentRequirements

6. **Rating & Finance**
   - [ ] Ratings
   - [ ] TariffRateForVehicleTypes
   - [ ] (Company finance tests)

7. **Status Management**
   - [ ] Status
   - [ ] UserStatus
   - [ ] UserRoleStatus

8. **Miscellaneous**
   - [ ] Account
   - [ ] SMSSender
   - [ ] Firebase

## Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run specific domain tests
node E2ETests/Journey/index.js
node E2ETests/Documents/index.js
```

## Best Practices

1. **Use skipDuplicateCheck where needed** - For entities with duplicate detection
2. **Clean up test data** - Delete created entities at end of workflow
3. **Handle missing dependencies** - Skip tests gracefully if prerequisites missing
4. **Log clearly** - Use ✅ ❌ 📋 emojis for visual feedback
5. **Throw on critical failures** - Let tests fail fast when setup is broken
6. **Assert expected outcomes** - Don't just log, verify the data is correct
