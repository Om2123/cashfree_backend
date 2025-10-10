const Razorpay = require('razorpay');
const crypto = require('crypto');
const Transaction = require('../models/Transaction');
const { sendMerchantWebhook } = require('./merchantWebhookController');
const User = require('../models/User');
const { calculateSettlementDate } = require('../utils/settlementCalculator');

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// ============ CREATE RAZORPAY PAYMENT LINK ============
exports.createRazorpayPaymentLink = async (req, res) => {
    try {
        const {
            amount,
            customer_name,
            customer_email,
            customer_phone,
            description,
            callback_url,      // ✅ NEW: Optional merchant callback URL
            success_url,       // ✅ NEW: Optional success redirect
            failure_url        // ✅ NEW: Optional failure redirect
        } = req.body;

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

        // ✅ Get merchant's configured URLs or use provided ones
        const merchant = await User.findById(merchantId);

        // Priority: API provided URL > Merchant configured URL > Default URL
        const finalCallbackUrl = callback_url ||
            merchant.successUrl ||
            `${process.env.FRONTEND_URL}/razorpay-success.html`;

        // Create Payment Link options
        const paymentLinkOptions = {
            amount: parseFloat(amount) * 100,
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
            callback_url: `${finalCallbackUrl}?transaction_id=${transactionId}&status=success`, // ✅ Merchant's URL
            callback_method: 'get',
            reference_id: referenceId
        };

        console.log('📤 Creating Razorpay Payment Link...');
        console.log('🔗 Callback URL:', finalCallbackUrl);

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

            // ✅ Store callback URLs
            callbackUrl: finalCallbackUrl,
            successUrl: success_url,
            failureUrl: failure_url,

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
            callback_url: finalCallbackUrl,
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

 

// ============ HANDLE PAYMENT LINK PAID ============

async function handlePaymentLinkPaid(payload) {
    try {
        const paymentLink = payload.payment_link.entity;
        const payment = payload.payment.entity;

        console.log('💰 Payment Link Paid:', paymentLink.id);

        const transaction = await Transaction.findOne({ 
            razorpayPaymentLinkId: paymentLink.id 
        }).populate('merchantId');

        if (transaction) {
            const paidAt = new Date(payment.created_at * 1000);
            
            // ✅ CALCULATE SETTLEMENT DATE (T+1, Skip Weekends)
            const expectedSettlement = calculateSettlementDate(paidAt);

            // Update transaction
            transaction.status = 'paid';
            transaction.paidAt = paidAt;
            transaction.paymentMethod = payment.method;
            transaction.razorpayPaymentId = payment.id;
            transaction.razorpayOrderId = payment.order_id;
            
            // Store acquirer data
            transaction.acquirerData = {
                utr: payment.acquirer_data?.utr || null,
                rrn: payment.acquirer_data?.rrn || null,
                bank_transaction_id: payment.acquirer_data?.bank_transaction_id || null,
                auth_code: payment.acquirer_data?.auth_code || null,
                card_last4: payment.card?.last4 || null,
                card_network: payment.card?.network || null,
                bank_name: payment.bank || null,
                vpa: payment.vpa || null
            };
            
            // ✅ Settlement tracking (T+1 with weekend skip)
            transaction.settlementStatus = 'unsettled';
            transaction.expectedSettlementDate = expectedSettlement;
            transaction.updatedAt = new Date();

            await transaction.save();
            
            // Calculate settlement details for logging
            const paidDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][paidAt.getDay()];
            const settlementDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][expectedSettlement.getDay()];
            const hoursDiff = (expectedSettlement - paidAt) / (1000 * 60 * 60);
            
            console.log(`💾 Transaction updated:`);
            console.log(`   - Paid: ${paidDay} ${paidAt.toISOString()}`);
            console.log(`   - Settlement: ${settlementDay} ${expectedSettlement.toISOString()}`);
            console.log(`   - Hours until settlement: ${hoursDiff.toFixed(1)}`);
            console.log(`   - UTR: ${transaction.acquirerData.utr || 'N/A'}`);

            // Build webhook payload
            const webhookPayload = {
                event: 'payment.success',
                timestamp: new Date().toISOString(),
                transaction_id: transaction.transactionId,
                order_id: transaction.orderId,
                merchant_id: transaction.merchantId._id.toString(),
                data: {
                    transaction_id: transaction.transactionId,
                    order_id: transaction.orderId,
                    
                    // IDs
                    payment_link_id: transaction.razorpayPaymentLinkId,
                    payment_id: transaction.razorpayPaymentId,
                    razorpay_payment_id: transaction.razorpayPaymentId,
                    razorpay_order_id: transaction.razorpayOrderId,
                    
                    // Bank references
                    utr: transaction.acquirerData.utr,
                    rrn: transaction.acquirerData.rrn,
                    bank_transaction_id: transaction.acquirerData.bank_transaction_id,
                    
                    // Payment info
                    amount: transaction.amount,
                    currency: transaction.currency,
                    status: 'paid',
                    payment_method: transaction.paymentMethod,
                    payment_gateway: 'razorpay',
                    paid_at: transaction.paidAt.toISOString(),
                    
                    // Settlement info
                    settlement_status: 'unsettled',
                    expected_settlement_date: transaction.expectedSettlementDate.toISOString(),
                    settlement_note: 'T+1 settlement (24 hours, excluding weekends)',
                    settlement_policy: 'Saturday and Sunday payments settle on Monday',
                    
                    // Customer
                    customer: {
                        customer_id: transaction.customerId,
                        name: transaction.customerName,
                        email: transaction.customerEmail,
                        phone: transaction.customerPhone
                    },
                    
                    // Merchant
                    merchant: {
                        merchant_id: transaction.merchantId._id.toString(),
                        merchant_name: transaction.merchantName
                    },
                    
                    description: transaction.description,
                    created_at: transaction.createdAt.toISOString(),
                    updated_at: transaction.updatedAt.toISOString(),
                    
                    // Payment details
                    card: transaction.acquirerData.card_last4 ? {
                        last4: transaction.acquirerData.card_last4,
                        network: transaction.acquirerData.card_network
                    } : null,
                    bank: transaction.acquirerData.bank_name,
                    vpa: transaction.acquirerData.vpa
                }
            };

            // Send webhook to merchant
            if (transaction.merchantId.webhookEnabled) {
                await sendMerchantWebhook(transaction.merchantId, webhookPayload);
            }
        }
    } catch (error) {
        console.error('❌ Handle Payment Link Paid Error:', error.message);
    }
}


// ============ HANDLE PAYMENT LINK CANCELLED ============
async function handlePaymentLinkCancelled(payload) {
    try {
        const paymentLink = payload.payment_link.entity;
        console.log('❌ Payment Link Cancelled:', paymentLink.id);

        const transaction = await Transaction.findOne({ 
            razorpayPaymentLinkId: paymentLink.id 
        }).populate('merchantId');

        if (transaction) {
            transaction.status = 'cancelled';
            transaction.updatedAt = new Date();
            await transaction.save();

            const webhookPayload = {
                event: 'payment.cancelled',
                timestamp: new Date().toISOString(),
                transaction_id: transaction.transactionId,
                order_id: transaction.orderId,
                merchant_id: transaction.merchantId._id.toString(),
                data: {
                    transaction_id: transaction.transactionId,
                    payment_link_id: transaction.razorpayPaymentLinkId,
                    amount: transaction.amount,
                    currency: transaction.currency,
                    status: 'cancelled',
                    payment_gateway: 'razorpay',
                    customer: {
                        name: transaction.customerName,
                        email: transaction.customerEmail,
                        phone: transaction.customerPhone
                    },
                    created_at: transaction.createdAt.toISOString(),
                    cancelled_at: transaction.updatedAt.toISOString()
                }
            };

            if (transaction.merchantId.webhookEnabled) {
                await sendMerchantWebhook(transaction.merchantId, webhookPayload);
            }
        }
    } catch (error) {
        console.error('❌ Handle Payment Link Cancelled Error:', error.message);
    }
}

// ============ HANDLE PAYMENT LINK EXPIRED ============
async function handlePaymentLinkExpired(payload) {
    try {
        const paymentLink = payload.payment_link.entity;
        console.log('⏰ Payment Link Expired:', paymentLink.id);

        const transaction = await Transaction.findOne({ 
            razorpayPaymentLinkId: paymentLink.id 
        }).populate('merchantId');

        if (transaction) {
            transaction.status = 'expired';
            transaction.updatedAt = new Date();
            await transaction.save();

            const webhookPayload = {
                event: 'payment.expired',
                timestamp: new Date().toISOString(),
                transaction_id: transaction.transactionId,
                order_id: transaction.orderId,
                merchant_id: transaction.merchantId._id.toString(),
                data: {
                    transaction_id: transaction.transactionId,
                    payment_link_id: transaction.razorpayPaymentLinkId,
                    amount: transaction.amount,
                    currency: transaction.currency,
                    status: 'expired',
                    payment_gateway: 'razorpay',
                    customer: {
                        name: transaction.customerName,
                        email: transaction.customerEmail,
                        phone: transaction.customerPhone
                    },
                    created_at: transaction.createdAt.toISOString(),
                    expired_at: transaction.updatedAt.toISOString()
                }
            };

            if (transaction.merchantId.webhookEnabled) {
                await sendMerchantWebhook(transaction.merchantId, webhookPayload);
            }
        }
    } catch (error) {
        console.error('❌ Handle Payment Link Expired Error:', error.message);
    }
}

// ============ HANDLE PAYMENT FAILED ============

async function handlePaymentFailed(payload) {
    try {
        const payment = payload.payment.entity;
        console.log('❌ Payment Failed:', payment.id);

        const transaction = await Transaction.findOne({ 
            razorpayOrderId: payment.order_id 
        }).populate('merchantId');

        if (transaction) {
            transaction.status = 'failed';
            transaction.razorpayPaymentId = payment.id;
            transaction.failureReason = payment.error_description || payment.error_reason;
            transaction.updatedAt = new Date();
            await transaction.save();

            const webhookPayload = {
                event: 'payment.failed',
                timestamp: new Date().toISOString(),
                transaction_id: transaction.transactionId,
                order_id: transaction.orderId,
                merchant_id: transaction.merchantId._id.toString(),
                data: {
                    transaction_id: transaction.transactionId,
                    razorpay_payment_id: transaction.razorpayPaymentId,
                    razorpay_order_id: transaction.razorpayOrderId,
                    amount: transaction.amount,
                    currency: transaction.currency,
                    status: 'failed',
                    failure_reason: transaction.failureReason,
                    error_code: payment.error_code,
                    error_description: payment.error_description,
                    payment_gateway: 'razorpay',
                    customer: {
                        name: transaction.customerName,
                        email: transaction.customerEmail,
                        phone: transaction.customerPhone
                    },
                    created_at: transaction.createdAt.toISOString(),
                    failed_at: transaction.updatedAt.toISOString()
                }
            };

            if (transaction.merchantId.webhookEnabled) {
                await sendMerchantWebhook(transaction.merchantId, webhookPayload);
            }
        }
    } catch (error) {
        console.error('❌ Handle Payment Failed Error:', error.message);
    }
}

// ============ HANDLE PAYMENT CAPTURED ============
async function handlePaymentCaptured(payload) {
    try {
        const payment = payload.payment.entity;
        console.log('✅ Payment Captured:', payment.id);
        // Similar to payment_link.paid handler
        // This is for direct payment capture (not payment links)
    } catch (error) {
        console.error('❌ Handle Payment Captured Error:', error.message);
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