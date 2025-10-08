const express = require('express');
const router = express.Router();
const apiKeyAuth = require('../middleware/apiKeyAuth');
const auth = require('../middleware/auth.js');
const superAdminAuth = require('../middleware/superAdminAuth');

const {
    getPaymentStatus,
    getTransactions,
} = require('../controllers/paymentController.js');

const {
    getAllTransactions,
    createPayout,
    getAllPayouts,
    approvePayoutRequest,
} = require('../controllers/superAdminController.js');

// ✅ MAKE SURE ALL THESE FUNCTIONS EXIST IN THE CONTROLLER
const {
    configureMerchantWebhook,
    getMerchantWebhookConfig,
    testMerchantWebhook,
    deleteMerchantWebhook
} = require('../controllers/merchantWebhookController.js');
const {
    getMyPayouts,
    requestPayout,
    getMyBalance,
    cancelPayoutRequest
} = require('../controllers/adminController.js');

// ============ MERCHANT APIs (API Key Auth) ============

router.get('/status/:orderId', apiKeyAuth, getPaymentStatus);
router.get('/transactions', apiKeyAuth, getTransactions);

// ============ MERCHANT WEBHOOK CONFIGURATION APIS ============
router.post('/merchant/webhook/configure', auth, configureMerchantWebhook);
router.get('/merchant/webhook/config', auth, getMerchantWebhookConfig);
router.post('/merchant/webhook/test', auth, testMerchantWebhook);
router.delete('/merchant/webhook', auth, deleteMerchantWebhook);



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
