🎯 Complete Payment Flow
Flow Overview:
text
1. Merchant Signs Up → Gets API Key
2. Merchant Integrates API → Creates Payment
3. Customer Pays → Via UPI/Card
4. Payment Confirmed → Webhook Updates Status
5. Merchant Gets Paid → Via Payout System
📋 Step-by-Step Merchant Integration Flow
Step 1: Merchant Onboarding
Merchant signs up in your CashCavash app:

text
POST https://your-domain.com/api/auth/signup
Content-Type: application/json

{
  "name": "Rajesh Electronics",
  "email": "rajesh@electronics.com",
  "password": "SecurePass123",
  "role": "admin"
}
Response:

json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
Step 2: Generate API Key
Merchant creates API key:

text
POST https://your-domain.com/api/keys/create
x-auth-token: JWT_TOKEN_FROM_STEP_1
Content-Type: application/json

{}
Response:

json
{
  "apiKey": "cashcavash_5f3a4b2c1d9e8f7a6b5c4d3e2f1"
}
Merchant saves this API key and uses it for all payment requests.

Step 3: Create Payment (2 Options)
Option A: Simple Payment Link (Easiest)
Merchant creates a payment and gets a direct payment URL:

text
POST https://your-domain.com/api/payments/create
x-api-key: cashcavash_5f3a4b2c1d9e8f7a6b5c4d3e2f1
Content-Type: application/json

{
  "amount": 500,
  "customerName": "Amit Kumar",
  "customerEmail": "amit@customer.com",
  "customerPhone": "9876543210",
  "description": "Purchase from Rajesh Electronics"
}
Response:

json
{
  "success": true,
  "transaction": {
    "transactionId": "TXN_1759554488447_1d698133",
    "orderId": "ORD_1759554488447_164e93b0",
    "amount": 500,
    "status": "created",
    "merchantName": "Rajesh Electronics"
  },
  "payment": {
    "paymentUrl": "https://payments.cashfree.com/order/#/checkout?order_token=session_xyz...",
    "paymentSessionId": "session_xyz...",
    "expiresAt": "2025-11-03T10:38:09+05:30"
  },
  "message": "Payment created successfully. Redirect customer to paymentUrl."
}
Merchant sends paymentUrl to customer → Customer opens URL → Selects UPI/Card → Pays.

Option B: Custom Checkout (Advanced - UPI/Card Specific)
For merchants who want to build custom checkout UI:

Step 3.1: Create Payment Session

text
POST https://your-domain.com/api/payments/create
x-api-key: cashcavash_5f3a4b2c1d9e8f7a6b5c4d3e2f1
Content-Type: application/json

{
  "amount": 500,
  "customerName": "Amit Kumar",
  "customerEmail": "amit@customer.com",
  "customerPhone": "9876543210"
}
Save the paymentSessionId from response.

Step 3.2: Initiate UPI Payment

text
POST https://your-domain.com/api/payments/pay
x-api-key: cashcavash_5f3a4b2c1d9e8f7a6b5c4d3e2f1
Content-Type: application/json

{
  "paymentSessionId": "session_xyz...",
  "paymentMethod": "upi",
  "channel": "collect",
  "upiId": "customer@paytm"
}
Response:

json
{
  "success": true,
  "payment": {
    "cf_payment_id": "12345678",
    "payment_method": "upi",
    "channel": "collect"
  },
  "instructions": {
    "action": "poll_status",
    "message": "Payment request sent to UPI ID. Poll for status.",
    "upiId": "customer@paytm",
    "pollUrl": "/api/payments/status/ORD_xxx"
  }
}
OR Card Payment:

text
POST https://your-domain.com/api/payments/pay
x-api-key: cashcavash_5f3a4b2c1d9e8f7a6b5c4d3e2f1
Content-Type: application/json

{
  "paymentSessionId": "session_xyz...",
  "paymentMethod": "card",
  "cardDetails": {
    "cardNumber": "4111111111111111",
    "cardHolderName": "Amit Kumar",
    "cardExpiryMM": "12",
    "cardExpiryYY": "25",
    "cardCvv": "123"
  }
}
Step 4: Check Payment Status
Merchant polls to check if customer has paid:

text
GET https://your-domain.com/api/payments/status/ORD_1759554488447_164e93b0
x-api-key: cashcavash_5f3a4b2c1d9e8f7a6b5c4d3e2f1
Response:

json
{
  "success": true,
  "transaction": {
    "transactionId": "TXN_xxx",
    "orderId": "ORD_xxx",
    "status": "paid",
    "amount": 500,
    "paidAt": "2025-10-04T10:45:00.000Z",
    "paymentMethod": "upi"
  }
}
Step 5: Merchant Checks Balance
text
GET https://your-domain.com/api/payments/merchant/balance
x-auth-token: JWT_TOKEN
Response:

json
{
  "success": true,
  "balance": {
    "total_revenue": "50000.00",
    "commission_deducted": "1250.00",
    "available_balance": "48750.00"
  }
}
Step 6: Merchant Requests Payout
text
POST https://your-domain.com/api/payments/merchant/payout/request
x-auth-token: JWT_TOKEN
Content-Type: application/json

{
  "amount": 10000,
  "transferMode": "upi",
  "beneficiaryDetails": {
    "upiId": "rajesh@paytm"
  },
  "notes": "Monthly payout request"
}
Step 7: SuperAdmin Approves Payout
text
POST https://your-domain.com/api/payments/admin/payout
x-auth-token: SUPERADMIN_JWT_TOKEN
Content-Type: application/json

{
  "merchantId": "68df6dd6c8f3a0a133757461",
  "amount": 10000,
  "transferMode": "upi",
  "beneficiaryDetails": {
    "upiId": "rajesh@paytm"
  }
}
Money is transferred to merchant's UPI/Bank account.