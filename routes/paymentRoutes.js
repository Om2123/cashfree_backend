const express = require('express');
const router = express.Router();
const apiKeyAuth = require('../middleware/apiKeyAuth');
 const auth = require('../middleware/auth.js');
const superAdminAuth = require('../middleware/superAdminAuth');

const {
    createPayment,
    createPaymentLink,
    getPaymentStatus,
    getTransactions,
    refundPayment,
    initiatePaymentMethod, // NEW
    getPaymentMethods, // NEW
    createPaymentGatewayUrl
} = require('../controllers/paymentController.js');

const {
    getAllTransactions,
    createPayout,
    getAllPayouts,
    approvePayoutRequest,
} = require('../controllers/superAdminController.js');

const {
    getMyPayouts,
    requestPayout,
    getMyBalance,
    cancelPayoutRequest
} = require('../controllers/adminController.js');

// ============ MERCHANT APIs (API Key Auth) ============
router.post('/create', apiKeyAuth, createPayment);
router.post('/pay', apiKeyAuth, initiatePaymentMethod); // NEW - Order Pay API
router.get('/methods', apiKeyAuth, getPaymentMethods); // NEW - Get available payment methods
router.get('/status/:orderId', apiKeyAuth, getPaymentStatus);
router.post('/create-link', apiKeyAuth, createPaymentLink); // ✅ NEW - WORKING API
router.get('/transactions', apiKeyAuth, getTransactions);
router.post('/refund/:orderId', apiKeyAuth, refundPayment);
router.post('/merchant/create-payment-url', apiKeyAuth, createPaymentGatewayUrl);

// ============ ADMIN APIs (JWT Auth - Merchant Dashboard) ============
router.get('/merchant/payouts', auth, getMyPayouts);
router.post('/merchant/payout/request', auth, requestPayout);
router.get('/merchant/balance', auth, getMyBalance);
router.post('/merchant/payout/:payoutId/cancel', auth, cancelPayoutRequest);

// ============ SUPERADMIN APIs (JWT Auth - Admin Dashboard) ============
router.get('/admin/transactions', superAdminAuth, getAllTransactions);
router.post('/admin/payout', superAdminAuth, createPayout);
router.get('/admin/payouts', superAdminAuth, getAllPayouts);
router.post('/admin/payout/:payoutId/approve', superAdminAuth, approvePayoutRequest);

module.exports = router;
