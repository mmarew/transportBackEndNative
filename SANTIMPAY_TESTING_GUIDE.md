# SantimPay Integration Testing Guide

## ✅ What I Added:

1. **Payment Method Search**: When webhook comes with `paymentVia` (e.g., "Telebirr"), it searches `FinancialInstitutionAccounts` by `institutionName` and updates the `accountUniqueId` in the deposit.

2. **Console.log for Payment URL**: Payment URL is logged in console so you can easily copy and click it in your browser.

---

## 📋 Step-by-Step Testing Guide:

### **Step 1: Setup Environment Variables**

Make sure your `.env` file has:

```env
SANTIMPAY_MERCHANT_ID=your-merchant-id
SANTIMPAY_PRIVATE_KEY=-----BEGIN EC PRIVATE KEY-----
...
-----END EC PRIVATE KEY-----
SANTIMPAY_SUCCESS_REDIRECT_URL=https://santimpay.com
SANTIMPAY_FAILURE_REDIRECT_URL=https://santimpay.com
SANTIMPAY_CANCEL_REDIRECT_URL=https://santimpay.com
SANTIMPAY_WEBHOOK_URL=https://your-ngrok-url.ngrok.io/api/driverDeposit/santimPay/webhook
```

**Note:** The code now uses **production base URL** (`https://services.santimpay.com/api/v1/gateway`) by default. Test mode has been removed.

### **Step 2: Setup ngrok (for webhook testing)**

1. Install ngrok: https://ngrok.com/download
2. Start your server: `npm start` or `node server.js`
3. In another terminal, run: `ngrok http 3000` (replace 3000 with your port)
4. Copy the ngrok URL (e.g., `https://abc123.ngrok-free.app`)
5. Update `SANTIMPAY_WEBHOOK_URL` in `.env`:
   ```
   SANTIMPAY_WEBHOOK_URL=https://abc123.ngrok-free.app/api/driverDeposit/santimPay/webhook
   ```
6. Restart your server

### **Step 3: Phone Numbers**

**For SantimPay Production:**

- Use **real phone numbers** of drivers making deposits
- The phone number is used to pre-fill the payment form
- Phone number is automatically retrieved from the authenticated user's profile (`req.user.phoneNumber`)

**Example phone number format:**

- `+251913841405`
- `+251922112480`
- Any valid Ethiopian phone number format

### **Step 4: Understand Money Flow**

**Important:** When a driver makes a payment via SantimPay:

1. **Money goes to SantimPay Merchant Account** (configured with `SANTIMPAY_MERCHANT_ID`)

   - This is SantimPay's account, not your company account
   - Money is held by SantimPay temporarily

2. **`accountUniqueId` in Database is for Record-Keeping Only**

   - The `accountUniqueId` in `DriverDeposit` table is just metadata
   - It tracks which financial institution account to associate with the deposit record
   - It does NOT mean money goes to that account automatically

3. **Actual Money Settlement**

   - SantimPay holds the money in their merchant account
   - You need to **settle/withdraw** money from SantimPay to your actual bank account
   - This is usually done through SantimPay dashboard or API (separate process)
   - Settlement can be daily, weekly, or on-demand depending on your agreement

4. **What `accountUniqueId` is Used For:**
   - Tracking which account the deposit should be associated with
   - Reporting and accounting purposes
   - If payment method is "Telebirr", it links to your Telebirr account record
   - But actual money is still in SantimPay merchant account until settlement

### **Step 5: Ensure Financial Institution Account Exists**

Make sure you have at least one active account in `FinancialInstitutionAccounts`:

- You can create it via API or directly in database
- It should have `isActive = TRUE`
- This is just for record-keeping, not where money actually goes

### **Step 6: Test Payment Initiation**

**Using Postman/Thunder Client/curl:**

```bash
POST http://localhost:3000/api/driverDeposit/initiateSantimPay
Headers:
  Authorization: Bearer YOUR_DRIVER_TOKEN
  Content-Type: application/json

Body:
{
  "depositAmount": 100
}
```

**Note:** `phoneNumber` is automatically retrieved from the authenticated user's profile. You don't need to send it in the request body.

**Expected Response:**

```json
{
  "message": "success",
  "data": {
    "driverDepositUniqueId": "xxx-xxx-xxx",
    "paymentUrl": "https://testnet.santimpay.com/...",
    "depositAmount": 100,
    "status": "PENDING"
  }
}
```

**In Console, you'll see:**

```
========================================
🎯 SANTIMPAY PAYMENT URL (Click to open):
========================================
https://testnet.santimpay.com/payment/xxx
========================================
```

### **Step 7: Click the Payment URL**

1. Copy the `paymentUrl` from console or response
2. Open it in your browser
3. Complete the payment on SantimPay test page
4. You'll be redirected to your success/failure URL

### **Step 8: Check Webhook**

After payment, SantimPay will call your webhook. Check your server logs:

```
Processing webhook: {
  txnId: 'xxx',
  thirdPartyId: 'xxx',
  status: 'COMPLETED',
  amount: '100',
  paymentVia: 'Telebirr'
}
```

If `paymentVia` matches an `institutionName` in `FinancialInstitutionAccounts`, it will update the `accountUniqueId`.

### **Step 9: Verify Deposit Status**

Check the deposit status:

```bash
GET http://localhost:3000/api/driverDeposit?driverDepositUniqueId=xxx
```

Should show:

- `depositStatus`: `COMPLETED` (or `FAILED`/`PENDING`)
- `depositURL`: SantimPay transaction ID (`txnId`)
- `accountUniqueId`: Updated if payment method found

### **Step 10: Verify Driver Balance**

If status is `COMPLETED`, check driver balance was updated:

```bash
GET http://localhost:3000/api/driverBalance?driverUniqueId=xxx
```

---

## 🔍 Testing Payment Method Search:

1. **Create Financial Institution Account** with `institutionName = "Telebirr"`:

   ```sql
   INSERT INTO FinancialInstitutionAccounts
   (accountUniqueId, institutionName, accountHolderName, accountNumber, accountType, isActive)
   VALUES
   (UUID(), 'Telebirr', 'System', '0000000000', 'mobile_money', TRUE);
   ```

2. **Make a payment** using SantimPay

3. **Check webhook logs** - should show:

   ```
   Found payment method account for Telebirr: xxx-xxx-xxx
   ```

4. **Verify deposit** - `accountUniqueId` should be updated to the Telebirr account

---

## 🐛 Troubleshooting:

1. **Payment URL not generated?**

   - Check environment variables are set correctly
   - Check console for errors

2. **Webhook not received?**

   - Verify ngrok is running
   - Check ngrok URL is correct in `.env`
   - Check ngrok web interface: http://localhost:4040

3. **Payment method not found?**

   - Make sure `institutionName` in database matches `paymentVia` from webhook (case-insensitive)
   - Check account is `isActive = TRUE`

4. **Balance not updated?**
   - Check webhook status is `COMPLETED`
   - Check server logs for balance update errors

---

## 💰 Money Flow Summary:

```
Driver Pays → SantimPay Merchant Account (SANTIMPAY_MERCHANT_ID)
                ↓
         [Money held by SantimPay]
                ↓
    [You settle/withdraw to your bank account]
                ↓
         Your Actual Bank Account
```

**Key Points:**

- Money goes to **SantimPay merchant account** first
- `accountUniqueId` in database is **metadata only** (for tracking)
- You need to **settle money** from SantimPay to your bank account separately
- Settlement is usually done through SantimPay dashboard or API

## 📝 Notes:

- Payment URL is logged in console for easy testing
- Webhook automatically searches for payment method by `institutionName`
- If payment method not found, uses existing account
- All webhook processing is logged for debugging
- **Production URL**: Code uses production base URL (`https://services.santimpay.com/api/v1/gateway`) by default
- **Phone Number**: Automatically retrieved from authenticated user's profile
- **Money**: Goes to SantimPay merchant account, not directly to your account
- **Settlement**: You need to withdraw/settle money from SantimPay separately
