// routes/userRoutes.js
const express = require("express");
const controller = require("../Controllers/User.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const {
  verifyAdminsIdentity,
  verifyIfOperationIsAllowedByUserDriver,
} = require("../Middleware/VerifyUsersIdentity");
const upload = require("../Config/MulterConfig");

const router = express.Router();

// get users by role route removed — use getUserByFilterDetailed instead

router.post("/api/user/createUser", controller.createUser);
router.post(
  "/api/admin/createUserByAdminOrSuperAdmin",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  controller.createUserByAdminOrSuperAdmin
);
router.post(
  "/api/admin/createUser",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  controller.createUser
);
// log in / register user by phone number
router.get("/api/user/loginUser", controller.loginUser);
// login and single-user-by-role routes removed — use getUserByFilterDetailed instead
router.post("/api/user/verifyUserByOTP", controller.verifyUserByOTP);

router.put(
  "/api/user/updateUser/:ownerUserUniqueId",
  verifyTokenOfAxios,
  verifyIfOperationIsAllowedByUserDriver,
  upload.any(),
  controller.updateUser
);

router.delete(
  "/api/user/deleteUser/:userUniqueId",
  verifyTokenOfAxios,
  controller.deleteUser
);
// # 🔍 All Possible API URLs for User Filtering

// ## 📋 **BASE URL**
// ```
// /api/admin/getUserByFilterDetailed
// ```

// ---

// ## 🔍 **BASIC USER FILTERS**

// ### **By Unique ID**
// ```
// /api/admin/getUserByFilterDetailed?userUniqueId=USR_12345
// ```

// ### **By Phone Number**
// ```
// /api/admin/getUserByFilterDetailed?phoneNumber=+123456
// /api/admin/getUserByFilterDetailed?phoneNumber=555
// /api/admin/getUserByFilterDetailed?phoneNumber=1234567890
// ```

// ### **By Email**
// ```
// /api/admin/getUserByFilterDetailed?email=john@gmail
// /api/admin/getUserByFilterDetailed?email=@company.com
// /api/admin/getUserByFilterDetailed?email=user@domain
// ```

// ### **By Full Name**
// ```
// /api/admin/getUserByFilterDetailed?fullName=John
// /api/admin/getUserByFilterDetailed?fullName=John Doe
// /api/admin/getUserByFilterDetailed?fullName=Doe
// ```

// ### **Global Search**
// ```
// /api/admin/getUserByFilterDetailed?search=john
// /api/admin/getUserByFilterDetailed?search=admin
// /api/admin/getUserByFilterDetailed?search=555123
// ```

// ---

// ## 📅 **DATE FILTERS**

// ### **Exact Date**
// ```
// /api/admin/getUserByFilterDetailed?createdAt=2024-01-15
// /api/admin/getUserByFilterDetailed?createdAt=2024-12-01
// ```

// ### **Date Range**
// ```
// /api/admin/getUserByFilterDetailed?createdAt[start]=2024-01-01&createdAt[end]=2024-01-31
// /api/admin/getUserByFilterDetailed?createdAt[start]=2024-12-01&createdAt[end]=2024-12-31
// /api/admin/getUserByFilterDetailed?createdAt[start]=2024-01-01&createdAt[end]=2024-12-31
// ```

// ---

// ## 👥 **ROLE FILTERS**

// ### **By Role ID**
// ```
// /api/admin/getUserByFilterDetailed?roleId=1
// /api/admin/getUserByFilterDetailed?roleId=2
// /api/admin/getUserByFilterDetailed?roleId=3
// ```

// ### **By Role Unique ID**
// ```
// /api/admin/getUserByFilterDetailed?roleUniqueId=ROLE_ADMIN
// /api/admin/getUserByFilterDetailed?roleUniqueId=ROLE_USER
// /api/admin/getUserByFilterDetailed?roleUniqueId=ROLE_MODERATOR
// /api/admin/getUserByFilterDetailed?roleUniqueId=ROLE_CUSTOMER
// ```

// ---

// ## 📊 **STATUS FILTERS**

// ### **By Status ID**
// ```
// /api/admin/getUserByFilterDetailed?statusId=1
// /api/admin/getUserByFilterDetailed?statusId=2
// /api/admin/getUserByFilterDetailed?statusId=3
// ```

// ---

// ## 🔄 **COMBINED FILTERS**

// ### **Role + Status**
// ```
// /api/admin/getUserByFilterDetailed?roleId=1&statusId=1
// /api/admin/getUserByFilterDetailed?roleUniqueId=ROLE_ADMIN&statusId=2
// ```

// ### **Search + Role**
// ```
// /api/admin/getUserByFilterDetailed?search=john&roleId=1
// /api/admin/getUserByFilterDetailed?search=admin&roleUniqueId=ROLE_ADMIN
// ```

// ### **Date + Role**
// ```
// /api/admin/getUserByFilterDetailed?createdAt=2024-01-15&roleId=2
// /api/admin/getUserByFilterDetailed?createdAt[start]=2024-01-01&createdAt[end]=2024-01-31&roleId=1
// ```

// ### **Phone + Role + Status**
// ```
// /api/admin/getUserByFilterDetailed?phoneNumber=555&roleId=1&statusId=1
// ```

// ### **Email + Date Range**
// ```
// /api/admin/getUserByFilterDetailed?email=@gmail.com&createdAt[start]=2024-01-01&createdAt[end]=2024-12-31
// ```

// ---

// ## 📄 **PAGINATION**

// ### **Basic Pagination**
// ```
// /api/admin/getUserByFilterDetailed?page=1&limit=10
// /api/admin/getUserByFilterDetailed?page=2&limit=25
// /api/admin/getUserByFilterDetailed?page=3&limit=50
// ```

// ### **Pagination with Filters**
// ```
// /api/admin/getUserByFilterDetailed?search=john&page=1&limit=20
// /api/admin/getUserByFilterDetailed?roleId=1&page=2&limit=15
// /api/admin/getUserByFilterDetailed?createdAt=2024-01-15&page=1&limit=100
// ```

// ### **Maximum Results**
// ```
// /api/admin/getUserByFilterDetailed?limit=100
// /api/admin/getUserByFilterDetailed?page=1&limit=100
// ```

// ---

// ## 🎯 **PRACTICAL USE CASES**

// ### **Admin Dashboard**
// ```
// /api/admin/getUserByFilterDetailed?roleUniqueId=ROLE_ADMIN&statusId=1
// /api/admin/getUserByFilterDetailed?roleId=1&createdAt[start]=2024-01-01&createdAt[end]=2024-01-31
// ```

// ### **Customer Support**
// ```
// /api/admin/getUserByFilterDetailed?phoneNumber=555123
// /api/admin/getUserByFilterDetailed?email=@company.com&roleUniqueId=ROLE_CUSTOMER
// ```

// ### **User Management**
// ```
// /api/admin/getUserByFilterDetailed?search=inactive&statusId=3
// /api/admin/getUserByFilterDetailed?fullName=John&roleId=2&statusId=1
// ```

// ### **Reporting**
// ```
// /api/admin/getUserByFilterDetailed?createdAt[start]=2024-01-01&createdAt[end]=2024-01-31&limit=100
// /api/admin/getUserByFilterDetailed?roleUniqueId=ROLE_USER&statusId=1&page=1&limit=100
// ```

// ---

// ## ⚡ **COMPLEX COMBINATIONS**

// ### **Multi-field Search with Filters**
// ```
// /api/admin/getUserByFilterDetailed?search=john&roleId=1&statusId=1&page=1&limit=25
// ```

// ### **Date Range with Multiple Criteria**
// ```
// /api/admin/getUserByFilterDetailed?createdAt[start]=2024-01-01&createdAt[end]=2024-01-31&roleId=2&statusId=1
// ```

// ### **Complete User Lookup**
// ```
// /api/admin/getUserByFilterDetailed?phoneNumber=555&email=john&fullName=Doe&roleId=1
// ```

// ---

// ## 🔧 **EMPTY & TEST QUERIES**

// ### **Get All Users (Paginated)**
// ```
// /api/admin/getUserByFilterDetailed
// /api/admin/getUserByFilterDetailed?page=1&limit=10
// ```

// ### **Test Queries**
// ```
// /api/admin/getUserByFilterDetailed?search=test
// /api/admin/getUserByFilterDetailed?page=1&limit=5
// /api/admin/getUserByFilterDetailed?createdAt=2024-12-25
// ```

// ---

// ## 📝 **USAGE NOTES**

// - **All URLs require authentication** via `verifyTokenOfAxios`
// - **Maximum limit**: 100 records per page
// - **Date format**: YYYY-MM-DD
// - **Partial matches** work for: `phoneNumber`, `email`, `fullName`, `search`
// - **Exact matches** work for: `userUniqueId`, `roleId`, `roleUniqueId`, `statusId`
// - **Empty results** return `"No users found"` with empty data array

// ---
router.get(
  "/api/admin/getUserByFilterDetailed",
  verifyTokenOfAxios,
  controller.getUserByFilterDetailed
);

module.exports = router;
