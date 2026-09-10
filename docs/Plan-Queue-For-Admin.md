1. Dashboard Cards

=>Total Organizations

=> Pending Organizations

=>Approved Organizations

=>Rejected Organizations

=> Suspended Organizations

{{url}}/api/queueOrganization/getQueueCountsByStatus

response

{
"message": "success",
"data": {
"total": 12,
"pending": 3,
"approved": 9,
"rejected": 0,
"suspended": 0
}
}

2. Phase 2 —Organization Management
3. 1. Organization List
      Columns
      => Organization Name
      => Organization Type
4. =>Phone
   =>Address
   =>Approval Status
   =>Queue Enabled
5. =>Approved At
   Actions

   {{url}}/api/queueOrganization

   "{{url}}/api/queueOrganization?queueOrganizationType=customs&approvalStatus=pending&queueEnabled=true&page=1&limit=10" -H "Authorization: Bearer {{adminToken}}"

   approvalStatus can be 1) approved, 2) pending

   queueEnabled canbe true/false

   other can be other,customs

   =====> update organizations

   {{url}}/api/queueOrganization/{{queueOrganizationUniqueId}}

   ```postman_json
   {
       "checkinRadiusKm": 10
       // "queueOrganizationName": "Updated Organization Name",
       // "queueOrganizationType": "factory",
       // "queueOrganizationPhone": "+251922345678",
       // "queueOrganizationAddress": "Bole, Addis Ababa",
       // "latitude": 9.0105,
       // "longitude": 38.7636
   }

   {{url}}/api/queueOrganization/{{queueOrganizationUniqueId}}/approve
   ```
