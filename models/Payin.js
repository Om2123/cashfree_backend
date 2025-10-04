
const mongoose = require('mongoose');

const PayinSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    orderId: {
        type: String,
        required: true,
        unique: true,
    },
    amount: {
        type: Number,
        required: true,
    },
    status: {
        type: String,
        required: true,
    },
    paymentDetails: {
        type: Object,
    },
}, { timestamps: true });

module.exports = mongoose.model('Payin', PayinSchema);
