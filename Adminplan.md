Phase 1 — Dashboard
Dashboard Cards
. Total Organizations
. Pending Organizations
. Approved Organizations
. Rejected Organizations
. Suspended Organizations
Phase 2 — Organization Management

1. Organization List
   Columns
   . Organization Name
   . Organization Type
   . Phone
   . Address
   . Approval Status
   . Queue Enabled
   . Approved At
   . Actions
   Actions
   . View
   . Edit
   . Approve
   . Reject
   . Suspend
   . Delete
   . Members
   . View Queue
2. Create Organization
   Form Fields
   . Organization Name
   . Organization Type
   . Phone
   . Address
   . Latitude
   . Longitude
   . Check-in Radius
3. View Organization Detail
   Organization Information
   . Name
   . Type
   . Phone
   . Address
   . Latitude
   . Longitude
   . Check-in Radius
   Approval Information
   . Approval Status
   . Approval Reason
   . Queue Enabled
   . Approved By
   . Approved At
   Creator Information
   . Full Name
   . Email
   . Phone Number
4. Edit Organization
   Editable Fields
   . Name
   . Type
   . Phone
   . Address
   . Latitude
   . Longitude
   . Check-in Radius
5. Approve Organization
   Action
   Approve pending organizations.
   Request:
   {
   }
   "approvalStatus":
   "approved"
6. Reject Organization
   Action
   Reject organization.
   Fields
   . Rejection Reason
   Request:
   {
   "approvalStatus":
   "approvalReason":
   "rejected"
   ,
   "reason"
   }
7. Suspend Organization
   Action
   Suspend organization temporarily.
   Request:
   {
   }
   "approvalStatus":
   "suspended"
8. Delete Organization
   Action
   Soft Delete Organization.
   Phase 3 — Organization Approval
   Center
   Menu
   Organization Approvals
   Show
   Only organizations with:
   approvalStatus = pending
   Columns
   . Organization Name
   . Organization Type
   . Creator
   . Created Date
   . Actions
   Actions
   . View
   . Approve
   . Reject
   Source: Pending approval workflow.
   Phase 4 — Member Management
9. Member List
   Columns
   . Full Name
   . Phone Number
   . Role
   . Active
   . Membership Start Date
10. Add Member
    Fields
    . User
    . Role
    Roles
    . QueueOrgAdmin (11)
    . Shipper (1)
    Phase 5 — Queue Monitoring (Read
    Only)
    This is the part I would add now even before dispatching features.
11. View Queue
    Add a button on every organization:
    View Queue
12. Queue Overview
    Show
    . Organization Name
    . Queue Date
    . Total Waiting Drivers
13. Vehicle Type Tabs
    Example:
    Truck (15)
    Trailer (8)
    Tanker (4)
14. Queue Table
    Columns
    . Queue Number
    . Driver Name
    . Driver Phone
    . Vehicle
    . Status
    . Joined At
    . Requested At
    . Agreed At
15. Queue Statistics
    Status Counters
    . Waiting
    . Requested
    . Agreed
    . Not Agreed
    . Removed
16. Queue Entry Detail (Read Only)
    When admin clicks a queue row.
    Driver Information
    . Driver Name
    . Driver Phone
    . Vehicle Information
    Queue Information
    . Queue Number
    . Status
    . Joined At
    . Requested At
    . Agreed At
    Location
    . Driver Latitude
    . Driver Longitude
    Order Information
    . Shipper Request
    . Journey
    . Journey Decision
    . Proof Of Delivery
17. Queue History
    Columns
    . Column Changed
    . Old Value
    . Performed By
    . Performed Date
    Phase 6 — Simple Statistics
    Per Organization:
    . Approval Status
    . Queue Enabled
    . Member Count
    . Organization Type
    . Approved Date
    . Created Date
