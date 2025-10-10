const Transaction = require('../models/Transaction');

// ============ GET PAYMENT STATUS ============
exports.getPaymentStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const merchantId = req.merchantId; // From apiKeyAuth middleware

        console.log(`🔍 Merchant ${req.merchantName} checking status for order: ${orderId}`);

        // Find transaction
        const transaction = await Transaction.findOne({
            orderId: orderId,
            merchantId: merchantId
        });

        if (!transaction) {
            return res.status(404).json({
                success: false,
                error: 'Transaction not found or unauthorized access'
            });
        }

        // Return transaction details
        res.json({
            success: true,
            transaction: {
                transaction_id: transaction.transactionId,
                order_id: transaction.orderId,
                payment_gateway: transaction.paymentGateway, // 'razorpay' or 'cashfree'
                
                // Razorpay specific fields
                razorpay_payment_link_id: transaction.razorpayPaymentLinkId,
                razorpay_payment_id: transaction.razorpayPaymentId,
                razorpay_order_id: transaction.razorpayOrderId,
                razorpay_reference_id: transaction.razorpayReferenceId,
                
                // Common fields
                amount: transaction.amount,
                currency: transaction.currency,
                status: transaction.status,
                payment_method: transaction.paymentMethod,
                
                // Customer details
                customer: {
                    customer_id: transaction.customerId,
                    customer_name: transaction.customerName,
                    customer_email: transaction.customerEmail,
                    customer_phone: transaction.customerPhone
                },
                
                // Timestamps
                created_at: transaction.createdAt,
                paid_at: transaction.paidAt,
                updated_at: transaction.updatedAt,
                
                // Additional info
                description: transaction.description,
                failure_reason: transaction.failureReason,
                refund_amount: transaction.refundAmount || 0,
                refund_reason: transaction.refundReason
            },
            merchant: {
                merchant_id: transaction.merchantId,
                merchant_name: transaction.merchantName
            }
        });

    } catch (error) {
        console.error('❌ Get Payment Status Error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch payment status'
        });
    }
};

// ============ GET TRANSACTIONS (WITH FILTERS) ============
exports.getTransactions = async (req, res) => {
    try {
        const merchantId = req.merchantId; // From apiKeyAuth
        const {
            page = 1,
            limit = 20,
            status,
            payment_gateway,
            payment_method,
            start_date,
            end_date,
            search,
            sort_by = 'createdAt',
            sort_order = 'desc'
        } = req.query;

        console.log(`📋 Merchant ${req.merchantName} fetching transactions - Page ${page}`);

        // Build query
        let query = { merchantId: merchantId };

        // Filter by status
        if (status) {
            if (status.includes(',')) {
                query.status = { $in: status.split(',') };
            } else {
                query.status = status;
            }
        }

        // Filter by payment gateway
        if (payment_gateway) {
            query.paymentGateway = payment_gateway;
        }

        // Filter by payment method
        if (payment_method) {
            query.paymentMethod = payment_method;
        }

        // Date range filter
        if (start_date || end_date) {
            query.createdAt = {};
            if (start_date) query.createdAt.$gte = new Date(start_date);
            if (end_date) query.createdAt.$lte = new Date(end_date);
        }

        // ✅ ENHANCED SEARCH - Description
        if (search) {
            query.$or = [
                { customerName: { $regex: search, $options: 'i' } },
                { customerEmail: { $regex: search, $options: 'i' } },
                { customerPhone: { $regex: search, $options: 'i' } },
                { transactionId: { $regex: search, $options: 'i' } },
                { orderId: { $regex: search, $options: 'i' } },
                { razorpayPaymentId: { $regex: search, $options: 'i' } },
                { razorpayOrderId: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
            ];
        }

        // Get total count
        const totalCount = await Transaction.countDocuments(query);

        // Build sort
        const sort = {};
        sort[sort_by] = sort_order === 'asc' ? 1 : -1;

        // Get transactions
        const transactions = await Transaction.find(query)
            .sort(sort)
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .lean();

        // Calculate summary for this merchant
        const allTransactions = await Transaction.find({ merchantId: merchantId });
        
        const totalRevenue = allTransactions
            .filter(t => t.status === 'paid')
            .reduce((sum, t) => sum + t.amount, 0);
        
        const totalRefunded = allTransactions
            .reduce((sum, t) => sum + (t.refundAmount || 0), 0);
        
        const pendingAmount = allTransactions
            .filter(t => t.status === 'created' || t.status === 'pending')
            .reduce((sum, t) => sum + t.amount, 0);
        
        const failedTransactions = allTransactions.filter(t => t.status === 'failed').length;

        // Group by payment gateway
        const razorpayTransactions = allTransactions.filter(t => t.paymentGateway === 'razorpay');
        const cashfreeTransactions = allTransactions.filter(t => t.paymentGateway === 'cashfree');

        res.json({
            success: true,
            transactions: transactions.map(t => ({
                transaction_id: t.transactionId,
                order_id: t.orderId,
                payment_gateway: t.paymentGateway,
                
                // Razorpay fields
                razorpay_payment_link_id: t.razorpayPaymentLinkId,
                razorpay_payment_id: t.razorpayPaymentId,
                razorpay_order_id: t.razorpayOrderId,
                
                // ✅ UTR / Bank Reference
                utr: t.acquirerData?.utr || t.acquirerData?.rrn || null,
                bank_transaction_id: t.acquirerData?.bank_transaction_id || null,
                
                // Common fields
                amount: t.amount,
                currency: t.currency,
                status: t.status,
                payment_method: t.paymentMethod,
                
                // Customer
                customer_name: t.customerName,
                customer_email: t.customerEmail,
                customer_phone: t.customerPhone,
                
                // Timestamps
                created_at: t.createdAt,
                paid_at: t.paidAt,
                
                // Additional
                description: t.description,
                failure_reason: t.failureReason,
                
                // Settlement info
                settlement_status: t.settlementStatus,
                expected_settlement_date: t.expectedSettlementDate,
                settlement_date: t.settlementDate
            })),
            pagination: {
                current_page: parseInt(page),
                total_pages: Math.ceil(totalCount / parseInt(limit)),
                total_count: totalCount,
                limit: parseInt(limit),
                has_next_page: parseInt(page) < Math.ceil(totalCount / parseInt(limit)),
                has_prev_page: parseInt(page) > 1
            },
            summary: {
                total_transactions: allTransactions.length,
                successful_transactions: allTransactions.filter(t => t.status === 'paid').length,
                pending_transactions: allTransactions.filter(t => t.status === 'created' || t.status === 'pending').length,
                failed_transactions: failedTransactions,
                cancelled_transactions: allTransactions.filter(t => t.status === 'cancelled').length,
                expired_transactions: allTransactions.filter(t => t.status === 'expired').length,
                
                total_revenue: totalRevenue.toFixed(2),
                total_refunded: totalRefunded.toFixed(2),
                pending_amount: pendingAmount.toFixed(2),
                net_revenue: (totalRevenue - totalRefunded).toFixed(2),
                
                // Gateway breakdown
                razorpay_transactions: razorpayTransactions.length,
                razorpay_revenue: razorpayTransactions
                    .filter(t => t.status === 'paid')
                    .reduce((sum, t) => sum + t.amount, 0)
                    .toFixed(2),
                
                cashfree_transactions: cashfreeTransactions.length,
                cashfree_revenue: cashfreeTransactions
                    .filter(t => t.status === 'paid')
                    .reduce((sum, t) => sum + t.amount, 0)
                    .toFixed(2)
            },
            merchant: {
                merchant_id: merchantId.toString(),
                merchant_name: req.merchantName
            }
        });

        console.log(`✅ Returned ${transactions.length} transactions to merchant ${req.merchantName}`);

    } catch (error) {
        console.error('❌ Get Transactions Error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch transactions'
        });
    }
};
