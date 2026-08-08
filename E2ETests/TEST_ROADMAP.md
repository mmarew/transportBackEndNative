# Test Flow Review & Roadmap — Transport Backend E2E

## 1. Overall verdict

The suite is a **sequential "script-style" E2E runner**, not a test framework: 110 files, ~99 of which print directly to console, 398 `try/catch` blocks, and 3 distinct code generations living side by side:

| Gen | Style | Where |
|---|---|---|
| 1 | `try/catch` + `console.log`, **swallows errors** | older CRUD files (Vehicles, many Finance, Drivers) |
| 2 | `report.pass/fail/skip` + rethrow | Supplementary files, Admin, Journey, Auth |
| 3 | dedicated `state.js` + `helpers.js` + section files + reporter | Queue suite (the reference standard) |

**The single biggest problem:** tests can **pass while the endpoint fails.** The `safe()` wrapper in `E2ETests/index.js:84` catches errors so the run continues — but dozens of functions (e.g. `Vehicles/vehicle.js` `createVehicle`, `attachVehiclesDocuments`) swallow errors inside their own catch and never call `report.fail`. The suite then prints "SUCCESS" and exits 0. That makes the pass count meaningless.

## 2. What's good (keep these)

- Shared in-memory state `usersData` (constants.js) — right idea for chained flows.
- `runId`-unique phones/emails — runs never collide.
- Non-destructive DB reset (CREATE IF NOT EXISTS, no drops) + `ensureJourneyLocationColumns` schema migration.
- `safe(label, fn)` orchestration keeps the run alive and produces a summary.
- Journey state-machine branching (`status 2→5`) in `runIndividualFlow.js` is the right shape.
- Queue suite is the model to copy: `state.js` for domain state, `helpers.js` for onboarding, per-section files, `report` everywhere.
- Docs exist: `E2E_GUIDE.md`, `TESTING_TEMPLATE.md`, `E2EExpansion.md`, `remaining-skips.md`.

## 3. Problems (ordered by severity)

1. **False positives** — catch-and-swallow without `report.fail` or rethrow. `E2ETests/index.js:274` `report.summary()` can return `true` while multiple endpoints silently failed.
2. **No assertions** — custom `Assert.js` is used in exactly 1 file (`Finance/Payments.js`). Everywhere else: log response and assume OK. No status-code or response-schema verification.
3. **Reporter underused & inconsistent** — only ~21 of 110 files use `report`; global `stats` object, manual `reset()`, no per-suite scoping; skips and passes conflated in older files.
4. **Provisioning duplication (DRY)** — Driver/Shipper/Company/Queue each re-run auth workflows; admin inline-created via `CREATE_USER_BY_ADMIN`; queue users runtime-injected into `usersData`; no canonical `systemAdmin`/`queueAdmin` in constants. See `PLAN_user_pipeline.md`.
5. **Hardcoded magic values** — inline `roleId: 2`, `roleId: 11`, status IDs, and string URLs `/api/...` scattered; `usersRoles` in constants is the right idea but under-used; legacy dead exports `userToken`, `unAuthorizedDriver`.
6. **Order entanglement** — `index.js` is one giant procedure; phases implicitly depend on earlier ones; most sub-suites can't run standalone.
7. **Global mutable coupling** — any file writes `usersData[userType].*`; order-sensitive, hard to reason about, no ownership.
8. **No data isolation/cleanup** — DB never wiped (intentional), entities never deleted; list-count assertions will break as runs accumulate.
9. **No CI wiring** — `npm run test:e2e` is a console script; no machine-readable output (JUnit/JSON), no containerized DB, exit code unreliable (see #1).
10. **Hand-maintained skips** — `remaining-skips.md` (127 pass / 29 skip) is manual; nothing fails the build when a "skip" regresses or becomes passable.
11. **Doc drift** — `TESTING_TEMPLATE.md` checklist still shows Journey/Vehicle/Request unchecked despite tests existing; `E2E_GUIDE.md` phase order ≠ actual `index.js` order.
12. **Negative-path coverage sparse** — mostly happy-path; authz (401/403), validation, and not-found cases are rare.
13. **No retries/timeouts** — flaky external deps (SMS/OTP, sockets) handled only by skipping.
14. **Mechanical re-export `index.js` files** — e.g. `Vehicles/index.js` is a 70-line list; low value, high churn.

## 4. Roadmap for the next test job (phased)

- **P0 — Make failures real.** Rule: every test call must end in `report.pass` or `report.fail` (or assert + rethrow). Eliminate catch-and-swallow (audit the ~297 catch blocks). Make the final gate fail when any endpoint call errored, not just on thrown errors. This alone fixes the "all green but broken" trap.
- **P1 — Single user pipeline.** Implement the `ensureUser()` plan (create→verify→login→account, once per role, reused by main + Queue + sub-suites; canonical `driver/shipper/systemAdmin/companyAdmin/queueAdmin/supperAdmin/admin` in constants). See `PLAN_user_pipeline.md`.
- **P2 — Thin runner layer.** Test registry with `describe`/`it`-like naming, per-test timing, retries, `report` scoped per suite, and **JUnit/JSON output for CI** — or migrate onto jest (already in package.json) via a jest E2E config with proper `setupFiles`/`afterAll` teardown.
- **P3 — Centralize config.** Endpoints map (`Routes/auth/APIEndPoints` already exists — extend the pattern), role/status constants, and **data factories** for user/company/vehicle/request payloads.
- **P4 — Assertion-first.** Adopt `node:assert`/`chai` + response-schema checks; require them for all new tests; kill the "log and assume" pattern.
- **P5 — Isolation & cleanup.** Seed-data helpers, per-group teardown, or per-run DB snapshot; delete created entities or use a disposable DB.
- **P6 — Negative-path matrix.** Authz (each role × forbidden route), validation errors, not-found — a systematic table, not ad hoc.
- **P7 — CI.** Run against containerized MySQL + seeded superAdmin; publish report; block on regressions; alert on skip-list changes.
- **P8 — Self-maintaining docs/skips.** Generate `remaining-skips.md` from real run output instead of hand-editing.
