const express = require('express');
const router = express.Router();
const apiKeyAuth = require('../middleware/apiKeyAuth');

const {
    createRazorpayPaymentLink,
    handleRazorpayWebhook,
    verifyRazorpayPayment
} = require('../controllers/razorpayController.js');

// ============ MERCHANT APIs (API Key Auth) ============
router.post('/create-payment-link', apiKeyAuth, createRazorpayPaymentLink);
router.post('/verify-payment', verifyRazorpayPayment);


// ============ WEBHOOK (No Auth - Signature Verified) ============
router.post('/webhook', handleRazorpayWebhook);

module.exports = router;
