# CashKavach API Integration Guide

## Table of Contents
1. [Getting Started](#getting-started)
2. [Authentication](#authentication)
3. [API Endpoints](#api-endpoints)
4. [Integration Flows](#integration-flows)
5. [Error Handling](#error-handling)
6. [Testing](#testing)

## Getting Started

### Base URL
```
Development: http://localhost:5000
Production: https://your-domain.com
```

### Prerequisites
- Node.js 14+ or any HTTP client
- Valid Cashfree account with API credentials
- MongoDB database

### Environment Variables
```env
JWT_SECRET=your_jwt_secret
CASHFREE_BASE_URL=https://sandbox.cashfree.com/pg
CASHFREE_APP_ID=your_app_id
CASHFREE_SECRET_KEY=your_secret_key
CASHFREE_PAYOUT_URL=https://payout-api.cashfree.com
MONGODB_URI=mongodb://localhost:27017/cashkavach
```

## Authentication

### 1. JWT Authentication (Dashboard APIs)
Used for merchant dashboard and admin operations.

**Header:**
```
x-auth-token: your_jwt_token
```

**Getting JWT:**
```bash
POST /api/auth/login
{
  "email": "merchant@example.com",
  "password": "password123"
}
```

### 2. API Key Authentication (Payment APIs)
Used for payment processing and merchant operations.

**Header:**
```
x-api-key: ninexgroup_xxxxxxxxxxxxxxxxxxxxxxxx
```

**Getting API Key:**
```bash
POST /api/create
x-auth-token: your_jwt_token
```

## API Endpoints

### Authentication Endpoints

#### 1. User Registration
```bash
POST /api/auth/signup
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "role": "admin",
  "businessName": "John's Store",
  "businessDetails": {
    "displayName": "John's Electronics",
    "description": "Electronics store",
    "website": "https://johnsstore.com",
    "supportEmail": "support@johnsstore.com",
    "supportPhone": "9876543210",
    "address": "123 Main St, City",
    "gstin": "12ABCDE1234F1Z5"
  }
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "64f1a2b3c4d5e6f7a8b9c0d1",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "admin",
    "businessName": "John's Store",
    "businessDetails": { ... },
    "createdAt": "2023-09-01T10:00:00.000Z"
  },
  "message": "User registered successfully"
}
```

#### 2. User Login
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "64f1a2b3c4d5e6f7a8b9c0d1",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "admin",
    "businessName": "John's Store"
  },
  "message": "Login successful"
}
```

#### 3. Get User Profile
```bash
GET /api/auth/profile
x-auth-token: your_jwt_token
```

#### 4. Update User Profile
```bash
PUT /api/auth/profile
x-auth-token: your_jwt_token
Content-Type: application/json

{
  "name": "John Smith",
  "businessName": "John's Electronics Store",
  "businessDetails": {
    "displayName": "John's Electronics",
    "description": "Premium electronics store"
  }
}
```

### API Key Management

#### 1. Create API Key
```bash
POST /api/create
x-auth-token: your_jwt_token
Content-Type: application/json

{}
```

**Response:**
```json
{
  "success": true,
  "apiKey": "ninexgroup_5f3a4b2c1d9e8f7a6b5c4d3e2f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9",
  "createdAt": "2023-09-01T10:00:00.000Z",
  "message": "API key created successfully. Keep it secure!"
}
```

#### 2. Get API Key
```bash
GET /api/get
x-auth-token: your_jwt_token
```

#### 3. Delete API Key
```bash
DELETE /api/delete
x-auth-token: your_jwt_token
```

#### 4. Regenerate API Key
```bash
POST /api/regenerate
x-auth-token: your_jwt_token
Content-Type: application/json

{}
```

### Payment Endpoints

#### 1. Create Payment Session
```bash
POST /api/payments/create
x-api-key: ninexgroup_your_api_key
Content-Type: application/json

{
  "amount": 500,
  "customerName": "Amit Kumar",
  "customerEmail": "amit@example.com",
  "customerPhone": "9876543210",
  "description": "Order #12345",
  "returnUrl": "https://yoursite.com/success",
  "notifyUrl": "https://yoursite.com/webhook"
}
```

**Response:**
```json
{
  "success": true,
  "transaction": {
    "transactionId": "TXN_1728123456789_abcd1234",
    "orderId": "ORD_1728123456789_efgh5678",
    "cfOrderId": "CF_ORDER_12345",
    "amount": 500,
    "currency": "INR",
    "status": "created",
    "customerName": "Amit Kumar",
    "customerEmail": "amit@example.com",
    "customerPhone": "9876543210",
    "merchantName": "John's Store",
    "createdAt": "2023-09-01T10:00:00.000Z"
  },
  "payment": {
    "paymentUrl": "https://payments.cashfree.com/order/#/checkout?order_token=session_xyz...",
    "paymentSessionId": "session_xyz...",
    "expiresAt": "2023-09-01T10:30:00+05:30"
  },
  "message": "Payment created successfully. Redirect customer to paymentUrl."
}
```

#### 2. Initiate Payment Method
```bash
POST /api/payments/pay
x-api-key: your_api_key
Content-Type: application/json

{
  "paymentSessionId": "session_xyz...",
  "paymentMethod": "upi",
  "channel": "collect",
  "upiId": "customer@paytm"
}
```

**UPI Collect Response:**
```json
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
```

**Card Payment:**
```bash
POST /api/payments/pay
x-api-key: your_api_key
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
```

**Net Banking:**
```bash
POST /api/payments/pay
x-api-key: your_api_key
Content-Type: application/json

{
  "paymentSessionId": "session_xyz...",
  "paymentMethod": "netbanking",
  "bankCode": "3003"
}
```

#### 3. Get Payment Methods
```bash
GET /api/payments/methods?orderId=ORD_xxx
x-api-key: your_api_key
```

**Response:**
```json
{
  "success": true,
  "available_payment_methods": {
    "upi": {
      "enabled": true,
      "channels": ["collect", "intent", "qrcode"]
    },
    "card": {
      "enabled": true,
      "types": ["credit", "debit"]
    },
    "netbanking": {
      "enabled": true,
      "banks": ["SBI", "HDFC", "ICICI", "Axis"]
    },
    "wallet": {
      "enabled": true,
      "providers": ["paytm", "phonepe", "freecharge"]
    }
  },
  "order_details": {
    "order_id": "ORD_xxx",
    "order_amount": 500,
    "order_currency": "INR"
  }
}
```

#### 4. Get Payment Status
```bash
GET /api/payments/status/ORD_xxx
x-api-key: your_api_key
```

**Response:**
```json
{
  "success": true,
  "transaction": {
    "transactionId": "TXN_xxx",
    "orderId": "ORD_xxx",
    "status": "paid",
    "amount": 500,
    "currency": "INR",
    "customerName": "Amit Kumar",
    "paidAt": "2023-09-01T10:05:00.000Z",
    "paymentMethod": "upi",
    "createdAt": "2023-09-01T10:00:00.000Z"
  },
  "cashfreeData": {
    "order_status": "PAID",
    "payment_status": "SUCCESS"
  }
}
```

#### 5. Get All Transactions
```bash
GET /api/payments/transactions?page=1&limit=20&status=paid&startDate=2023-09-01&endDate=2023-09-30
x-api-key: your_api_key
```

**Response:**
```json
{
  "success": true,
  "transactions": [
    {
      "transactionId": "TXN_xxx",
      "orderId": "ORD_xxx",
      "amount": 500,
      "status": "paid",
      "customerName": "Amit Kumar",
      "paidAt": "2023-09-01T10:05:00.000Z",
      "paymentMethod": "upi"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalCount": 100,
    "limit": 20
  },
  "summary": {
    "total_transactions": 100,
    "successful_transactions": 85,
    "failed_transactions": 10,
    "pending_transactions": 5,
    "total_revenue": "42500.00",
    "total_refunded": "2500.00",
    "net_revenue": "40000.00",
    "success_rate": "85.00"
  }
}
```

#### 6. Refund Payment
```bash
POST /api/payments/refund/ORD_xxx
x-api-key: your_api_key
Content-Type: application/json

{
  "refundAmount": 100,
  "refundNote": "Partial refund for defective item"
}
```

**Response:**
```json
{
  "success": true,
  "refund": {
    "refundId": "REFUND_1728123456789_ijkl9012",
    "orderId": "ORD_xxx",
    "refundAmount": 100,
    "totalRefunded": 100,
    "refundStatus": "refunded",
    "refundedAt": "2023-09-01T11:00:00.000Z"
  },
  "cashfreeData": {
    "refund_id": "REFUND_12345",
    "refund_status": "SUCCESS"
  },
  "message": "Refund processed successfully"
}
```

### Merchant Dashboard Endpoints

#### 1. Get My Payouts
```bash
GET /api/payments/merchant/payouts?page=1&limit=20&status=completed
x-auth-token: your_jwt_token
```

#### 2. Request Payout
```bash
POST /api/payments/merchant/payout/request
x-auth-token: your_jwt_token
Content-Type: application/json

{
  "amount": 10000,
  "transferMode": "upi",
  "beneficiaryDetails": {
    "upiId": "merchant@paytm"
  },
  "notes": "Monthly payout request"
}
```

**Bank Transfer:**
```bash
POST /api/payments/merchant/payout/request
x-auth-token: your_jwt_token
Content-Type: application/json

{
  "amount": 10000,
  "transferMode": "bank_transfer",
  "beneficiaryDetails": {
    "accountNumber": "1234567890",
    "ifscCode": "SBIN0001234",
    "accountHolderName": "John Doe",
    "bankName": "State Bank of India"
  },
  "notes": "Monthly payout request"
}
```

#### 3. Get My Balance
```bash
GET /api/payments/merchant/balance
x-auth-token: your_jwt_token
```

**Response:**
```json
{
  "success": true,
  "merchant": {
    "merchantId": "64f1a2b3c4d5e6f7a8b9c0d1",
    "merchantName": "John's Store",
    "merchantEmail": "john@example.com"
  },
  "balance": {
    "total_revenue": "50000.00",
    "total_refunded": "2500.00",
    "commission_deducted": "1250.00",
    "commission_rate": "2.5%",
    "net_revenue": "46250.00",
    "total_paid_out": "30000.00",
    "pending_payouts": "5000.00",
    "available_balance": "11250.00"
  },
  "transaction_summary": {
    "total_transactions": 100,
    "total_payouts_completed": 3,
    "pending_payout_requests": 1
  },
  "payout_eligibility": {
    "can_request_payout": true,
    "minimum_payout_amount": 100,
    "maximum_payout_amount": "11250.00"
  }
}
```

#### 4. Cancel Payout Request
```bash
POST /api/payments/merchant/payout/PAYOUT_xxx/cancel
x-auth-token: your_jwt_token
Content-Type: application/json

{
  "reason": "Need to update bank details"
}
```

### Super Admin Endpoints

#### 1. Get All Transactions
```bash
GET /api/payments/admin/transactions?page=1&limit=50&merchantId=64f1a2b3c4d5e6f7a8b9c0d1
x-auth-token: superadmin_jwt_token
```

#### 2. Create Payout
```bash
POST /api/payments/admin/payout
x-auth-token: superadmin_jwt_token
Content-Type: application/json

{
  "merchantId": "64f1a2b3c4d5e6f7a8b9c0d1",
  "amount": 10000,
  "transferMode": "upi",
  "beneficiaryDetails": {
    "upiId": "merchant@paytm"
  },
  "notes": "Approved payout",
  "commissionRate": 2.5
}
```

#### 3. Get All Payouts
```bash
GET /api/payments/admin/payouts?page=1&limit=20&status=completed
x-auth-token: superadmin_jwt_token
```

#### 4. Approve Payout Request
```bash
POST /api/payments/admin/payout/PAYOUT_xxx/approve
x-auth-token: superadmin_jwt_token
Content-Type: application/json

{
  "notes": "Approved after verification"
}
```

## Integration Flows

### 1. Complete Payment Flow

```javascript
// Step 1: Create payment session
const createPayment = async () => {
  const response = await fetch('http://localhost:5000/api/payments/create', {
    method: 'POST',
    headers: {
      'x-api-key': 'your_api_key',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      amount: 500,
      customerName: 'Amit Kumar',
      customerEmail: 'amit@example.com',
      customerPhone: '9876543210',
      description: 'Order #12345'
    })
  });
  
  const data = await response.json();
  return data.payment.paymentUrl; // Redirect customer to this URL
};

// Step 2: Check payment status
const checkStatus = async (orderId) => {
  const response = await fetch(`http://localhost:5000/api/payments/status/${orderId}`, {
    headers: {
      'x-api-key': 'your_api_key'
    }
  });
  
  const data = await response.json();
  return data.transaction.status; // 'paid', 'pending', 'failed', etc.
};
```

### 2. Custom Checkout Flow

```javascript
// Step 1: Create payment session
const session = await createPayment();
const paymentSessionId = session.payment.paymentSessionId;

// Step 2: Initiate UPI payment
const upiPayment = async () => {
  const response = await fetch('http://localhost:5000/api/payments/pay', {
    method: 'POST',
    headers: {
      'x-api-key': 'your_api_key',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      paymentSessionId: paymentSessionId,
      paymentMethod: 'upi',
      channel: 'collect',
      upiId: 'customer@paytm'
    })
  });
  
  const data = await response.json();
  
  if (data.instructions.action === 'poll_status') {
    // Poll for status every 5 seconds
    const pollStatus = setInterval(async () => {
      const status = await checkStatus(session.transaction.orderId);
      if (status === 'paid' || status === 'failed') {
        clearInterval(pollStatus);
        // Handle final status
      }
    }, 5000);
  }
};
```

### 3. Payout Flow

```javascript
// Step 1: Merchant requests payout
const requestPayout = async () => {
  const response = await fetch('http://localhost:5000/api/payments/merchant/payout/request', {
    method: 'POST',
    headers: {
      'x-auth-token': 'merchant_jwt_token',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      amount: 10000,
      transferMode: 'upi',
      beneficiaryDetails: {
        upiId: 'merchant@paytm'
      },
      notes: 'Monthly payout'
    })
  });
  
  return await response.json();
};

// Step 2: SuperAdmin approves payout
const approvePayout = async (payoutId) => {
  const response = await fetch(`http://localhost:5000/api/payments/admin/payout/${payoutId}/approve`, {
    method: 'POST',
    headers: {
      'x-auth-token': 'superadmin_jwt_token',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      notes: 'Approved after verification'
    })
  });
  
  return await response.json();
};
```

## Error Handling

### Common Error Responses

```json
{
  "success": false,
  "error": "Error message",
  "details": {
    "field": "Additional error details"
  }
}
```

### HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (invalid token/API key)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

### Error Examples

```json
// Invalid API Key
{
  "success": false,
  "error": "Invalid API key. Please check your credentials."
}

// Validation Error
{
  "success": false,
  "error": "amount, customerName, customerEmail, and customerPhone are required"
}

// Insufficient Balance
{
  "success": false,
  "error": "Insufficient balance for this payout request",
  "balance_info": {
    "available_balance": "5000.00",
    "requested_net_amount": "10000.00",
    "shortfall": "5000.00"
  }
}
```

## Testing

### 1. Test Cards (Sandbox)

```json
// Test Card Numbers
{
  "cardNumber": "4111111111111111",  // Visa
  "cardNumber": "5555555555554444",  // Mastercard
  "cardNumber": "4000000000000002",  // Declined
  "cardNumber": "4000000000000069",  // Expired
  "cardNumber": "4000000000000119"   // Processing Error
}
```

### 2. Test UPI IDs

```json
{
  "upiId": "success@upi",     // Successful payment
  "upiId": "failure@upi",     // Failed payment
  "upiId": "pending@upi"      // Pending payment
}
```

### 3. Test Bank Codes

```json
{
  "3003": "State Bank of India",
  "3032": "HDFC Bank",
  "3033": "ICICI Bank",
  "3034": "Axis Bank"
}
```

### 4. Webhook Testing

Set up webhook endpoints to receive payment notifications:

```javascript
// Webhook endpoint
app.post('/webhook', (req, res) => {
  const { orderId, status, amount } = req.body;
  
  if (status === 'PAID') {
    // Update order status in your database
    console.log(`Payment successful for order ${orderId}`);
  }
  
  res.status(200).send('OK');
});
```

## SDK Examples

### JavaScript/Node.js

```javascript
class CashKavachAPI {
  constructor(apiKey, baseURL = 'http://localhost:5000') {
    this.apiKey = apiKey;
    this.baseURL = baseURL;
  }
  
  async createPayment(paymentData) {
    const response = await fetch(`${this.baseURL}/api/payments/create`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(paymentData)
    });
    
    return await response.json();
  }
  
  async getPaymentStatus(orderId) {
    const response = await fetch(`${this.baseURL}/api/payments/status/${orderId}`, {
      headers: {
        'x-api-key': this.apiKey
      }
    });
    
    return await response.json();
  }
}

// Usage
const api = new CashKavachAPI('ninexgroup_your_api_key');
const payment = await api.createPayment({
  amount: 500,
  customerName: 'John Doe',
  customerEmail: 'john@example.com',
  customerPhone: '9876543210'
});
```

### Python

```python
import requests

class CashKavachAPI:
    def __init__(self, api_key, base_url='http://localhost:5000'):
        self.api_key = api_key
        self.base_url = base_url
        self.headers = {
            'x-api-key': api_key,
            'Content-Type': 'application/json'
        }
    
    def create_payment(self, payment_data):
        response = requests.post(
            f'{self.base_url}/api/payments/create',
            headers=self.headers,
            json=payment_data
        )
        return response.json()
    
    def get_payment_status(self, order_id):
        response = requests.get(
            f'{self.base_url}/api/payments/status/{order_id}',
            headers=self.headers
        )
        return response.json()

# Usage
api = CashKavachAPI('ninexgroup_your_api_key')
payment = api.create_payment({
    'amount': 500,
    'customerName': 'John Doe',
    'customerEmail': 'john@example.com',
    'customerPhone': '9876543210'
})
```

## Support

For technical support or questions:
- Email: support@cashkavach.com
- Documentation: [API Documentation](./api_documentation.md)
- Technical Overview: [Technical Overview](./TECHNICAL_OVERVIEW.txt)

---

**Note:** This guide covers all available endpoints. Always test in sandbox environment before going live. Keep your API keys secure and never expose them in client-side code.
