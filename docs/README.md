# Transport Management System API Documentation

Complete API documentation for the Transport Management System backend.

## 📋 Overview

This documentation covers all aspects of the Transport Management System API, including setup, authentication, user management, driver operations, admin functions, and finance operations.

## 📁 Documentation Structure

This documentation is organized into modular files for better navigation and maintenance:

### 🚀 Getting Started

- **[Setup & Initialization](setup.md)** - Database setup, table creation, and initial data population
- **[Environment Configuration](environment.md)** - Required environment variables and configuration

### 🔐 Security & Authentication

- **[Error Handling & Status Codes](errors.md)** - API error responses and HTTP status codes
- **[Authentication & Security](auth.md)** - JWT tokens, RBAC, and security features

### 👥 User Management

- **[User Management](user-management.md)** - User registration, OTP verification, and profile management
- **[Driver Registration](driver-registration.md)** - Driver account creation and verification process
- **[Document Management](document-management.md)** - File uploads, document verification, and management

### 🚛 Core Operations

- **[Passenger Operations](shipper-operations.md)** - Ride requests, journey management, and tracking
- **[Admin Operations](admin-operations.md)** - Administrative functions, user approval, and system management
- **[Finance Management](finance-management.md)** - Deposits, payments, balances, and financial operations

## 🛠️ API Tools & Resources

### Interactive Documentation

- **Swagger UI**: Visit `/api-docs` when the server is running for interactive API testing
- **OpenAPI Spec**: Available at `/api-docs.json` for import into other tools

### Development Tools

- **Postman Collection**: Import the API endpoints for testing
- **Environment File**: Copy `.env.sample` to `.env` and configure your settings

## 📊 API Statistics

- **Total Endpoints**: 25+ API endpoints
- **Authentication Methods**: JWT Bearer tokens
- **Response Format**: JSON
- **Rate Limiting**: Configurable by user type
- **Real-time Features**: WebSocket support for live updates

## 🔄 Quick Start

1. **Setup Environment**

   ```bash
   cp .env.sample .env
   # Edit .env with your configuration
   ```

2. **Install Dependencies**

   ```bash
   npm install
   ```

3. **Database Setup**

   ```bash
   npm run db:create    # Create tables
   npm run db:seed      # Populate initial data
   ```

4. **Start Server**

   ```bash
   npm start
   ```

5. **Access Documentation**
   - API Docs: `http://localhost:3000/api-docs`
   - Health Check: `http://localhost:3000/`

## 📞 Support

For questions or issues with the API:

- Check the relevant section in this documentation
- Review the Swagger UI for endpoint details
- Check server logs for error details

## 📝 Version History

- **v1.0.0** (2026-01-31) - Initial release with complete transport management features
- Comprehensive user management, driver operations, admin functions, and finance operations
- JWT authentication, role-based access control, and real-time communication

---

**Last Updated**: January 31, 2026
**API Version**: v1.0.0
