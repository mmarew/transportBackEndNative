Expand E2E Testing Coverage (Postman Gap Analysis)
The Postman parsing script identified approximately 130 endpoints that are not currently covered in the E2ETests suite. Many of these are edge cases, analytics queries, administrative toggles, or secondary status operations.

This implementation plan outlines the strategy to achieve 100% test coverage by breaking down the missing endpoints into logical, manageable phases.

Open Questions
WARNING

We have 132 endpoints left to test. Doing them all in one go would make the test runner extremely long and brittle. Which of the following Phases would you like to prioritize first? Should we just start with Phase 1?

Proposed Phased Implementation
Phase 1: Missing Core Reference Data (CRUDs)
We will create new test files in the E2ETests folder to cover standalone modules that aren't yet tested:

Ratings: POST /api/ratings, GET /api/ratings, PUT /api/ratings/ids, DELETE /api/ratings/ids
SMS Sender Config: POST /smsSender, GET /smsSender, etc.
Roles Configuration: POST /api/admin/roles, GET /api/admin/roles, etc.
Phase 2: Analytics, Counts, and Filter Endpoints
Many endpoints are purely GET queries that fetch aggregated data or filtered lists. We will create a AnalyticsAndFilters/ directory to test:

GET /api/user/getCanceledJourneyCountsByDate
GET /api/user/getCanceledJourneyCountsByReason
GET /api/admin/getCanceledJourneyByFilter
GET /api/admin/getUserByFilterDetailed
GET /api/vehicles (by filter)
Phase 3: Secondary Status Operations (Mark As Seen)
We have multiple endpoints responsible for clearing UI notification badges (marking events as seen). We will update the existing Driver/ and Shipper/ flows to call these after triggering specific events:

PUT /api/driver/markNegativeStatusAsSeen
PUT /api/shipperRequest/markJourneyCompletionAsSeen
PUT /api/shipperRequest/markCancellationAsSeen
Phase 4: Administrative Edge Cases & Utilities
These are potentially destructive or purely diagnostic admin operations. We will add a SystemAdmin/ test block:

GET /api/admin/system/logs
GET /api/admin/database/stats
POST /api/admin/payments/uuidv4
Verification Plan
Automated Tests
For each phase, we will add a new test folder/file (e.g., E2ETests/Analytics/index.js).
We will wire the new test blocks into the central E2ETests/index.js runner, placing them chronologically where they make the most sense (e.g., Analytics tests run at the very end after data has been seeded).
Run npm run test:e2e to verify no regressions occur in the Core Flows.
Manual Verification
Review the updated E2E_GUIDE.md which now contains the full roadmap of missing endpoints.
Check database state to ensure data isn't leaking between tests.
