const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
    transactionId: {
        type: String,
        required: true,
        unique: true,
    },
    orderId: {
        type: String,
        required: true,
        unique: true,
    },
    merchantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    // Add these fields to your existing Transaction model
    razorpayPaymentLinkId: String,
    razorpayPaymentId: String,
    razorpayOrderId: String,
    razorpayReferenceId: String,
    paymentGateway: String, // 'razorpay' or 'cashfree'
    // Add to Transaction model
    callbackUrl: String,
    successUrl: String,
    failureUrl: String,

    merchantName: {
        type: String,
        required: true,
    },
    // Customer Details
    customerId: {
        type: String,
        required: true,
    },
    customerName: {
        type: String,
        required: true,
    },
    customerEmail: {
        type: String,
        required: true,
    },
    customerPhone: {
        type: String,
        required: true,
    },
    // Payment Details
    amount: {
        type: Number,
        required: true,
        min: 1,
    },
    currency: {
        type: String,
        default: 'INR',
    },
    description: {
        type: String,
        default: '',
    },
    // Status
    status: {
        type: String,
        enum: ['created', 'pending', 'paid', 'failed', 'cancelled', 'refunded', 'partial_refund'],
        default: 'created',
    },
    // Cashfree Data
    cashfreeOrderToken: String,
    cashfreePaymentId: String,
    cashfreeOrderId: String,
    paymentMethod: String,
    // Timestamps
    paidAt: Date,
    failureReason: String,
    webhookData: Object,
    // Refund Data
    refundAmount: {
        type: Number,
        default: 0,
    },
    refundReason: String,
    refundedAt: Date,
    settlementStatus: {
        type: String,
        enum: ['unsettled', 'settled', 'on_hold'],
        default: 'unsettled'
    },
    settlementDate: {
        type: Date,
        default: null
    },
    expectedSettlementDate: {
        type: Date,
        default: function () {
            // T+1 settlement: Next day at 3 PM
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(15, 0, 0, 0); // 3 PM
            return tomorrow;
        }
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
});

TransactionSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

TransactionSchema.index({ merchantId: 1, createdAt: -1 });
TransactionSchema.index({ orderId: 1 });
TransactionSchema.index({ transactionId: 1 });
TransactionSchema.index({ status: 1 });

module.exports = mongoose.model('Transaction', TransactionSchema);
