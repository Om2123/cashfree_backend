const express = require('express');
const router = express.Router();
const auth = require('../middleware/superAdminAuth')
const { getDashboardStats } = require('../controllers/superAdminController');

// routes/superadminRoutes.js

router.get('/dashboard/stats', auth, getDashboardStats);

module.exports = router;
