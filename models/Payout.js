const mongoose = require('mongoose');

const PayoutSchema = new mongoose.Schema({
    payoutId: {
        type: String,
        required: true,
        unique: true,
    },
    merchantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    merchantName: {
        type: String,
        required: true,
    },
    // Payout Details
    amount: {
        type: Number,
        required: true,
        min: 1,
    },
    commission: {
        type: Number,
        default: 0,
    },
    commissionRate: {
        type: Number,
        default: 2.5,
    },
    netAmount: {
        type: Number,
        required: true,
    },
    currency: {
        type: String,
        default: 'INR',
    },
    // Transfer Details
    transferMode: {
        type: String,
        enum: ['bank_transfer', 'upi', 'wallet'],
        required: true,
    },
    beneficiaryDetails: {
        accountNumber: String,
        ifscCode: String,
        accountHolderName: String,
        bankName: String,
        upiId: String,
        walletPhone: String,
    },
    // Status
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
        default: 'pending',
    },
    // Cashfree Transfer Details
    cashfreeTransferId: String,
    cashfreeReferenceId: String,
    cashfreeUtr: String,
    // Transaction References
    relatedTransactions: [{
        type: String, // Transaction IDs
    }],
    // Processing Details
    processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    processedByName: String,
    processedAt: Date,
    failureReason: String,
    notes: String,
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
});

PayoutSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

PayoutSchema.index({ merchantId: 1, createdAt: -1 });
PayoutSchema.index({ status: 1 });
PayoutSchema.index({ payoutId: 1 });

module.exports = mongoose.model('Payout', PayoutSchema);
