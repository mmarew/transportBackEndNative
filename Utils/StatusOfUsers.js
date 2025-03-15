const findStatusByVehicleAndDocuments = ({
  vehicleRegistered,
  attachedDocumentsByStatus,
  requiredDocuments,
  attachedDocuments,
  unAttachedDocumentTypes,
}) => {
  let finalStatusId = null;

  // Check for invalid or missing inputs

  // Check if the user has a registered vehicle

  // 1. All Documents Accepted, Vehicle Registered (Active)
  if (
    vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length >= requiredDocuments.length
  ) {
    finalStatusId = 1;
  }
  // 2. No Document, No Vehicle Registered
  else if (!vehicleRegistered && attachedDocuments.length === 0) {
    finalStatusId = 2;
  }
  // 3. All Documents Pending, No Vehicle Registered
  else if (
    !vehicleRegistered &&
    attachedDocumentsByStatus.PENDING.length === requiredDocuments.length
  ) {
    finalStatusId = 3;
  }
  // 4. All Documents Rejected, No Vehicle Registered
  else if (
    !vehicleRegistered &&
    attachedDocumentsByStatus.REJECTED.length === requiredDocuments.length
  ) {
    finalStatusId = 4;
  }
  // 5. Some Documents Accepted, Some Pending, No Vehicle Registered
  else if (
    !vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length > 0 &&
    attachedDocumentsByStatus.PENDING.length > 0
  ) {
    finalStatusId = 5;
  }
  // 6. Some Documents Accepted, Some Rejected, No Vehicle Registered
  else if (
    !vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length > 0 &&
    attachedDocumentsByStatus.REJECTED.length > 0
  ) {
    finalStatusId = 6;
  }
  // 7. All Documents Accepted, No Vehicle Registered
  else if (
    !vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length === requiredDocuments.length
  ) {
    finalStatusId = 7;
  }
  // 8. No Document Attached, Vehicle Registered
  else if (vehicleRegistered && attachedDocuments.length === 0) {
    finalStatusId = 8;
  }
  // 9. All Documents Pending, Vehicle Registered
  else if (
    vehicleRegistered &&
    attachedDocumentsByStatus.PENDING.length === requiredDocuments.length
  ) {
    finalStatusId = 9;
  }
  // 10. All Documents Rejected, Vehicle Registered
  else if (
    vehicleRegistered &&
    attachedDocumentsByStatus.REJECTED.length === requiredDocuments.length
  ) {
    finalStatusId = 10;
  }
  // 11. Some Documents Accepted, Some Pending, Vehicle Registered
  else if (
    vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length > 0 &&
    attachedDocumentsByStatus.PENDING.length > 0
  ) {
    finalStatusId = 11;
  }
  // 12. Some Documents Accepted, Some Rejected, Vehicle Registered
  else if (
    vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length > 0 &&
    attachedDocumentsByStatus.REJECTED.length > 0
  ) {
    finalStatusId = 12;
  }

  // 13. All Documents Pending, Vehicle Registered
  else if (
    vehicleRegistered &&
    attachedDocumentsByStatus.PENDING.length >= requiredDocuments.length
  ) {
    finalStatusId = 13;
  }
  // 14. All Documents Rejected, Vehicle Registered
  else if (
    vehicleRegistered &&
    attachedDocumentsByStatus.REJECTED.length === requiredDocuments.length
  ) {
    finalStatusId = 14;
  }
  // 15. All Documents Pending, No Vehicle Registered
  else if (
    !vehicleRegistered &&
    attachedDocumentsByStatus.PENDING.length === requiredDocuments.length
  ) {
    finalStatusId = 15;
  }
  // 16. All Documents Rejected, No Vehicle Registered
  else if (
    !vehicleRegistered &&
    attachedDocumentsByStatus.REJECTED.length === requiredDocuments.length
  ) {
    finalStatusId = 16;
  }
  // 17. Vehicle Registered, Some Documents Not Attached
  else if (vehicleRegistered && unAttachedDocumentTypes.length > 0) {
    finalStatusId = 17;
  }
  // 18. No Vehicle Registered, Some Documents Not Attached
  else if (!vehicleRegistered && unAttachedDocumentTypes.length > 0) {
    finalStatusId = 18;
  }
  // 19. Vehicle Registered, All Documents Attached, Mixed Statuses
  else if (
    vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length > 0 &&
    (attachedDocumentsByStatus.PENDING.length > 0 ||
      attachedDocumentsByStatus.REJECTED.length > 0)
  ) {
    finalStatusId = 19;
  }
  // 20. Vehicle Not Registered, All Documents Attached, Mixed Statuses
  else if (
    !vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length > 0 &&
    (attachedDocumentsByStatus.PENDING.length > 0 ||
      attachedDocumentsByStatus.REJECTED.length > 0)
  ) {
    finalStatusId = 20;
  }
  // 21. Some Documents Accepted, Some Pending, No Vehicle Registered
  else if (
    !vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length > 0 &&
    attachedDocumentsByStatus.PENDING.length > 0
  ) {
    finalStatusId = 21;
  }
  // 22. Some Documents Accepted, Some Rejected, No Vehicle Registered
  else if (
    !vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length > 0 &&
    attachedDocumentsByStatus.REJECTED.length > 0
  ) {
    finalStatusId = 22;
  }
  // 23. Some Documents Accepted, Some Pending, Vehicle Registered
  else if (
    vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length > 0 &&
    attachedDocumentsByStatus.PENDING.length > 0
  ) {
    finalStatusId = 23;
  }
  // 24. Some Documents Accepted, Some Rejected, Vehicle Registered
  else if (
    vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length > 0 &&
    attachedDocumentsByStatus.REJECTED.length > 0
  ) {
    finalStatusId = 24;
  }
  // 25. All Documents Pending, No Vehicle Registered
  else if (
    !vehicleRegistered &&
    attachedDocumentsByStatus.PENDING.length >= requiredDocuments.length
  ) {
    finalStatusId = 25;
  }
  // 26. All Documents Rejected, No Vehicle Registered
  else if (
    !vehicleRegistered &&
    attachedDocumentsByStatus.REJECTED.length === requiredDocuments.length
  ) {
    finalStatusId = 26;
  }
  // 27. No Document Attached, Vehicle Registered
  else if (vehicleRegistered && attachedDocuments.length === 0) {
    finalStatusId = 27;
  }
  // 28. Vehicle Registered, All Documents Attached, Mixed Statuses
  else if (
    vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length > 0 &&
    (attachedDocumentsByStatus.PENDING.length > 0 ||
      attachedDocumentsByStatus.REJECTED.length > 0)
  ) {
    finalStatusId = 28;
  }
  // Default error case
  else {
    console.log(
      "@attachedDocumentsByStatus.PENDING.",
      attachedDocumentsByStatus.PENDING?.length,
      "requiredDocuments.length ",
      requiredDocuments.length
    );
    return {
      message: "error",
      data: "Unable to determine driver's status.",
    };
  }
  return { message: "success", finalStatusId: finalStatusId };
};
module.exports = { findStatusByVehicleAndDocuments };
