const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async function(req, res, next) {
    try {
        // Get token from header
        const token = req.header('x-auth-token');
        
        if (!token) {
            return res.status(401).json({ 
                success: false,
                error: 'No token provided. Authorization denied.' 
            });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Get user from token
        const user = await User.findById(decoded.user.id).select('-password');
        
        if (!user) {
            return res.status(401).json({ 
                success: false,
                error: 'User not found. Invalid token.' 
            });
        }

        // Check if user is superAdmin
        if (user.role !== 'superAdmin') {
            return res.status(403).json({ 
                success: false,
                error: 'Access denied. SuperAdmin privileges required.' 
            });
        }

        // Attach user to request
        req.user = user;
        req.isSuperAdmin = true;
        
        console.log(`✅ SuperAdmin authenticated: ${user.name} (${user.email})`);
        
        next();
    } catch (error) {
        console.error('SuperAdmin Auth Error:', error.message);
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ 
                success: false,
                error: 'Invalid token.' 
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                success: false,
                error: 'Token expired. Please login again.' 
            });
        }
        
        res.status(500).json({ 
            success: false,
            error: 'Authentication service unavailable.' 
        });
    }
};
