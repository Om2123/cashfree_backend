// routes/apiRoutes.js

const express = require('express');
const router = express.Router();
const { 
    createApiKey, 
    getApiKey,     
    deleteApiKey,
    regenerateApiKey 
} = require('../controllers/apiController');
const auth = require('../middleware/auth');

// API Key Management Routes
router.post('/create', auth, createApiKey);       // Create new API key
router.get('/get', auth, getApiKey);              // ✅ Get existing API key
router.delete('/delete', auth, deleteApiKey);     // Delete API key
router.post('/regenerate', auth, regenerateApiKey); // ✅ Regenerate API key

module.exports = router;
