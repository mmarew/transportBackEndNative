# Vehicle registration API — Postman / Swagger

```
POST /api/user/vehicles/driverUserUniqueId/:driverUserUniqueId
Authorization: Bearer <JWT>
Content-Type: application/json
```

The path value is `self`, a driver UUID, or `no-driver-is-assigned-yet`.

---

## 1. Self (`self`)

```
POST /api/user/vehicles/driverUserUniqueId/self
```

Payload:

```json
{
  "vehicleTypeUniqueId": "fddf2911-dfa5-4363-a04f-c82e59536fa4",
  "licensePlate": "AA-1234",
  "color": "White",
  "isDriverOwnerOfVehicle": false
}
```

Response `201`:

```json
{
  "message": "Vehicle created successfully",
  "data": {
    "vehicleUniqueId": "2f3b0c9a-1f8e-4d55-9a83-9c8f0d0e1a11"
  }
}
```

---

## 2. Driver UUID (`<uuid>`)

```
POST /api/user/vehicles/driverUserUniqueId/9ad44404-7974-42b6-b2cb-b42d6808c65d
```

Payload:

```json
{
  "vehicleTypeUniqueId": "fddf2911-dfa5-4363-a04f-c82e59536fa4",
  "licensePlate": "AA-5678",
  "color": "White",
  "companyUniqueId": "a1f0c1e2-9c2d-4a10-a2ad-7b2c1ef0a8d4"
}
```

`companyUniqueId` is optional — include it to add the vehicle to a company fleet.

Response `201`:

```json
{
  "message": "Vehicle created successfully",
  "data": {
    "vehicleUniqueId": "7a9e0b21-1e56-45c9-8a25-4eb1a90b6b3d"
  }
}
```

If the driver already has a different active vehicle, the plate is still registered as a `Vehicle` row and `data.message` is added. The existing `VehicleDriver` relation is left unchanged — no second driver relation is created:

```json
{
  "message": "Vehicle created successfully",
  "data": {
    "vehicleUniqueId": "7a9e0b21-1e56-45c9-8a25-4eb1a90b6b3d",
    "message": "AA-5678 is registered, but the driver has another active vehicle"
  }
}
```

---

## 3. No driver (`no-driver-is-assigned-yet`)

```
POST /api/user/vehicles/driverUserUniqueId/no-driver-is-assigned-yet
```

Payload:

```json
{
  "vehicleTypeUniqueId": "fddf2911-dfa5-4363-a04f-c82e59536fa4",
  "licensePlate": "AA-9012",
  "color": "White",
  "companyUniqueId": "a1f0c1e2-9c2d-4a10-a2ad-7b2c1ef0a8d4"
}
```

Response `201` — no driver is attached:

```json
{
  "message": "Vehicle created successfully",
  "data": {
    "vehicleUniqueId": "7a9e0b21-1e56-45c9-8a25-4eb1a90b6b3d",
    "vehicleOnly": true
  }
}
```

---

## Errors

`400`

```json
{
  "status": "error",
  "error": "companyUniqueId is required to register a company vehicle without a driver"
}
```

`401`

```json
{
  "status": "error",
  "error": "Invalid token. Please log in again!"
}
```

`403`

```json
{
  "status": "error",
  "error": "You are not allowed to register a vehicle"
}
```

---

## Postman

Import `postman/Vehicle-Registration.postman_collection.json` and
`postman/Vehicle-Registration.postman_environment.json`, fill in the token and
UUID variables, then send any of the three requests.

## Swagger

Open `/api-docs`, click **Authorize** and paste the JWT, then **Try it out** →
pick an example → **Execute**.
