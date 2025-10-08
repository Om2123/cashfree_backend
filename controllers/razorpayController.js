const Razorpay = require('razorpay');
const crypto = require('crypto');
const Transaction = require('../models/Transaction');

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// ============ CREATE RAZORPAY PAYMENT LINK ============
exports.createRazorpayPaymentLink = async (req, res) => {
    try {
        const { amount, customer_name, customer_email, customer_phone, description } = req.body;

        // Get merchant info from apiKeyAuth middleware
        const merchantId = req.merchantId;
        const merchantName = req.merchantName;

        console.log('📤 Razorpay Payment Link request from:', merchantName);

        // Validate input
        if (!amount || !customer_name || !customer_email || !customer_phone) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: amount, customer_name, customer_email, customer_phone'
            });
        }

        // Validate phone
        if (!/^[0-9]{10}$/.test(customer_phone)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid phone number. Must be 10 digits.'
            });
        }

        // Validate email
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid email address'
            });
        }

        // Validate amount
        if (parseFloat(amount) < 1) {
            return res.status(400).json({
                success: false,
                error: 'Amount must be at least ₹1'
            });
        }

        // Generate unique IDs
        const transactionId = `TXN_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const referenceId = `REF_${Date.now()}`;

        // Create Payment Link options
        const paymentLinkOptions = {
            amount: parseFloat(amount) * 100, // Amount in paise (smallest currency unit)
            currency: 'INR',
            description: description || `Payment for ${merchantName}`,
            customer: {
                name: customer_name,
                email: customer_email,
                contact: `+91${customer_phone}`
            },
            notify: {
                sms: true,
                email: true
            },
            reminder_enable: true,
            callback_url: `${process.env.FRONTEND_URL}/razorpay-success.html`,
            callback_method: 'get',
            reference_id: referenceId
        };

        console.log('📤 Creating Razorpay Payment Link...');

        // Create Payment Link
        const paymentLink = await razorpay.paymentLink.create(paymentLinkOptions);

        console.log('✅ Payment Link created:', paymentLink.id);

        // Save transaction to database
        const transaction = new Transaction({
            transactionId: transactionId,
            orderId: paymentLink.id,
            merchantId: merchantId,
            merchantName: merchantName,
            
            // Customer Details
            customerId: `CUST_${customer_phone}_${Date.now()}`,
            customerName: customer_name,
            customerEmail: customer_email,
            customerPhone: customer_phone,
            
            // Payment Details
            amount: parseFloat(amount),
            currency: 'INR',
            description: description || `Payment for ${merchantName}`,
            
            // Status
            status: 'created',
            
            // Razorpay Data
            paymentGateway: 'razorpay',
            razorpayPaymentLinkId: paymentLink.id,
            razorpayReferenceId: referenceId,
            
            // Timestamps
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await transaction.save();
        console.log('💾 Transaction saved:', transactionId);

        res.json({
            success: true,
            transaction_id: transactionId,
            payment_link_id: paymentLink.id,
            payment_url: paymentLink.short_url,
            order_amount: parseFloat(amount),
            order_currency: 'INR',
            merchant_id: merchantId.toString(),
            merchant_name: merchantName,
            reference_id: referenceId,
            expires_at: paymentLink.expire_by,
            message: 'Payment link created successfully. Share this URL with customer.'
        });

    } catch (error) {
        console.error('❌ Create Razorpay Payment Link Error:', error);
        res.status(500).json({
            success: false,
            error: error.error?.description || 'Failed to create payment link',
            details: error.error
        });
    }
};

// ============ RAZORPAY WEBHOOK HANDLER ============
exports.handleRazorpayWebhook = async (req, res) => {
    try {
        console.log('🔔 Razorpay Webhook received');
        
        // Verify webhook signature
        const webhookSignature = req.headers['x-razorpay-signature'];
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
        
        const expectedSignature = crypto
            .createHmac('sha256', webhookSecret)
            .update(JSON.stringify(req.body))
            .digest('hex');

        if (webhookSignature !== expectedSignature) {
            console.error('❌ Invalid webhook signature');
            return res.status(400).json({
                success: false,
                error: 'Invalid signature'
            });
        }

        console.log('✅ Webhook signature verified');

        const event = req.body.event;
        const payload = req.body.payload;

        console.log('📦 Event:', event);

        // Handle different webhook events
        switch (event) {
            case 'payment_link.paid':
                await handlePaymentLinkPaid(payload);
                break;

            case 'payment_link.cancelled':
                await handlePaymentLinkCancelled(payload);
                break;

            case 'payment_link.expired':
                await handlePaymentLinkExpired(payload);
                break;

            case 'payment.captured':
                await handlePaymentCaptured(payload);
                break;

            case 'payment.failed':
                await handlePaymentFailed(payload);
                break;

            default:
                console.log('⚠️ Unhandled webhook event:', event);
        }

        // Always return 200 OK
        res.status(200).json({
            success: true,
            message: 'Webhook processed'
        });

    } catch (error) {
        console.error('❌ Webhook Handler Error:', error.message);
        res.status(200).json({
            success: false,
            error: 'Webhook processing failed'
        });
    }
};

// ============ HELPER: Handle Payment Link Paid ============
async function handlePaymentLinkPaid(payload) {
    try {
        const paymentLink = payload.payment_link.entity;
        const payment = payload.payment.entity;

        console.log('✅ Payment Link Paid:', paymentLink.id);

        // Update transaction
        const transaction = await Transaction.findOne({ 
            razorpayPaymentLinkId: paymentLink.id 
        });

        if (transaction) {
            transaction.status = 'paid';
            transaction.paidAt = new Date(payment.created_at * 1000);
            transaction.paymentMethod = payment.method;
            transaction.razorpayPaymentId = payment.id;
            transaction.razorpayOrderId = payment.order_id;
            transaction.webhookData = payload;
            transaction.updatedAt = new Date();

            await transaction.save();
            console.log('💾 Transaction updated to PAID:', transaction.transactionId);
        }
    } catch (error) {
        console.error('❌ Handle Payment Link Paid Error:', error.message);
    }
}

// ============ HELPER: Handle Payment Link Cancelled ============
async function handlePaymentLinkCancelled(payload) {
    try {
        const paymentLink = payload.payment_link.entity;

        console.log('❌ Payment Link Cancelled:', paymentLink.id);

        const transaction = await Transaction.findOne({ 
            razorpayPaymentLinkId: paymentLink.id 
        });

        if (transaction) {
            transaction.status = 'cancelled';
            transaction.webhookData = payload;
            transaction.updatedAt = new Date();

            await transaction.save();
            console.log('💾 Transaction updated to CANCELLED');
        }
    } catch (error) {
        console.error('❌ Handle Payment Link Cancelled Error:', error.message);
    }
}

// ============ HELPER: Handle Payment Link Expired ============
async function handlePaymentLinkExpired(payload) {
    try {
        const paymentLink = payload.payment_link.entity;

        console.log('⏰ Payment Link Expired:', paymentLink.id);

        const transaction = await Transaction.findOne({ 
            razorpayPaymentLinkId: paymentLink.id 
        });

        if (transaction) {
            transaction.status = 'expired';
            transaction.webhookData = payload;
            transaction.updatedAt = new Date();

            await transaction.save();
            console.log('💾 Transaction updated to EXPIRED');
        }
    } catch (error) {
        console.error('❌ Handle Payment Link Expired Error:', error.message);
    }
}

// ============ HELPER: Handle Payment Captured ============
async function handlePaymentCaptured(payload) {
    try {
        const payment = payload.payment.entity;

        console.log('✅ Payment Captured:', payment.id);

        const transaction = await Transaction.findOne({ 
            razorpayPaymentId: payment.id 
        });

        if (transaction && transaction.status !== 'paid') {
            transaction.status = 'paid';
            transaction.paidAt = new Date(payment.created_at * 1000);
            transaction.paymentMethod = payment.method;
            transaction.webhookData = payload;
            transaction.updatedAt = new Date();

            await transaction.save();
            console.log('💾 Payment captured and transaction updated');
        }
    } catch (error) {
        console.error('❌ Handle Payment Captured Error:', error.message);
    }
}

// ============ HELPER: Handle Payment Failed ============
async function handlePaymentFailed(payload) {
    try {
        const payment = payload.payment.entity;

        console.log('❌ Payment Failed:', payment.id);

        const transaction = await Transaction.findOne({ 
            razorpayOrderId: payment.order_id 
        });

        if (transaction) {
            transaction.status = 'failed';
            transaction.failureReason = payment.error_description;
            transaction.webhookData = payload;
            transaction.updatedAt = new Date();

            await transaction.save();
            console.log('💾 Transaction updated to FAILED');
        }
    } catch (error) {
        console.error('❌ Handle Payment Failed Error:', error.message);
    }
}

// ============ VERIFY RAZORPAY PAYMENT ============
exports.verifyRazorpayPayment = async (req, res) => {
    try {
        const { payment_link_id } = req.body;

        if (!payment_link_id) {
            return res.status(400).json({
                success: false,
                error: 'payment_link_id is required'
            });
        }

        console.log('🔍 Verifying Razorpay payment:', payment_link_id);

        // Fetch payment link from Razorpay
        const paymentLink = await razorpay.paymentLink.fetch(payment_link_id);

        // Find transaction in database
        const transaction = await Transaction.findOne({ 
            razorpayPaymentLinkId: payment_link_id 
        });

        if (!transaction) {
            return res.status(404).json({
                success: false,
                error: 'Transaction not found'
            });
        }

        res.json({
            success: true,
            transaction_id: transaction.transactionId,
            payment_link_id: paymentLink.id,
            order_amount: transaction.amount,
            order_currency: transaction.currency,
            order_status: paymentLink.status.toUpperCase(),
            payment_time: transaction.paidAt,
            payment_method: transaction.paymentMethod,
            customer_details: {
                customer_id: transaction.customerId,
                customer_name: transaction.customerName,
                customer_email: transaction.customerEmail,
                customer_phone: transaction.customerPhone
            }
        });

    } catch (error) {
        console.error('❌ Verify Razorpay Payment Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to verify payment',
            details: error.error?.description
        });
    }
};

// module.exports = {
//     createRazorpayPaymentLink,
//     handleRazorpayWebhook,
//     verifyRazorpayPayment
// };
