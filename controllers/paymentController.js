const crypto = require('crypto');
const Transaction = require('../models/Transaction');
const axios = require('axios');

// Cashfree configuration
const cashfreePG = axios.create({
    baseURL: process.env.CASHFREE_BASE_URL,
    headers: {
        'x-api-version': '2023-08-01',
        'x-client-id': process.env.CASHFREE_APP_ID,
        'x-client-secret': process.env.CASHFREE_SECRET_KEY,
        'Content-Type': 'application/json'
    }
});

// ✅ HELPER FUNCTION: Clean corrupted session ID
function cleanSessionId(sessionId) {
    if (!sessionId) return null;
    
    // Remove "paymentpayment" suffix if present
    if (sessionId.endsWith('paymentpayment')) {
        console.log('⚠️ Cleaning corrupted session ID');
        console.log('Before:', sessionId);
        const cleaned = sessionId.slice(0, -14); // Remove last 14 chars ("paymentpayment")
        console.log('After:', cleaned);
        return cleaned;
    }
    
    // Also check for just "payment" at the end
    if (sessionId.endsWith('payment') && !sessionId.endsWith('paymentpayment')) {
        console.log('⚠️ Cleaning session ID with "payment" suffix');
        const cleaned = sessionId.slice(0, -7); // Remove last 7 chars ("payment")
        return cleaned;
    }
    
    return sessionId;
}
// ============ CREATE PAYMENT LINK (WORKING ALTERNATIVE) ============
exports.createPaymentLink = async (req, res) => {
    try {
        const {
            orderId,
            amount,
            currency = 'INR',
            customerName,
            customerEmail,
            customerPhone,
            description
        } = req.body;

        // Validation
        if (!amount || !customerName || !customerEmail || !customerPhone) {
            return res.status(400).json({
                success: false,
                error: 'amount, customerName, customerEmail, and customerPhone are required'
            });
        }

        if (!req.merchantId || !req.merchantName) {
            return res.status(401).json({
                success: false,
                error: 'Authentication failed. Invalid API key.'
            });
        }

        const paymentAmount = parseFloat(amount);
        if (paymentAmount < 1 || paymentAmount > 500000) {
            return res.status(400).json({
                success: false,
                error: 'Amount must be between ₹1 and ₹5,00,000'
            });
        }

        const cleanPhone = customerPhone.replace(/[\s+\-()]/g, '');
        if (cleanPhone.length !== 10 || !/^\d{10}$/.test(cleanPhone)) {
            return res.status(400).json({
                success: false,
                error: 'Phone number must be 10 digits'
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(customerEmail)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid email format'
            });
        }

        // Generate IDs
        const finalOrderId = orderId || `ORD_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const transactionId = `TXN_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const linkId = `LINK_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

        // Create Payment Link (This API works without corruption!)
        const linkData = {
            link_id: linkId,
            link_amount: paymentAmount,
            link_currency: currency,
            link_purpose: description || `Payment to ${req.merchantName}`,
            customer_details: {
                customer_name: customerName,
                customer_email: customerEmail,
                customer_phone: cleanPhone
            },
            link_notify: {
                send_sms: false,
                send_email: false
            },
            link_meta: {
                notify_url: `https://payments.ninex-group.com/`,
                return_url: `https://payments.ninex-group.com/`
            },
            link_notes: {
                merchant_id: req.merchantId.toString(),
                merchant_name: req.merchantName,
                transaction_id: transactionId,
                order_id: finalOrderId,
                platform: 'cashcavash'
            }
        };

        console.log(`📤 Creating payment link: ${linkId}`);

        const response = await cashfreePG.post('/links', linkData);

        console.log('✅ Payment link created:', response.data.link_url);

        // Save transaction
        const transaction = new Transaction({
            transactionId,
            orderId: finalOrderId,
            merchantId: req.merchantId,
            merchantName: req.merchantName,
            customerId: `CUST_${cleanPhone}`,
            customerName,
            customerEmail,
            customerPhone: cleanPhone,
            amount: paymentAmount,
            currency,
            description: description || '',
            status: 'created',
            cashfreeOrderId: response.data.cf_link_id || linkId,
            cashfreeOrderToken: response.data.link_id
        });

        await transaction.save();

        console.log(`✅ Transaction saved: ${transactionId}`);

        res.json({
            success: true,
            transaction: {
                transactionId,
                orderId: finalOrderId,
                linkId: response.data.link_id,
                amount: paymentAmount,
                currency,
                status: 'created',
                customerName,
                merchantName: req.merchantName,
                createdAt: transaction.createdAt
            },
            payment: {
                paymentUrl: response.data.link_url, // ✅ This URL WORKS!
                linkId: response.data.link_id,
                shortUrl: response.data.short_url,
                qrCode: response.data.link_qrcode,
                expiresAt: response.data.link_expiry_time
            },
            message: 'Payment link created successfully. Share paymentUrl with customer.'
        });

    } catch (error) {
        console.error('❌ Create Payment Link Error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.message || error.message || 'Failed to create payment link',
            details: error.response?.data || null
        });
    }
};

// ============ CREATE PAYMENT ============
exports.createPayment = async (req, res) => {
    try {
        const {
            orderId,
            amount,
            currency = 'INR',
            customerName,
            customerEmail,
            customerPhone,
            description,
            returnUrl,
            notifyUrl
        } = req.body;

        // Validation
        if (!amount || !customerName || !customerEmail || !customerPhone) {
            return res.status(400).json({
                success: false,
                error: 'amount, customerName, customerEmail, and customerPhone are required'
            });
        }

        if (!req.merchantId || !req.merchantName) {
            return res.status(401).json({
                success: false,
                error: 'Authentication failed. Invalid API key.'
            });
        }

        // Validate amount
        const paymentAmount = parseFloat(amount);
        if (paymentAmount < 1 || paymentAmount > 500000) {
            return res.status(400).json({
                success: false,
                error: 'Amount must be between ₹1 and ₹5,00,000'
            });
        }

        // Clean phone number
        const cleanPhone = customerPhone.replace(/[\s+\-()]/g, '');
        if (cleanPhone.length !== 10 || !/^\d{10}$/.test(cleanPhone)) {
            return res.status(400).json({
                success: false,
                error: 'Phone number must be 10 digits (Indian format)'
            });
        }

        // Validate email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(customerEmail)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid email format'
            });
        }

        // Generate IDs
        const finalOrderId = orderId || `ORD_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const transactionId = `TXN_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const customerId = `CUST_${cleanPhone}_${Date.now()}`;

        // Create Cashfree Order
        const cashfreeOrder = {
            order_id: finalOrderId,
            order_amount: paymentAmount,
            order_currency: currency,
            customer_details: {
                customer_id: customerId,
                customer_name: customerName,
                customer_email: customerEmail,
                customer_phone: cleanPhone
            },
            order_meta: {
                return_url: returnUrl || `${req.protocol}://${req.get('host')}/success`,
                notify_url: notifyUrl || `${req.protocol}://${req.get('host')}/webhook`
            },
            order_note: description || `Order for ${req.merchantName}`,
            order_tags: {
                merchant_id: req.merchantId.toString(),
                merchant_name: req.merchantName,
                transaction_id: transactionId,
                platform: 'cashcavash'
            }
        };

        console.log(`📤 Creating Cashfree order: ${finalOrderId}`);
        
        const response = await cashfreePG.post('/orders', cashfreeOrder);
        
        // ✅ Get RAW session ID and clean it
        let paymentSessionId = response.data.payment_session_id;
        const cfOrderId = response.data.cf_order_id;
        
        console.log('📥 RAW session ID from Cashfree:', paymentSessionId);
        console.log('📏 Length:', paymentSessionId?.length);
        console.log('📍 Last 20 chars:', paymentSessionId?.slice(-20));
        
        // ✅ CLEAN THE SESSION ID
        paymentSessionId = cleanSessionId(paymentSessionId);
        
        if (!paymentSessionId) {
            console.error('❌ No payment_session_id after cleaning');
            throw new Error('Invalid payment session ID received from Cashfree');
        }

        console.log('✅ Cleaned session ID (first 50):', paymentSessionId.substring(0, 50));
        console.log('✅ Cleaned session ID length:', paymentSessionId.length);
        console.log('✅ Cashfree Order ID:', cfOrderId);

        // Save transaction with CLEANED session ID
        const transaction = new Transaction({
            transactionId,
            orderId: finalOrderId,
            merchantId: req.merchantId,
            merchantName: req.merchantName,
            customerId,
            customerName,
            customerEmail,
            customerPhone: cleanPhone,
            amount: paymentAmount,
            currency,
            description: description || '',
            status: 'created',
            cashfreeOrderToken: paymentSessionId, // ✅ Cleaned value
            cashfreeOrderId: cfOrderId,
            cashfreePaymentId: paymentSessionId  // ✅ Cleaned value
        });

        await transaction.save();

        console.log(`✅ Transaction saved: ${transactionId}`);

        // Build payment URL with CLEANED session ID
        const paymentUrl = `https://payments.cashfree.com/order/#/checkout?order_token=${paymentSessionId}`;

        res.json({
            success: true,
            transaction: {
                transactionId,
                orderId: finalOrderId,
                cfOrderId,
                amount: paymentAmount,
                currency,
                status: 'created',
                customerName,
                customerEmail,
                customerPhone: cleanPhone,
                merchantName: req.merchantName,
                createdAt: transaction.createdAt
            },
            payment: {
                paymentUrl,
                paymentSessionId: paymentSessionId, // ✅ Return cleaned value
                expiresAt: response.data.order_expiry_time
            },
            message: 'Payment created successfully. Redirect customer to paymentUrl.'
        });

    } catch (error) {
        console.error('❌ Create Payment Error:', error.response?.data || error.message);
        
        const errorMessage = error.response?.data?.message || 
                           error.response?.data?.error?.message ||
                           error.message ||
                           'Failed to create payment';

        res.status(error.response?.status || 500).json({
            success: false,
            error: errorMessage,
            details: error.response?.data || null
        });
    }
};

// ============ INITIATE PAYMENT METHOD ============
exports.initiatePaymentMethod = async (req, res) => {
    try {
        const {
            paymentSessionId,
            paymentMethod,
            channel,
            saveInstrument = false,
            offerId,
            upiId,
            cardDetails,
            bankCode,
            walletProvider,
            upiApp
        } = req.body;

        console.log(`🔄 Initiating ${paymentMethod} payment`);
        console.log('📥 Received paymentSessionId:', paymentSessionId);
        console.log('📏 Length:', paymentSessionId?.length);
        console.log('📍 Last 20 chars:', paymentSessionId?.slice(-20));

        // Validation
        if (!paymentSessionId) {
            return res.status(400).json({
                success: false,
                error: 'paymentSessionId is required'
            });
        }

        // ✅ CLEAN the session ID before using
        const cleanedSessionId = cleanSessionId(paymentSessionId);
        
        if (!cleanedSessionId) {
            return res.status(400).json({
                success: false,
                error: 'Invalid payment session ID format'
            });
        }

        console.log('✅ Using cleaned session ID:', cleanedSessionId.substring(0, 50));

        if (!paymentMethod) {
            return res.status(400).json({
                success: false,
                error: 'paymentMethod is required (upi, card, netbanking, app)'
            });
        }

        // Build payment payload
        const paymentPayload = {
            payment_session_id: cleanedSessionId, // ✅ Use CLEANED ID
            save_instrument: saveInstrument
        };

        if (offerId) {
            paymentPayload.offer_id = offerId;
        }

        // ====== UPI PAYMENT ======
        if (paymentMethod === 'upi') {
            if (!channel) {
                return res.status(400).json({
                    success: false,
                    error: 'channel is required for UPI (collect, intent, qrcode)'
                });
            }

            paymentPayload.payment_method = {
                upi: {}
            };

            if (channel === 'collect') {
                if (!upiId) {
                    return res.status(400).json({
                        success: false,
                        error: 'upiId is required for UPI collect'
                    });
                }

                // Validate UPI ID format
                const upiRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z]+$/;
                if (!upiRegex.test(upiId)) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid UPI ID format. Example: username@paytm'
                    });
                }

                paymentPayload.payment_method.upi.channel = 'collect';
                paymentPayload.payment_method.upi.upi_id = upiId;

            } else if (channel === 'intent') {
                paymentPayload.payment_method.upi.channel = 'intent';
                if (upiApp) {
                    paymentPayload.payment_method.upi.upi_id = upiApp;
                }

            } else if (channel === 'qrcode') {
                paymentPayload.payment_method.upi.channel = 'qrcode';

            } else {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid UPI channel. Use: collect, intent, or qrcode'
                });
            }
        }

        // ====== CARD PAYMENT ======
        else if (paymentMethod === 'card') {
            if (!cardDetails || !cardDetails.cardNumber || !cardDetails.cardHolderName || 
                !cardDetails.cardExpiryMM || !cardDetails.cardExpiryYY || !cardDetails.cardCvv) {
                return res.status(400).json({
                    success: false,
                    error: 'Card details required: cardNumber, cardHolderName, cardExpiryMM, cardExpiryYY, cardCvv'
                });
            }

            paymentPayload.payment_method = {
                card: {
                    channel: 'link',
                    card_number: cardDetails.cardNumber,
                    card_holder_name: cardDetails.cardHolderName,
                    card_expiry_mm: cardDetails.cardExpiryMM,
                    card_expiry_yy: cardDetails.cardExpiryYY,
                    card_cvv: cardDetails.cardCvv
                }
            };
        }

        // ====== NETBANKING PAYMENT ======
        else if (paymentMethod === 'netbanking') {
            if (!bankCode) {
                return res.status(400).json({
                    success: false,
                    error: 'bankCode is required for netbanking'
                });
            }

            paymentPayload.payment_method = {
                netbanking: {
                    channel: 'link',
                    netbanking_bank_code: parseInt(bankCode)
                }
            };
        }

        // ====== WALLET PAYMENT ======
        else if (paymentMethod === 'app' || paymentMethod === 'wallet') {
            if (!walletProvider) {
                return res.status(400).json({
                    success: false,
                    error: 'walletProvider is required'
                });
            }

            paymentPayload.payment_method = {
                app: {
                    channel: 'link',
                    provider: walletProvider
                }
            };
        }

        else {
            return res.status(400).json({
                success: false,
                error: 'Invalid payment method. Supported: upi, card, netbanking, app'
            });
        }

        console.log('📤 Cashfree Order Pay payload:', JSON.stringify(paymentPayload, null, 2));

        // Call Cashfree Order Pay API
        const response = await cashfreePG.post('/orders/pay', paymentPayload);

        console.log('✅ Cashfree Order Pay response received');

        // Find and update transaction
        const transaction = await Transaction.findOne({
            $or: [
                { cashfreeOrderToken: cleanedSessionId },
                { cashfreePaymentId: cleanedSessionId }
            ]
        });

        if (transaction) {
            transaction.paymentMethod = paymentMethod;
            transaction.status = 'pending';
            transaction.updatedAt = new Date();
            await transaction.save();
            console.log(`✅ Updated transaction: ${transaction.transactionId}`);
        } else {
            console.log('⚠️ Transaction not found for session ID');
        }

        res.json({
            success: true,
            payment: {
                cf_payment_id: response.data.cf_payment_id,
                payment_method: response.data.payment_method,
                channel: response.data.channel,
                action: response.data.action,
                payment_amount: response.data.payment_amount,
                data: response.data.data
            },
            transaction: transaction ? {
                transactionId: transaction.transactionId,
                orderId: transaction.orderId,
                status: transaction.status
            } : null,
            message: 'Payment initiated successfully'
        });

    } catch (error) {
        console.error('❌ Initiate Payment Error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.message || error.message || 'Failed to initiate payment',
            details: error.response?.data || null
        });
    }
};

// ============ GET PAYMENT STATUS ============
exports.getPaymentStatus = async (req, res) => {
    try {
        const { orderId } = req.params;

        const transaction = await Transaction.findOne({
            orderId,
            merchantId: req.merchantId
        });

        if (!transaction) {
            return res.status(404).json({
                success: false,
                error: 'Transaction not found'
            });
        }

        try {
            const cashfreeResponse = await cashfreePG.get(`/orders/${orderId}`);
            
            const cashfreeStatus = cashfreeResponse.data.order_status;
            let mappedStatus = 'unknown';

            if (cashfreeStatus === 'PAID') mappedStatus = 'paid';
            else if (cashfreeStatus === 'ACTIVE') mappedStatus = 'pending';
            else if (cashfreeStatus === 'EXPIRED') mappedStatus = 'failed';
            else if (cashfreeStatus === 'CANCELLED') mappedStatus = 'cancelled';

            if (transaction.status !== mappedStatus) {
                transaction.status = mappedStatus;
                transaction.cashfreePaymentId = cashfreeResponse.data.cf_order_id;
                
                if (mappedStatus === 'paid') {
                    transaction.paidAt = new Date();
                    transaction.paymentMethod = cashfreeResponse.data.payment_method || null;
                }
                
                await transaction.save();
            }

            res.json({
                success: true,
                transaction: {
                    transactionId: transaction.transactionId,
                    orderId: transaction.orderId,
                    status: transaction.status,
                    amount: transaction.amount,
                    currency: transaction.currency,
                    customerName: transaction.customerName,
                    paidAt: transaction.paidAt,
                    paymentMethod: transaction.paymentMethod,
                    createdAt: transaction.createdAt
                },
                cashfreeData: cashfreeResponse.data
            });

        } catch (apiError) {
            res.json({
                success: true,
                transaction: {
                    transactionId: transaction.transactionId,
                    orderId: transaction.orderId,
                    status: transaction.status,
                    amount: transaction.amount,
                    createdAt: transaction.createdAt
                },
                note: 'Retrieved from local database'
            });
        }

    } catch (error) {
        console.error('Get Payment Status Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get payment status'
        });
    }
};

// ============ GET ALL TRANSACTIONS ============
exports.getTransactions = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            status,
            startDate,
            endDate,
            search
        } = req.query;

        // Build query
        let query = { merchantId: req.merchantId };

        if (status) {
            query.status = status;
        }

        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        if (search) {
            query.$or = [
                { orderId: { $regex: search, $options: 'i' } },
                { transactionId: { $regex: search, $options: 'i' } },
                { customerName: { $regex: search, $options: 'i' } },
                { customerEmail: { $regex: search, $options: 'i' } },
                { customerPhone: { $regex: search, $options: 'i' } }
            ];
        }

        // Get total count
        const totalCount = await Transaction.countDocuments(query);

        // Get transactions
        const transactions = await Transaction.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .select('-webhookData -cashfreeOrderToken')
            .lean();

        // Calculate summary
        const allTransactions = await Transaction.find({ merchantId: req.merchantId });
        const successfulTransactions = allTransactions.filter(t => t.status === 'paid');
        const totalRevenue = successfulTransactions.reduce((sum, t) => sum + t.amount, 0);
        const totalRefunded = allTransactions.reduce((sum, t) => sum + t.refundAmount, 0);

        res.json({
            success: true,
            transactions,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalCount / parseInt(limit)),
                totalCount,
                limit: parseInt(limit)
            },
            summary: {
                total_transactions: allTransactions.length,
                successful_transactions: successfulTransactions.length,
                failed_transactions: allTransactions.filter(t => t.status === 'failed').length,
                pending_transactions: allTransactions.filter(t => t.status === 'pending' || t.status === 'created').length,
                total_revenue: totalRevenue.toFixed(2),
                total_refunded: totalRefunded.toFixed(2),
                net_revenue: (totalRevenue - totalRefunded).toFixed(2),
                success_rate: allTransactions.length > 0 ? 
                    ((successfulTransactions.length / allTransactions.length) * 100).toFixed(2) : 0
            }
        });

    } catch (error) {
        console.error('Get Transactions Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch transactions'
        });
    }
};

// ============ REFUND PAYMENT ============
exports.refundPayment = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { refundAmount, refundNote } = req.body;

        // Find transaction
        const transaction = await Transaction.findOne({
            orderId,
            merchantId: req.merchantId
        });

        if (!transaction) {
            return res.status(404).json({
                success: false,
                error: 'Transaction not found'
            });
        }
        if (!refundAmount || !refundNote) {
            return res.status(404).json({
                success: false,
                error: 'refundAmount and refundNote are required'
            });
        }

        if (transaction.status !== 'paid') {
            return res.status(400).json({
                success: false,
                error: 'Only paid transactions can be refunded'
            });
        }

        const refundAmt = refundAmount ? parseFloat(refundAmount) : transaction.amount;

        if (refundAmt > transaction.amount || refundAmt <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid refund amount'
            });
        }

        if (transaction.refundAmount + refundAmt > transaction.amount) {
            return res.status(400).json({
                success: false,
                error: 'Refund amount exceeds available amount'
            });
        }

        // Create refund on Cashfree
        const refundData = {
            refund_amount: refundAmt,
            refund_id: `REFUND_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
            refund_note: refundNote || 'Refund requested by merchant'
        };

        const cashfreeResponse = await cashfreePG.post(`/orders/${orderId}/refunds`, refundData);

        // Update transaction
        transaction.refundAmount += refundAmt;
        transaction.refundReason = refundNote || 'Refund requested';
        transaction.refundedAt = new Date();
        
        if (transaction.refundAmount >= transaction.amount) {
            transaction.status = 'refunded';
        } else {
            transaction.status = 'partial_refund';
        }

        await transaction.save();

        console.log(`💰 Refund processed: ${refundData.refund_id} for ${orderId}`);

        res.json({
            success: true,
            refund: {
                refundId: refundData.refund_id,
                orderId: transaction.orderId,
                refundAmount: refundAmt,
                totalRefunded: transaction.refundAmount,
                refundStatus: transaction.status,
                refundedAt: transaction.refundedAt
            },
            cashfreeData: cashfreeResponse.data,
            message: 'Refund processed successfully'
        });

    } catch (error) {
        console.error('Refund Payment Error:', error.response?.data || error);
        res.status(500).json({
            success: false,
            error: error.response?.data?.message || 'Failed to process refund'
        });
    }
};
// ============ INITIATE PAYMENT WITH SPECIFIC METHOD ============
// Note: Duplicate definition removed; keep a single authoritative function
exports.initiatePaymentMethod = async (req, res) => {
    try {
        const {
            paymentSessionId,
            paymentMethod, // 'upi', 'card', 'netbanking', 'app', 'wallet', etc.
            channel, // For UPI: 'collect', 'intent', 'qrcode'
            saveInstrument = false,
            offerId,
            // Method-specific details
            upiId, // For UPI collect
            cardDetails, // For card payments
            bankCode, // For netbanking
            walletProvider, // For wallet
            upiApp // For UPI intent (gpay, phonepe, paytm)
        } = req.body;

        console.log(`🔄 Merchant ${req.merchantName} initiating ${paymentMethod} payment`);

        // Validation
        if (!paymentSessionId) {
            return res.status(400).json({
                success: false,
                error: 'paymentSessionId is required'
            });
        }

        if (!paymentMethod) {
            return res.status(400).json({
                success: false,
                error: 'paymentMethod is required (upi, card, netbanking, wallet, app, etc.)'
            });
        }

        // Build payment payload based on method
        let paymentPayload = {
            payment_session_id: paymentSessionId,
            save_instrument: saveInstrument
        };

        // Add offer if provided
        if (offerId) {
            paymentPayload.offer_id = offerId;
        }

        // ====== UPI PAYMENT ======
        if (paymentMethod === 'upi') {
            if (!channel) {
                return res.status(400).json({
                    success: false,
                    error: 'channel is required for UPI (collect, intent, qrcode)'
                });
            }

            paymentPayload.payment_method = {
                upi: {}
            };

            if (channel === 'collect') {
                // UPI Collect - Send payment request to VPA
                if (!upiId) {
                    return res.status(400).json({
                        success: false,
                        error: 'upiId is required for UPI collect'
                    });
                }
                paymentPayload.payment_method.upi.channel = 'collect';
                paymentPayload.payment_method.upi.upi_id = upiId;

            } else if (channel === 'intent') {
                // UPI Intent - Open UPI app
                paymentPayload.payment_method.upi.channel = 'intent';
                if (upiApp) {
                    // Specific app (gpay, phonepe, paytm, etc.)
                    paymentPayload.payment_method.upi.upi_id = `${upiApp}://upi`;
                }

            } else if (channel === 'qrcode') {
                // UPI QR Code
                paymentPayload.payment_method.upi.channel = 'qrcode';

            } else {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid UPI channel. Use: collect, intent, or qrcode'
                });
            }
        }

        // ====== CARD PAYMENT ======
        else if (paymentMethod === 'card') {
            if (!cardDetails || !cardDetails.cardNumber || !cardDetails.cardHolderName || 
                !cardDetails.cardExpiryMM || !cardDetails.cardExpiryYY || !cardDetails.cardCvv) {
                return res.status(400).json({
                    success: false,
                    error: 'Card details required: cardNumber, cardHolderName, cardExpiryMM, cardExpiryYY, cardCvv'
                });
            }

            paymentPayload.payment_method = {
                card: {
                    channel: 'link',
                    card_number: cardDetails.cardNumber,
                    card_holder_name: cardDetails.cardHolderName,
                    card_expiry_mm: cardDetails.cardExpiryMM,
                    card_expiry_yy: cardDetails.cardExpiryYY,
                    card_cvv: cardDetails.cardCvv
                }
            };
        }

        // ====== NETBANKING PAYMENT ======
        else if (paymentMethod === 'netbanking') {
            if (!bankCode) {
                return res.status(400).json({
                    success: false,
                    error: 'bankCode is required for netbanking (e.g., 3003 for SBI, 3032 for HDFC)'
                });
            }

            paymentPayload.payment_method = {
                netbanking: {
                    channel: 'link',
                    netbanking_bank_code: parseInt(bankCode)
                }
            };
        }

        // ====== WALLET PAYMENT ======
        else if (paymentMethod === 'app' || paymentMethod === 'wallet') {
            if (!walletProvider) {
                return res.status(400).json({
                    success: false,
                    error: 'walletProvider is required (paytm, phonepe, freecharge, etc.)'
                });
            }

            paymentPayload.payment_method = {
                app: {
                    channel: 'link',
                    provider: walletProvider,
                    phone: req.body.phone || '' // Optional
                }
            };
        }

        // ====== PAYLATER / CARDLESS EMI ======
        else if (paymentMethod === 'paylater' || paymentMethod === 'cardless_emi') {
            if (!req.body.provider) {
                return res.status(400).json({
                    success: false,
                    error: 'provider is required (simpl, lazypay, etc.)'
                });
            }

            paymentPayload.payment_method = {
                [paymentMethod]: {
                    channel: 'link',
                    provider: req.body.provider,
                    phone: req.body.phone || ''
                }
            };
        }

        else {
            return res.status(400).json({
                success: false,
                error: 'Invalid payment method. Supported: upi, card, netbanking, app, wallet, paylater, cardless_emi'
            });
        }

        console.log('📤 Cashfree Order Pay payload:', JSON.stringify(paymentPayload, null, 2));

        // Call Cashfree Order Pay API
        const response = await cashfreePG.post('/orders/pay', paymentPayload);

        console.log('✅ Cashfree Order Pay response:', response.data);

        // Find and update transaction
        const transaction = await Transaction.findOne({
            $or: [
                { cashfreeOrderToken: cleanedSessionId },
                { cashfreePaymentId: cleanedSessionId }
            ]
        });

        if (transaction) {
            transaction.paymentMethod = paymentMethod;
            transaction.status = 'pending';
            await transaction.save();
        }

        // Build response based on payment method
        const payResponse = {
            success: true,
            payment: {
                cf_payment_id: response.data.cf_payment_id,
                payment_method: response.data.payment_method,
                channel: response.data.channel,
                action: response.data.action,
                payment_amount: response.data.payment_amount,
                data: response.data.data
            },
            transaction: transaction ? {
                transactionId: transaction.transactionId,
                orderId: transaction.orderId,
                status: transaction.status
            } : null
        };

        // Add instructions based on action type
        if (response.data.action === 'link') {
            payResponse.instructions = {
                action: 'redirect',
                message: 'Redirect customer to the payment URL',
                url: response.data.data.url
            };
        } else if (response.data.action === 'post') {
            payResponse.instructions = {
                action: 'submit_form',
                message: 'Submit form data to complete payment',
                url: response.data.data.url,
                payload: response.data.data.payload
            };
        } else if (response.data.action === 'custom') {
            payResponse.instructions = {
                action: 'custom_ui',
                message: 'Render custom UI for OTP/authentication',
                data: response.data.data
            };
        }

        // UPI-specific instructions
        if (paymentMethod === 'upi') {
            if (channel === 'collect') {
                payResponse.instructions = {
                    action: 'poll_status',
                    message: 'Payment request sent to UPI ID. Poll for status.',
                    upiId: upiId,
                    pollUrl: `/api/payments/status/${transaction?.orderId}`
                };
            } else if (channel === 'qrcode') {
                payResponse.instructions = {
                    action: 'display_qr',
                    message: 'Display QR code for customer to scan',
                    qrData: response.data.data.payload?.qrcode || response.data.data.url
                };
            } else if (channel === 'intent') {
                payResponse.instructions = {
                    action: 'open_app',
                    message: 'Deep link to open UPI app',
                    deepLink: response.data.data.url
                };
            }
        }

        res.json(payResponse);

    } catch (error) {
        console.error('❌ Initiate Payment Method Error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.message || 'Failed to initiate payment',
            details: error.response?.data || null
        });
    }
};

// ============ GET AVAILABLE PAYMENT METHODS ============
exports.getPaymentMethods = async (req, res) => {
    try {
        const { orderId, paymentSessionId } = req.query;

        if (!orderId && !paymentSessionId) {
            return res.status(400).json({
                success: false,
                error: 'orderId or paymentSessionId is required'
            });
        }

        let sessionId = paymentSessionId;

        // If orderId provided, get session ID from transaction
        if (orderId && !paymentSessionId) {
            const transaction = await Transaction.findOne({
                orderId,
                merchantId: req.merchantId
            });

            if (!transaction) {
                return res.status(404).json({
                    success: false,
                    error: 'Transaction not found'
                });
            }

            sessionId = transaction.cashfreeOrderToken;
        }

        // Get order details from Cashfree
        const response = await cashfreePG.get(`/orders/sessions/${sessionId}`);

        res.json({
            success: true,
            available_payment_methods: response.data.payment_methods || {
                upi: {
                    enabled: true,
                    channels: ['collect', 'intent', 'qrcode']
                },
                card: {
                    enabled: true,
                    types: ['credit', 'debit']
                },
                netbanking: {
                    enabled: true,
                    banks: ['SBI', 'HDFC', 'ICICI', 'Axis']
                },
                wallet: {
                    enabled: true,
                    providers: ['paytm', 'phonepe', 'freecharge']
                }
            },
            order_details: {
                order_id: response.data.order_id,
                order_amount: response.data.order_amount,
                order_currency: response.data.order_currency
            }
        });

    } catch (error) {
        console.error('❌ Get Payment Methods Error:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch payment methods'
        });
    }
};
