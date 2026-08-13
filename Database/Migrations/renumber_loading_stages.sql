-- Migration: renumber journey statuses so the loading stages are 5/6/7.
--
-- Dev-stage cleanup (no real data): the loading stages were originally added as
-- 18/19/20; the project is in development, so we renumber the catalog so the
-- lifecycle reads naturally: 1 waiting → 2 requested → 3 acceptedByDriver →
-- 4 acceptedByShipper → 5 goToLoadingPlace → 6 loading → 7 loaded →
-- 8 journeyStarted → 9 journeyCompleted → (cancellations 10+).
--
-- Old → New:
--   goToLoadingPlace 18 → 5, loading 19 → 6, loaded 20 → 7
--   journeyStarted 5 → 8, journeyCompleted 6 → 9, cancelledByShipper 7 → 10,
--   rejectedByShipper 8 → 11, cancelledByDriver 9 → 12, cancelledByAdmin 10 → 13,
--   completedByAdmin 11 → 14, cancelledBySystem 12 → 15, noAnswerFromDriver 13 → 16,
--   notSelectedInBid 14 → 17, rejectedByDriver 15 → 18,
--   replacedByCompanyAssignment 16 → 19, partiallyCancelled 17 → 20
--
-- Technique: move old 5..17 out of the way (+100), move 18/19/20 → 5/6/7, then
-- bring 105..117 back to 8..20. FK checks are disabled around the whole thing.

SET FOREIGN_KEY_CHECKS = 0;

-- ── JourneyStatus lookup table ──────────────────────────────────────────────
UPDATE JourneyStatus SET journeyStatusId = journeyStatusId + 100 WHERE journeyStatusId BETWEEN 5 AND 17;
UPDATE JourneyStatus SET journeyStatusId = 5 WHERE journeyStatusId = 18;
UPDATE JourneyStatus SET journeyStatusId = 6 WHERE journeyStatusId = 19;
UPDATE JourneyStatus SET journeyStatusId = 7 WHERE journeyStatusId = 20;
UPDATE JourneyStatus SET journeyStatusId = journeyStatusId - 97 WHERE journeyStatusId BETWEEN 105 AND 117;

-- ── ShipperRequest ───────────────────────────────────────────────────────────
UPDATE ShipperRequest SET journeyStatusId = journeyStatusId + 100 WHERE journeyStatusId BETWEEN 5 AND 17;
UPDATE ShipperRequest SET journeyStatusId = 5 WHERE journeyStatusId = 18;
UPDATE ShipperRequest SET journeyStatusId = 6 WHERE journeyStatusId = 19;
UPDATE ShipperRequest SET journeyStatusId = 7 WHERE journeyStatusId = 20;
UPDATE ShipperRequest SET journeyStatusId = journeyStatusId - 97 WHERE journeyStatusId BETWEEN 105 AND 117;

-- ── ShipperRequestBatch ──────────────────────────────────────────────────────
UPDATE ShipperRequestBatch SET journeyStatusId = journeyStatusId + 100 WHERE journeyStatusId BETWEEN 5 AND 17;
UPDATE ShipperRequestBatch SET journeyStatusId = 5 WHERE journeyStatusId = 18;
UPDATE ShipperRequestBatch SET journeyStatusId = 6 WHERE journeyStatusId = 19;
UPDATE ShipperRequestBatch SET journeyStatusId = 7 WHERE journeyStatusId = 20;
UPDATE ShipperRequestBatch SET journeyStatusId = journeyStatusId - 97 WHERE journeyStatusId BETWEEN 105 AND 117;

-- ── DriverRequest ────────────────────────────────────────────────────────────
UPDATE DriverRequest SET journeyStatusId = journeyStatusId + 100 WHERE journeyStatusId BETWEEN 5 AND 17;
UPDATE DriverRequest SET journeyStatusId = 5 WHERE journeyStatusId = 18;
UPDATE DriverRequest SET journeyStatusId = 6 WHERE journeyStatusId = 19;
UPDATE DriverRequest SET journeyStatusId = 7 WHERE journeyStatusId = 20;
UPDATE DriverRequest SET journeyStatusId = journeyStatusId - 97 WHERE journeyStatusId BETWEEN 105 AND 117;

-- ── JourneyDecisions ─────────────────────────────────────────────────────────
UPDATE JourneyDecisions SET journeyStatusId = journeyStatusId + 100 WHERE journeyStatusId BETWEEN 5 AND 17;
UPDATE JourneyDecisions SET journeyStatusId = 5 WHERE journeyStatusId = 18;
UPDATE JourneyDecisions SET journeyStatusId = 6 WHERE journeyStatusId = 19;
UPDATE JourneyDecisions SET journeyStatusId = 7 WHERE journeyStatusId = 20;
UPDATE JourneyDecisions SET journeyStatusId = journeyStatusId - 97 WHERE journeyStatusId BETWEEN 105 AND 117;

-- ── Journey ──────────────────────────────────────────────────────────────────
UPDATE Journey SET journeyStatusId = journeyStatusId + 100 WHERE journeyStatusId BETWEEN 5 AND 17;
UPDATE Journey SET journeyStatusId = 5 WHERE journeyStatusId = 18;
UPDATE Journey SET journeyStatusId = 6 WHERE journeyStatusId = 19;
UPDATE Journey SET journeyStatusId = 7 WHERE journeyStatusId = 20;
UPDATE Journey SET journeyStatusId = journeyStatusId - 97 WHERE journeyStatusId BETWEEN 105 AND 117;

SET FOREIGN_KEY_CHECKS = 1;
