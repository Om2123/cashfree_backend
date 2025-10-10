const Payout = require('../models/Payout');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

// ============ GET ALL PAYOUTS (SuperAdmin) ============
exports.getAllPayouts = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            status,
            merchantId,
            startDate,
            endDate,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        console.log(`📋 SuperAdmin ${req.user.name} fetching all payouts - Page ${page}`);

        // Build query
        let query = {};

        // Filter by status
        if (status) {
            if (status.includes(',')) {
                query.status = { $in: status.split(',') };
            } else {
                query.status = status;
            }
        }

        // Filter by merchant
        if (merchantId) {
            query.merchantId = merchantId;
        }

        // Date range filter
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        // Get total count
        const totalCount = await Payout.countDocuments(query);

        // Build sort
        const sort = {};
        sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

        // Get payouts
        const payouts = await Payout.find(query)
            .sort(sort)
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .populate('merchantId', 'name email')
            .populate('requestedBy', 'name email')
            .populate('approvedBy', 'name email')
            .populate('rejectedBy', 'name email')
            .lean();

        // Calculate summary
        const allPayouts = await Payout.find({});
        const totalRequested = allPayouts.reduce((sum, p) => sum + p.amount, 0);
        const totalCompleted = allPayouts.filter(p => p.status === 'completed').reduce((sum, p) => sum + p.netAmount, 0);
        const totalPending = allPayouts.filter(p => ['requested', 'pending', 'processing'].includes(p.status)).reduce((sum, p) => sum + p.netAmount, 0);

        res.json({
            success: true,
            payouts,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalCount / parseInt(limit)),
                totalCount,
                limit: parseInt(limit),
                hasNextPage: parseInt(page) < Math.ceil(totalCount / parseInt(limit)),
                hasPrevPage: parseInt(page) > 1
            },
            summary: {
                total_payout_requests: allPayouts.length,
                requested_payouts: allPayouts.filter(p => p.status === 'requested').length,
                pending_payouts: allPayouts.filter(p => ['pending', 'processing'].includes(p.status)).length,
                completed_payouts: allPayouts.filter(p => p.status === 'completed').length,
                failed_payouts: allPayouts.filter(p => p.status === 'failed').length,
                rejected_payouts: allPayouts.filter(p => p.status === 'rejected').length,
                cancelled_payouts: allPayouts.filter(p => p.status === 'cancelled').length,
                total_amount_requested: totalRequested.toFixed(2),
                total_completed: totalCompleted.toFixed(2),
                total_pending: totalPending.toFixed(2)
            }
        });

        console.log(`✅ Returned ${payouts.length} payouts to SuperAdmin`);

    } catch (error) {
        console.error('❌ Get All Payouts Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch payouts'
        });
    }
};

// ============ APPROVE PAYOUT ============
exports.approvePayout = async (req, res) => {
    try {
        const { payoutId } = req.params;
        const { notes } = req.body;

        console.log(`✅ SuperAdmin ${req.user.name} approving payout: ${payoutId}`);

        const payout = await Payout.findOne({ payoutId });

        if (!payout) {
            return res.status(404).json({
                success: false,
                error: 'Payout request not found'
            });
        }

        if (payout.status !== 'requested') {
            return res.status(400).json({
                success: false,
                error: `Cannot approve payout with status: ${payout.status}`
            });
        }

        // Update payout
        payout.status = 'pending';
        payout.approvedBy = req.user._id;
        payout.approvedByName = req.user.name;
        payout.approvedAt = new Date();
        payout.superAdminNotes = notes || '';

        await payout.save();

        res.json({
            success: true,
            message: 'Payout approved successfully. Ready for processing.',
            payout: {
                payoutId: payout.payoutId,
                status: payout.status,
                approvedBy: payout.approvedByName,
                approvedAt: payout.approvedAt
            }
        });

    } catch (error) {
        console.error('❌ Approve Payout Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to approve payout'
        });
    }
};

// ============ REJECT PAYOUT ============
exports.rejectPayout = async (req, res) => {
    try {
        const { payoutId } = req.params;
        const { reason } = req.body;

        if (!reason) {
            return res.status(400).json({
                success: false,
                error: 'Rejection reason is required'
            });
        }

        console.log(`❌ SuperAdmin ${req.user.name} rejecting payout: ${payoutId}`);

        const payout = await Payout.findOne({ payoutId });

        if (!payout) {
            return res.status(404).json({
                success: false,
                error: 'Payout request not found'
            });
        }

        if (payout.status === 'completed') {
            return res.status(400).json({
                success: false,
                error: 'Cannot reject a completed payout'
            });
        }

        // Update payout
        payout.status = 'rejected';
        payout.rejectedBy = req.user._id;
        payout.rejectedByName = req.user.name;
        payout.rejectedAt = new Date();
        payout.rejectionReason = reason;

        await payout.save();

        res.json({
            success: true,
            message: 'Payout rejected successfully',
            payout: {
                payoutId: payout.payoutId,
                status: payout.status,
                rejectedBy: payout.rejectedByName,
                rejectedAt: payout.rejectedAt,
                reason: payout.rejectionReason
            }
        });

    } catch (error) {
        console.error('❌ Reject Payout Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reject payout'
        });
    }
};

// ============ PROCESS PAYOUT (Mark as completed with UTR) ============
exports.processPayout = async (req, res) => {
    try {
        const { payoutId } = req.params;
        const { utr, notes } = req.body;

        if (!utr) {
            return res.status(400).json({
                success: false,
                error: 'UTR/Transaction reference is required'
            });
        }

        console.log(`💰 SuperAdmin ${req.user.name} processing payout: ${payoutId} with UTR: ${utr}`);

        const payout = await Payout.findOne({ payoutId });

        if (!payout) {
            return res.status(404).json({
                success: false,
                error: 'Payout request not found'
            });
        }

        if (payout.status !== 'pending' && payout.status !== 'processing') {
            return res.status(400).json({
                success: false,
                error: `Cannot process payout with status: ${payout.status}`
            });
        }

        // Update payout as completed
        payout.status = 'completed';
        payout.processedBy = req.user._id;
        payout.processedByName = req.user.name;
        payout.processedAt = new Date();
        payout.completedAt = new Date();
        payout.utr = utr;
        payout.superAdminNotes = notes || payout.superAdminNotes;

        await payout.save();

        res.json({
            success: true,
            message: 'Payout processed and completed successfully',
            payout: {
                payoutId: payout.payoutId,
                status: payout.status,
                netAmount: payout.netAmount,
                utr: payout.utr,
                processedBy: payout.processedByName,
                completedAt: payout.completedAt
            }
        });

    } catch (error) {
        console.error('❌ Process Payout Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process payout'
        });
    }
};

// ============ GET ALL TRANSACTIONS (All Merchants) ============
exports.getAllTransactions = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            merchantId,
            status,
            startDate,
            endDate,
            minAmount,
            maxAmount,
            search,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        console.log(`📊 SuperAdmin fetching all transactions - Page ${page}`);

        // Build query
        let query = {};

        // Filter by merchant
        if (merchantId) {
            query.merchantId = merchantId;
        }

        // Filter by status
        if (status) {
            if (status.includes(',')) {
                query.status = { $in: status.split(',') };
            } else {
                query.status = status;
            }
        }

        // Date range filter
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        // Amount range filter
        if (minAmount || maxAmount) {
            query.amount = {};
            if (minAmount) query.amount.$gte = parseFloat(minAmount);
            if (maxAmount) query.amount.$lte = parseFloat(maxAmount);
        }

        // Search filter
        if (search) {
            query.$or = [
                { orderId: { $regex: search, $options: 'i' } },
                { transactionId: { $regex: search, $options: 'i' } },
                { customerName: { $regex: search, $options: 'i' } },
                { customerEmail: { $regex: search, $options: 'i' } },
                { customerPhone: { $regex: search, $options: 'i' } },
                { merchantName: { $regex: search, $options: 'i' } }
            ];
        }

        // Get total count
        const totalCount = await Transaction.countDocuments(query);

        // Build sort object
        const sort = {};
        sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

        // Get transactions with pagination
        const transactions = await Transaction.find(query)
            .sort(sort)
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .populate('merchantId', 'name email')
            .select('-webhookData')
            .lean();

        // Calculate platform-wide statistics
        const allTransactions = await Transaction.find({});
        const successfulTransactions = allTransactions.filter(t => t.status === 'paid');
        const totalRevenue = successfulTransactions.reduce((sum, t) => sum + t.amount, 0);
        const totalRefunded = allTransactions.reduce((sum, t) => sum + (t.refundAmount || 0), 0);
        
        // Calculate commission (default 2.5%)
        const totalCommission = totalRevenue * 0.025;
        const netRevenue = totalRevenue - totalRefunded;

        // Merchant-wise breakdown
        const merchantStats = {};
        allTransactions.forEach(t => {
            if (!merchantStats[t.merchantId]) {
                merchantStats[t.merchantId] = {
                    merchantId: t.merchantId,
                    merchantName: t.merchantName,
                    totalTransactions: 0,
                    successfulTransactions: 0,
                    totalVolume: 0,
                    commission: 0
                };
            }
            merchantStats[t.merchantId].totalTransactions++;
            if (t.status === 'paid') {
                merchantStats[t.merchantId].successfulTransactions++;
                merchantStats[t.merchantId].totalVolume += t.amount;
                merchantStats[t.merchantId].commission += t.amount * 0.025;
            }
        });

        const topMerchants = Object.values(merchantStats)
            .sort((a, b) => b.totalVolume - a.totalVolume)
            .slice(0, 10);

        res.json({
            success: true,
            transactions,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalCount / parseInt(limit)),
                totalCount,
                limit: parseInt(limit),
                hasNextPage: parseInt(page) < Math.ceil(totalCount / parseInt(limit)),
                hasPrevPage: parseInt(page) > 1
            },
            summary: {
                total_transactions: allTransactions.length,
                successful_transactions: successfulTransactions.length,
                failed_transactions: allTransactions.filter(t => t.status === 'failed').length,
                pending_transactions: allTransactions.filter(t => t.status === 'pending' || t.status === 'created').length,
                total_revenue: totalRevenue.toFixed(2),
                total_refunded: totalRefunded.toFixed(2),
                net_revenue: netRevenue.toFixed(2),
                total_commission_earned: totalCommission.toFixed(2),
                success_rate: allTransactions.length > 0 ? 
                    ((successfulTransactions.length / allTransactions.length) * 100).toFixed(2) : 0,
                average_transaction_value: allTransactions.length > 0 ? 
                    (totalRevenue / allTransactions.length).toFixed(2) : 0
            },
            merchant_stats: {
                total_merchants: Object.keys(merchantStats).length,
                top_merchants: topMerchants
            },
            filters_applied: {
                merchantId: merchantId || null,
                status: status || null,
                dateRange: startDate && endDate ? `${startDate} to ${endDate}` : null,
                amountRange: minAmount || maxAmount ? `${minAmount || 0} to ${maxAmount || '∞'}` : null,
                search: search || null
            }
        });

        console.log(`✅ Returned ${transactions.length} transactions to SuperAdmin`);

    } catch (error) {
        console.error('❌ Get All Transactions Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch transactions'
        });
    }
};


 