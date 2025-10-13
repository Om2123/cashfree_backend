const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    // Basic Info
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        required: true,
    },
    
    // Role
    role: {
        type: String,
        enum: ['admin', 'superAdmin'],
        default: 'admin',
    },
    
    // Business Details
    businessName: {
        type: String,
        default: function() { return this.name; }
    },
    businessDetails: {
        displayName: String,
        description: String,
        website: String,
        supportEmail: String,
        supportPhone: String,
        address: String,
        gstin: String
    },
    
    // API Key
    apiKey: {
        type: String,
        unique: true,
        sparse: true,
    },
    apiKeyCreatedAt: {
        type: Date,
    },
    
    // ✅ WEBHOOK CONFIGURATION (MISSING IN YOUR CODE)
    webhookUrl: {
        type: String,
        default: null
    },
    webhookSecret: {
        type: String,
        default: null
    },
    webhookEnabled: {
        type: Boolean,
        default: false
    },
    webhookEvents: {
        type: [String],
        default: ['payment.success', 'payment.failed', 'payment.pending']
    },
    webhookRetries: {
        type: Number,
        default: 3
    },
    
    // ✅ CALLBACK URLs (MISSING IN YOUR CODE)
    successUrl: {
        type: String,
        default: null
    },
    failureUrl: {
        type: String,
        default: null
    },
    
    // ✅ COMMISSION & PAYOUT SETTINGS (OPTIONAL BUT RECOMMENDED)
    commissionRate: {
        type: Number,
        default: 2.5 // 2.5% commission
    },
    minimumPayoutAmount: {
        type: Number,
        default: 100 // Minimum ₹100
    },
    freePayoutsUnder500: {
        type: Number,
        default: 5
    },
    
    // ✅ STATUS & TIMESTAMPS
    status: {
        type: String,
        enum: ['active', 'inactive', 'suspended'],
        default: 'active'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    lastLoginAt: {
        type: Date
    }
});

// ✅ ADD INDEX FOR FASTER QUERIES
UserSchema.index({ email: 1 });
UserSchema.index({ apiKey: 1 });

// ✅ UPDATE updatedAt ON SAVE
UserSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('User', UserSchema);
