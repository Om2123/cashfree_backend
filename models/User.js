
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    businessName: {  // ✅ ADD THIS
        type: String,
        default: function() { return this.name; } // Defaults to name
    },
     // Business Details
     businessDetails: {
        displayName: String,  // What customers see
        description: String,
        website: String,
        supportEmail: String,
        supportPhone: String,
        address: String,
        gstin: String
    },
    password: {
        type: String,
        required: true,
    },
    role: {
        type: String,
        enum: ['admin', 'superAdmin'],
        default: 'admin',
    },
    apiKey: {
        type: String,
        unique: true,
        sparse: true,
    },
    apiKeyCreatedAt: {  // ✅ ADD THIS
        type: Date,
    },
});

module.exports = mongoose.model('User', UserSchema);
