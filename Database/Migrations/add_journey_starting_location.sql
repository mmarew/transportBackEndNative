-- Migration: record the driver's actual journey start location.
-- The shipper may place the wrong pickup point, so the driver's GPS at
-- "start journey" time is captured separately from ShipperRequest.origin*.

ALTER TABLE Journey
    ADD COLUMN journeyStartingLat DECIMAL(10,8) NULL AFTER journeyStatusId,
    ADD COLUMN journeyStartingLng DECIMAL(11,8) NULL AFTER journeyStartingLat;
