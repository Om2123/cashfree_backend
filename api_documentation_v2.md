# Ninex Group Payment Gateway API v2

This document provides details for the v2 API endpoints.

## Create Payment Gateway URL

This endpoint creates a new payment session and returns a unique URL to the Ninex Group payment page. You can redirect your customer to this URL to complete the payment.

- **URL:** `/api/payments/merchant/create-payment-url`
- **Method:** `POST`
- **Authentication:** `x-auth-api` header with the merchant's API key.

### Request Body

The request body should be a JSON object containing the following fields:

| Field           | Type     | Required | Description                                      |
|-----------------|----------|----------|--------------------------------------------------|
| `amount`        | `Number` | Yes      | The amount to be paid.                           |
| `customerName`  | `String` | Yes      | The name of the customer.                        |
| `customerEmail` | `String` | Yes      | The email address of the customer.               |
| `customerPhone` | `String` | Yes      | The phone number of the customer.                |
| `description`   | `String` | No       | A brief description of the payment.              |
| `orderId`       | `String` | No       | Your own unique order ID for the transaction.    |

**Example Request Body:**

```json
{
    "amount": 100,
    "customerName": "John Doe",
    "customerEmail": "john.doe@example.com",
    "customerPhone": "9876543210",
    "description": "Payment for services"
}
```

### Success Response

On a successful request, the API will return a JSON object with the following fields:

| Field         | Type     | Description                                                  |
|---------------|----------|--------------------------------------------------------------|
| `success`     | `Boolean`| Indicates if the request was successful.                     |
| `payment_url` | `String` | The URL to the payment page where the user should be redirected. |
| `order_id`    | `String` | The unique order ID for the transaction.                       |
| `amount`      | `Number` | The amount of the transaction.                               |
| `customer_email`| `String` | The email of the customer.                                   |

**Example Success Response:**

```json
{
    "success": true,
    "payment_url": "http://localhost:3000/frontend/?payment_session_id=YOUR_NEW_SESSION_ID",
    "order_id": "ORD_166523...",
    "amount": 100,
    "customer_email": "john.doe@example.com"
}
```
