
const express = require('express');
const router = express.Router();
const { createApiKey, deleteApiKey } = require('../controllers/apiController');
const auth = require('../middleware/auth');

router.post('/create', auth, createApiKey);
router.delete('/delete', auth, deleteApiKey);

module.exports = router;
