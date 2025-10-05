// controllers/apiController.js

const crypto = require('crypto');
const User = require('../models/User');

// ============ CREATE API KEY ============
exports.createApiKey = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'User not found' 
            });
        }

        // Check if API key already exists
        if (user.apiKey) {
            return res.status(400).json({ 
                success: false,
                error: 'API key already exists. Please delete the existing key to create a new one.',
                existingKey: user.apiKey
            });
        }

        // Generate unique API key
        const apiKey = `cashcavash_${crypto.randomBytes(24).toString('hex')}`;
        user.apiKey = apiKey;
        user.apiKeyCreatedAt = new Date();

        await user.save();

        console.log(`✅ API key created for user: ${user.email}`);

        res.json({ 
            success: true,
            apiKey: apiKey,
            createdAt: user.apiKeyCreatedAt,
            message: 'API key created successfully. Keep it secure!'
        });
    } catch (err) {
        console.error('Create API Key Error:', err.message);
        res.status(500).json({
            success: false,
            error: 'Server error while creating API key'
        });
    }
};

// ============ GET API KEY ============
exports.getApiKey = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');

        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'User not found' 
            });
        }

        // Check if API key exists
        if (!user.apiKey) {
            return res.status(404).json({ 
                success: false,
                error: 'No API key found. Please create one first.',
                hasApiKey: false
            });
        }

        console.log(`✅ API key retrieved for user: ${user.email}`);

        res.json({ 
            success: true,
            apiKey: user.apiKey,
            createdAt: user.apiKeyCreatedAt || null,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                businessName: user.businessName
            },
            hasApiKey: true,
            message: 'API key retrieved successfully'
        });
    } catch (err) {
        console.error('Get API Key Error:', err.message);
        res.status(500).json({
            success: false,
            error: 'Server error while retrieving API key'
        });
    }
};

// ============ DELETE API KEY ============
exports.deleteApiKey = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'User not found' 
            });
        }

        if (!user.apiKey) {
            return res.status(400).json({ 
                success: false,
                error: 'No API key exists to delete' 
            });
        }

        // Store old key for logging
        const oldKey = user.apiKey;
        
        user.apiKey = null;
        user.apiKeyCreatedAt = null;

        await user.save();

        console.log(`✅ API key deleted for user: ${user.email}`);

        res.json({ 
            success: true,
            message: 'API key deleted successfully',
            deletedAt: new Date()
        });
    } catch (err) {
        console.error('Delete API Key Error:', err.message);
        res.status(500).json({
            success: false,
            error: 'Server error while deleting API key'
        });
    }
};

// ============ REGENERATE API KEY ============
exports.regenerateApiKey = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'User not found' 
            });
        }

        // Store old key for reference
        const oldKey = user.apiKey;

        // Generate new API key
        const newApiKey = `cashcavash_${crypto.randomBytes(24).toString('hex')}`;
        user.apiKey = newApiKey;
        user.apiKeyCreatedAt = new Date();

        await user.save();

        console.log(`✅ API key regenerated for user: ${user.email}`);

        res.json({ 
            success: true,
            apiKey: newApiKey,
            createdAt: user.apiKeyCreatedAt,
            message: 'API key regenerated successfully. Update your integration with the new key.'
        });
    } catch (err) {
        console.error('Regenerate API Key Error:', err.message);
        res.status(500).json({
            success: false,
            error: 'Server error while regenerating API key'
        });
    }
};
