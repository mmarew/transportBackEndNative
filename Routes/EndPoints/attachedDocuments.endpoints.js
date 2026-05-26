const ATTACHED_DOCUMENTS_ENDPOINTS = {
  USER_ATTACH_DOCUMENTS: "/api/user/attachDocuments/:userUniqueId",
  COMPANY_ATTACH_DOCUMENTS: "/api/company/attachDocuments/:companyUniqueId",
  VEHICLE_ATTACH_DOCUMENTS: "/api/vehicle/attachDocuments/:vehicleUniqueId",
  
  USER_GET_DOCUMENTS: "/api/user/attachedDocuments",
  COMPANY_GET_DOCUMENTS: "/api/company/attachedDocuments/:companyUniqueId",
  VEHICLE_GET_DOCUMENTS: "/api/vehicle/attachedDocuments/:vehicleUniqueId",
  
  USER_UPDATE_DOCUMENT: "/api/user/attachedDocuments/:attachedDocumentUniqueId",
  USER_DELETE_DOCUMENT: "/api/user/attachedDocuments/:attachedDocumentUniqueId",
  
  ADMIN_ACCEPT_REJECT_DOCUMENTS: "/api/admin/acceptRejectAttachedDocuments",
  
  USER_DOCUMENT_HISTORY: "/api/user/documentHistory",
  COMPANY_DOCUMENT_HISTORY: "/api/company/documentHistory/:companyUniqueId",
  VEHICLE_DOCUMENT_HISTORY: "/api/vehicle/documentHistory/:vehicleUniqueId",
};

module.exports = {
  ATTACHED_DOCUMENTS_ENDPOINTS,
};
