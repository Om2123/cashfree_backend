// controllers/authController.js

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.signup = async (req, res) => {
    try {
        const {
            name,
            email,
            password,
            role = 'admin',
            businessName,
            businessLogo,
            businessDetails
        } = req.body;

        // Validation
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                error: 'name, email, and password are required'
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid email format'
            });
        }

        // Validate password strength
        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                error: 'Password must be at least 6 characters long'
            });
        }

        // Check if user already exists
        let user = await User.findOne({ email });

        if (user) {
            return res.status(400).json({
                success: false,
                error: 'User already exists with this email'
            });
        }

        // Validate role
        if (role && !['admin', 'superAdmin'].includes(role)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid role. Use "admin" or "superAdmin"'
            });
        }

        // Create new user
        user = new User({
            name,
            email,
            password,
            role,
            businessName: businessName || name, // Default to name if not provided
            businessLogo: businessLogo || null,
            businessDetails: {
                displayName: businessDetails?.displayName || businessName || name,
                description: businessDetails?.description || '',
                website: businessDetails?.website || '',
                supportEmail: businessDetails?.supportEmail || email,
                supportPhone: businessDetails?.supportPhone || '',
                address: businessDetails?.address || '',
                gstin: businessDetails?.gstin || ''
            }
        });

        // Hash password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);

        // Save user
        await user.save();

        console.log(`✅ New user registered: ${email} (${role})`);

        // Create JWT token
        const payload = {
            user: {
                id: user.id,
                role: user.role
            },
        };

        jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '7d' }, // Token valid for 7 days
            (err, token) => {
                if (err) {
                    console.error('JWT Sign Error:', err);
                    throw err;
                }

                res.status(201).json({
                    success: true,
                    token,
                    user: {
                        id: user._id,
                        name: user.name,
                        email: user.email,
                        role: user.role,
                        businessName: user.businessName,
                        businessLogo: user.businessLogo,
                        businessDetails: user.businessDetails,
                        createdAt: user.createdAt
                    },
                    message: 'User registered successfully'
                });
            }
        );
    } catch (err) {
        console.error('Signup Error:', err.message);
        res.status(500).json({
            success: false,
            error: 'Server error during registration'
        });
    }
};

// ============ LOGIN ============
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validation
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email and password are required'
            });
        }

        // Check if user exists
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(400).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        // Verify password
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(400).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        console.log(`✅ User logged in: ${email}`);

        // Create JWT token
        const payload = {
            user: {
                id: user.id,
                role: user.role
            },
        };

        jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '7d' },
            (err, token) => {
                if (err) throw err;

                res.json({
                    success: true,
                    token,
                    user: {
                        id: user._id,
                        name: user.name,
                        email: user.email,
                        role: user.role,
                        businessName: user.businessName,
                        businessLogo: user.businessLogo,
                        businessDetails: user.businessDetails
                    },
                    message: 'Login successful'
                });
            }
        );
    } catch (err) {
        console.error('Login Error:', err.message);
        res.status(500).json({
            success: false,
            error: 'Server error during login'
        });
    }
};

// ============ GET USER PROFILE ============
exports.getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        res.json({
            success: true,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                businessName: user.businessName,
                businessLogo: user.businessLogo,
                businessDetails: user.businessDetails,
                apiKey: user.apiKey,
                createdAt: user.createdAt
            }
        });
    } catch (err) {
        console.error('Get Profile Error:', err.message);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
};

// ============ UPDATE PROFILE ============
exports.updateProfile = async (req, res) => {
    try {
        const {
            name,
            businessName,
            businessLogo,
            businessDetails
        } = req.body;

        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Update fields
        if (name) user.name = name;
        if (businessName) user.businessName = businessName;
        if (businessLogo) user.businessLogo = businessLogo;

        if (businessDetails) {
            if (!user.businessDetails) {
                user.businessDetails = {};
            }
            
            if (businessDetails.displayName) user.businessDetails.displayName = businessDetails.displayName;
            if (businessDetails.description) user.businessDetails.description = businessDetails.description;
            if (businessDetails.website) user.businessDetails.website = businessDetails.website;
            if (businessDetails.supportEmail) user.businessDetails.supportEmail = businessDetails.supportEmail;
            if (businessDetails.supportPhone) user.businessDetails.supportPhone = businessDetails.supportPhone;
            if (businessDetails.address) user.businessDetails.address = businessDetails.address;
            if (businessDetails.gstin) user.businessDetails.gstin = businessDetails.gstin;
        }

        await user.save();

        console.log(`✅ Profile updated: ${user.email}`);

        res.json({
            success: true,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                businessName: user.businessName,
                businessLogo: user.businessLogo,
                businessDetails: user.businessDetails
            },
            message: 'Profile updated successfully'
        });

    } catch (err) {
        console.error('Update Profile Error:', err.message);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
};
