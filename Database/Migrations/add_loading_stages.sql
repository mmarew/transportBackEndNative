-- Migration: add loading stages (4.1/4.2/4.3) between acceptedByShipper (4) and journeyStarted (8).
--
-- New journey statuses (final numbering after the renumber migration):
--   5 goToLoadingPlace — driver confirmed heading to the loading place (driver GPS recorded)
--   6 loading          — driver arrived and started loading (driver GPS recorded, optional proof attachments)
--   7 loaded           — loading completed, cargo secured, ready to depart (driver GPS recorded, proof stored)
--
-- Also records the driver's GPS + timestamps at each loading stage on the Journey row,
-- mirroring how startJourney records journeyStartingLat/journeyStartingLng.
--
-- NOTE: fresh installs get these statuses from Utils/ListOfSeedData.js via
-- GET /api/admin/installPreDefinedData. This INSERT is idempotent insurance.

INSERT INTO JourneyStatus (journeyStatusId, journeyStatusUniqueId, journeyStatusName, journeyStatusDescription, journeyStatusCreatedBy, journeyStatusCreatedAt)
VALUES
  (5, '9a1c2e4f-18a0-4b1c-9d2e-3f4a5b6c7d18', 'goToLoadingPlace',
   'The shipper has accepted the driver (status 4) and the driver has confirmed they are heading to the loading place. The driver''s GPS is recorded at this moment. This is the first of the loading stages (4.1).',
   'system-queue-sweep', NOW()),
  (6, '9a1c2e4f-18a0-4b1c-9d2e-3f4a5b6c7d19', 'loading',
   'The driver has arrived at the loading place and started loading the cargo. The driver''s GPS is recorded at this moment. This is the second loading stage (4.2); proof-of-loading attachments (photos, signed docs) are optional and can be uploaded here.',
   'system-queue-sweep', NOW()),
  (7, '9a1c2e4f-18a0-4b1c-9d2e-3f4a5b6c7d20', 'loaded',
   'The driver has finished loading the cargo and it is secured, ready to depart. The driver''s GPS is recorded at this moment. This is the final loading stage (4.3); proof-of-loading attachments are stored on the journey here.',
   'system-queue-sweep', NOW())
ON DUPLICATE KEY UPDATE
  journeyStatusName = VALUES(journeyStatusName),
  journeyStatusDescription = VALUES(journeyStatusDescription);

-- Journey columns: GPS + timestamps for each loading stage, plus optional proof-of-loading attachments.
ALTER TABLE Journey
    ADD COLUMN journeyGoingToLoadingLat DECIMAL(10,8) NULL AFTER journeyStartingLng,
    ADD COLUMN journeyGoingToLoadingLng DECIMAL(11,8) NULL AFTER journeyGoingToLoadingLat,
    ADD COLUMN journeyLoadingStartedLat DECIMAL(10,8) NULL AFTER journeyGoingToLoadingLng,
    ADD COLUMN journeyLoadingStartedLng DECIMAL(11,8) NULL AFTER journeyLoadingStartedLat,
    ADD COLUMN journeyLoadingCompletedLat DECIMAL(10,8) NULL AFTER journeyLoadingStartedLng,
    ADD COLUMN journeyLoadingCompletedLng DECIMAL(11,8) NULL AFTER journeyLoadingCompletedLat,
    ADD COLUMN loadingStartedAt DATETIME NULL AFTER journeyLoadingCompletedLng,
    ADD COLUMN loadingCompletedAt DATETIME NULL AFTER loadingStartedAt,
    ADD COLUMN journeyProofOfLoading TEXT NULL AFTER loadingCompletedAt;
