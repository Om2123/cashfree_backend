const User = require('../models/User');

module.exports = async function(req, res, next) {
    try {
        const apiKey = req.header('x-api-key');
        
        if (!apiKey) {
            return res.status(401).json({ 
                success: false,
                error: 'API key is required. Please provide x-api-key header.' 
            });
        }

        // Find user by API key
        const user = await User.findOne({ apiKey });
        
        if (!user) {
            return res.status(401).json({ 
                success: false,
                error: 'Invalid API key. Please check your credentials.' 
            });
        }

        // Attach user info to request - FIXED
        req.user = user;
        req.merchantId = user._id;  // MongoDB ObjectId
        req.merchantName = user.name;
        
        console.log('✅ API Key Auth Success:', {
            merchantId: user._id.toString(),
            merchantName: user.name
        });
        
        next();
    } catch (error) {
        console.error('API Key Auth Error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Authentication service unavailable' 
        });
    }
};
