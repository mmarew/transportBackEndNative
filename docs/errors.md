# Error Handling & Status Codes

Comprehensive guide to API error responses, HTTP status codes, and error handling patterns.

## HTTP Status Codes

### Success Codes

- **200 OK**: Request successful, data returned
- **201 Created**: Resource created successfully
- **204 No Content**: Request successful, no content to return

### Client Error Codes

- **400 Bad Request**: Invalid request data or parameters
- **401 Unauthorized**: Missing or invalid authentication token
- **403 Forbidden**: Valid authentication but insufficient permissions
- **404 Not Found**: Requested resource does not exist
- **409 Conflict**: Request conflicts with current resource state
- **422 Unprocessable Entity**: Validation errors in request data
- **429 Too Many Requests**: Rate limit exceeded

### Server Error Codes

- **500 Internal Server Error**: Unexpected server error
- **502 Bad Gateway**: Invalid response from upstream server
- **503 Service Unavailable**: Service temporarily unavailable
- **504 Gateway Timeout**: Upstream server timeout

## Standard Error Response Format

All API errors follow a consistent JSON structure:

```json
{
  "message": "error",
  "error": "Detailed error message describing the issue",
  "details": {
    "field": "phoneNumber",
    "issue": "Invalid format",
    "expected": "+1234567890",
    "received": "123-456-7890"
  },
  "timestamp": "2026-01-31T12:00:00.000Z",
  "requestId": "req-123456789"
}
```

### Error Response Fields

| Field       | Type   | Description                             |
| ----------- | ------ | --------------------------------------- |
| `message`   | string | Always "error" for error responses      |
| `error`     | string | Human-readable error description        |
| `details`   | object | Specific error details (optional)       |
| `timestamp` | string | ISO 8601 timestamp when error occurred  |
| `requestId` | string | Unique request identifier for debugging |

## Common Error Scenarios

### Authentication Errors

#### Invalid Token (401)

```json
{
  "message": "error",
  "error": "Invalid or expired authentication token",
  "timestamp": "2026-01-31T12:00:00.000Z",
  "requestId": "req-123456"
}
```

#### Missing Token (401)

```json
{
  "message": "error",
  "error": "Authentication token required",
  "timestamp": "2026-01-31T12:00:00.000Z",
  "requestId": "req-123457"
}
```

#### Insufficient Permissions (403)

```json
{
  "message": "error",
  "error": "You are not allowed to do this action",
  "details": {
    "requiredRole": "admin",
    "userRole": "shipper"
  },
  "timestamp": "2026-01-31T12:00:00.000Z",
  "requestId": "req-123458"
}
```

### Validation Errors

#### Required Field Missing (400)

```json
{
  "message": "error",
  "error": "Validation failed",
  "details": {
    "field": "phoneNumber",
    "issue": "Required field is missing"
  },
  "timestamp": "2026-01-31T12:00:00.000Z",
  "requestId": "req-123459"
}
```

#### Invalid Format (422)

```json
{
  "message": "error",
  "error": "Phone number format invalid",
  "details": {
    "field": "phoneNumber",
    "issue": "Invalid format",
    "expected": "E.164 format (+1234567890)",
    "received": "123-456-7890"
  },
  "timestamp": "2026-01-31T12:00:00.000Z",
  "requestId": "req-123460"
}
```

#### Invalid Enum Value (422)

```json
{
  "message": "error",
  "error": "Invalid status value",
  "details": {
    "field": "depositStatus",
    "issue": "Invalid enum value",
    "allowedValues": ["requested", "approved", "rejected"],
    "received": "pending"
  },
  "timestamp": "2026-01-31T12:00:00.000Z",
  "requestId": "req-123461"
}
```

### File Upload Errors

#### File Too Large (400)

```json
{
  "message": "error",
  "error": "File size exceeds maximum limit",
  "details": {
    "field": "document",
    "maxSize": "5MB",
    "receivedSize": "8MB"
  },
  "timestamp": "2026-01-31T12:00:00.000Z",
  "requestId": "req-123462"
}
```

#### Invalid File Type (400)

```json
{
  "message": "error",
  "error": "File type not allowed",
  "details": {
    "field": "document",
    "allowedTypes": ["image/jpeg", "image/png", "application/pdf"],
    "receivedType": "application/exe"
  },
  "timestamp": "2026-01-31T12:00:00.000Z",
  "requestId": "req-123463"
}
```

#### FTP Upload Failed (500)

```json
{
  "message": "error",
  "error": "File upload failed",
  "details": {
    "reason": "FTP connection timeout",
    "retryAfter": 300
  },
  "timestamp": "2026-01-31T12:00:00.000Z",
  "requestId": "req-123464"
}
```

### Business Logic Errors

#### Insufficient Balance (409)

```json
{
  "message": "error",
  "error": "Insufficient account balance",
  "details": {
    "requiredAmount": 150.0,
    "currentBalance": 50.0,
    "shortfall": 100.0
  },
  "timestamp": "2026-01-31T12:00:00.000Z",
  "requestId": "req-123465"
}
```

#### Resource Not Found (404)

```json
{
  "message": "error",
  "error": "User not found",
  "details": {
    "resource": "user",
    "identifier": "user-uuid-here"
  },
  "timestamp": "2026-01-31T12:00:00.000Z",
  "requestId": "req-123466"
}
```

#### Resource Conflict (409)

```json
{
  "message": "error",
  "error": "Phone number already registered",
  "details": {
    "field": "phoneNumber",
    "value": "+1234567890",
    "conflictType": "duplicate"
  },
  "timestamp": "2026-01-31T12:00:00.000Z",
  "requestId": "req-123467"
}
```

### External Service Errors

#### SMS Service Error (502)

```json
{
  "message": "error",
  "error": "SMS service temporarily unavailable",
  "details": {
    "service": "Africa's Talking",
    "errorCode": "SMS_001",
    "retryAfter": 60
  },
  "timestamp": "2026-01-31T12:00:00.000Z",
  "requestId": "req-123468"
}
```

## Rate Limiting

When rate limits are exceeded, the API returns:

```json
{
  "message": "error",
  "error": "Too many requests from this IP, please try again in an hour!",
  "details": {
    "retryAfter": 3600,
    "limit": 1000,
    "window": "1 hour"
  },
  "timestamp": "2026-01-31T12:00:00.000Z",
  "requestId": "req-123469"
}
```

### Rate Limit Headers

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 950
X-RateLimit-Reset: 1640995200
X-RateLimit-Retry-After: 3600
```

### Database Errors

#### Unknown column 'X' in 'where clause' (500)

**Scenario**: Searching in Admin tables fails with a field error.
**Cause**: The query references a column in a table that hasn't been joined yet (e.g., searching for a license plate in a list of drivers without an active vehicle).
**Fixed in**: `Services/Admin.service.js` now dynamically ensures vehicle-related joins are included whenever the `search` parameter is present.
**Standard Fix**: Ensure the `joins` string contains all tables referenced in the `where` clause.

## Error Handling Best Practices

### Client-Side Error Handling

```javascript
// Example error handling in JavaScript
async function apiCall(endpoint, options = {}) {
  try {
    const response = await fetch(endpoint, options);
    const data = await response.json();

    if (!response.ok) {
      throw new ApiError(data.error, response.status, data.details);
    }

    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      handleApiError(error);
    } else {
      handleNetworkError(error);
    }
  }
}

class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function handleApiError(error) {
  switch (error.status) {
    case 401:
      // Redirect to login
      redirectToLogin();
      break;
    case 403:
      // Show permission error
      showPermissionError(error.message);
      break;
    case 429:
      // Show rate limit message
      showRateLimitError(error.details.retryAfter);
      break;
    default:
      // Show generic error
      showGenericError(error.message);
  }
}
```

### Mobile App Error Handling

```dart
// Flutter/Dart error handling
Future<T> apiCall<T>(String endpoint, {Map<String, dynamic>? body}) async {
  try {
    final response = await http.post(
      Uri.parse(endpoint),
      headers: {'Authorization': 'Bearer $token'},
      body: jsonEncode(body),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(response.body);
    } else {
      final errorData = jsonDecode(response.body);
      throw ApiException(
        message: errorData['error'],
        statusCode: response.statusCode,
        details: errorData['details'],
      );
    }
  } on SocketException {
    throw NetworkException('No internet connection');
  } on TimeoutException {
    throw NetworkException('Request timeout');
  }
}

class ApiException implements Exception {
  final String message;
  final int statusCode;
  final Map<String, dynamic>? details;

  ApiException({
    required this.message,
    required this.statusCode,
    this.details,
  });
}
```

## Error Monitoring & Debugging

### Request ID Tracking

Every error response includes a `requestId` that can be used to:

- Track requests across multiple services
- Correlate logs in distributed systems
- Provide specific error context to support teams

### Logging Error Details

Server-side error logging includes:

- Request ID for correlation
- User ID (if authenticated)
- Endpoint and method
- Request parameters (sanitized)
- Full error stack trace
- Timestamp and server information

### Support Request Format

When reporting API errors to support, include:

- Request ID from error response
- Endpoint and HTTP method
- Request payload (sanitized)
- User agent and platform information
- Steps to reproduce the issue

## Error Prevention

### Input Validation

- Always validate required fields
- Use appropriate data types and formats
- Implement length limits and allowed values
- Sanitize user inputs to prevent XSS

### Authentication Checks

- Verify JWT tokens on protected endpoints
- Check user permissions for role-restricted operations
- Implement token refresh for expired sessions

### Resource Management

- Implement proper database connection pooling
- Set appropriate timeouts for external service calls
- Handle file upload size and type restrictions
- Monitor resource usage to prevent exhaustion
