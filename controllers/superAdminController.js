const crypto = require('crypto');
const Transaction = require('../models/Transaction');
const Payout = require('../models/Payout');
const User = require('../models/User');
const axios = require('axios');

// Cashfree Payout API Configuration
const cashfreePayouts = axios.create({
    baseURL: process.env.CASHFREE_PAYOUT_URL || 'https://payout-api.cashfree.com',
    headers: {
        'X-Client-Id': process.env.CASHFREE_APP_ID,
        'X-Client-Secret': process.env.CASHFREE_SECRET_KEY,
        'Content-Type': 'application/json'
    }
});

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

// ============ CREATE PAYOUT ============
exports.createPayout = async (req, res) => {
    try {
        const {
            merchantId,
            amount,
            transferMode, // 'bank_transfer', 'upi', 'wallet'
            beneficiaryDetails,
            notes,
            commissionRate = 2.5
        } = req.body;

        console.log(`💰 SuperAdmin initiating payout for merchant: ${merchantId}`);

        // Validation
        if (!merchantId || !amount || !transferMode || !beneficiaryDetails) {
            return res.status(400).json({
                success: false,
                error: 'merchantId, amount, transferMode, and beneficiaryDetails are required'
            });
        }

        // Verify merchant exists
        const merchant = await User.findById(merchantId);
        if (!merchant) {
            return res.status(404).json({
                success: false,
                error: 'Merchant not found'
            });
        }

        // Validate amount
        const payoutAmount = parseFloat(amount);
        if (payoutAmount < 1 || payoutAmount > 1000000) {
            return res.status(400).json({
                success: false,
                error: 'Amount must be between ₹1 and ₹10,00,000'
            });
        }

        // Calculate commission
        const commission = (payoutAmount * parseFloat(commissionRate)) / 100;
        const netAmount = payoutAmount - commission;

        if (netAmount < 1) {
            return res.status(400).json({
                success: false,
                error: 'Net amount after commission must be at least ₹1'
            });
        }

        // Validate beneficiary details based on transfer mode
        if (transferMode === 'bank_transfer') {
            if (!beneficiaryDetails.accountNumber || !beneficiaryDetails.ifscCode || 
                !beneficiaryDetails.accountHolderName) {
                return res.status(400).json({
                    success: false,
                    error: 'Bank transfer requires accountNumber, ifscCode, and accountHolderName'
                });
            }
        } else if (transferMode === 'upi') {
            if (!beneficiaryDetails.upiId) {
                return res.status(400).json({
                    success: false,
                    error: 'UPI transfer requires upiId'
                });
            }
        }

        // Generate payout ID
        const payoutId = `PAYOUT_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

        // Create payout record
        const payout = new Payout({
            payoutId,
            merchantId,
            merchantName: merchant.name,
            amount: payoutAmount,
            commission,
            commissionRate: parseFloat(commissionRate),
            netAmount,
            currency: 'INR',
            transferMode,
            beneficiaryDetails,
            status: 'pending',
            notes: notes || '',
            processedBy: req.user._id,
            processedByName: req.user.name
        });

        await payout.save();

        console.log(`💾 Payout record created: ${payoutId}`);

        // Now process the actual transfer via Cashfree Payouts API
        try {
            let transferData;
            const transferId = `TRANSFER_${Date.now()}`;

            if (transferMode === 'bank_transfer') {
                transferData = {
                    beneId: `BENE_${merchantId}_${Date.now()}`,
                    amount: netAmount.toString(),
                    transferId: transferId,
                    transferMode: 'banktransfer',
                    remarks: `Payout to ${merchant.name} - CashCavash Platform`,
                    beneDetails: {
                        name: beneficiaryDetails.accountHolderName,
                        bankAccount: beneficiaryDetails.accountNumber,
                        ifsc: beneficiaryDetails.ifscCode,
                        email: merchant.email,
                        phone: merchant.phone || '9999999999'
                    }
                };
            } else if (transferMode === 'upi') {
                transferData = {
                    beneId: `BENE_${merchantId}_${Date.now()}`,
                    amount: netAmount.toString(),
                    transferId: transferId,
                    transferMode: 'upi',
                    remarks: `Payout to ${merchant.name} - CashCavash Platform`,
                    beneDetails: {
                        name: merchant.name,
                        vpa: beneficiaryDetails.upiId,
                        email: merchant.email,
                        phone: merchant.phone || '9999999999'
                    }
                };
            }

            console.log(`📤 Initiating Cashfree transfer: ${transferId}`);

            // Call Cashfree Payouts API
            const cashfreeResponse = await cashfreePayouts.post('/payout/v1/requestTransfer', transferData);

            // Update payout with Cashfree details
            payout.status = 'processing';
            payout.cashfreeTransferId = cashfreeResponse.data.data?.transferId || transferId;
            payout.cashfreeReferenceId = cashfreeResponse.data.data?.referenceId || null;
            payout.processedAt = new Date();
            
            await payout.save();

            console.log(`✅ Payout initiated successfully: ${payoutId}`);

            res.json({
                success: true,
                payout: {
                    payoutId,
                    merchantId,
                    merchantName: merchant.name,
                    amount: payoutAmount,
                    commission,
                    netAmount,
                    transferMode,
                    status: payout.status,
                    cashfreeTransferId: payout.cashfreeTransferId,
                    createdAt: payout.createdAt
                },
                breakdown: {
                    gross_amount: payoutAmount,
                    commission_deducted: commission,
                    commission_rate: `${commissionRate}%`,
                    net_amount_transferred: netAmount
                },
                message: 'Payout initiated successfully. Processing transfer...'
            });

        } catch (cashfreeError) {
            console.error('❌ Cashfree Payout Error:', cashfreeError.response?.data || cashfreeError.message);

            // Update payout status to failed
            payout.status = 'failed';
            payout.failureReason = cashfreeError.response?.data?.message || cashfreeError.message;
            await payout.save();

            return res.status(500).json({
                success: false,
                error: 'Payout initiation failed',
                details: cashfreeError.response?.data || cashfreeError.message,
                payout: {
                    payoutId,
                    status: 'failed'
                }
            });
        }

    } catch (error) {
        console.error('❌ Create Payout Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create payout'
        });
    }
};

// ============ GET ALL PAYOUTS ============
exports.getAllPayouts = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            merchantId,
            status,
            startDate,
            endDate,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        console.log(`📋 SuperAdmin fetching payouts - Page ${page}`);

        // Build query
        let query = {};

        if (merchantId) {
            query.merchantId = merchantId;
        }

        if (status) {
            if (status.includes(',')) {
                query.status = { $in: status.split(',') };
            } else {
                query.status = status;
            }
        }

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
            .populate('processedBy', 'name email')
            .lean();

        // Calculate summary
        const allPayouts = await Payout.find({});
        const totalPaid = allPayouts.filter(p => p.status === 'completed').reduce((sum, p) => sum + p.netAmount, 0);
        const totalCommission = allPayouts.reduce((sum, p) => sum + p.commission, 0);
        const totalPending = allPayouts.filter(p => p.status === 'pending' || p.status === 'processing').reduce((sum, p) => sum + p.netAmount, 0);

        res.json({
            success: true,
            payouts,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalCount / parseInt(limit)),
                totalCount,
                limit: parseInt(limit)
            },
            summary: {
                total_payouts: allPayouts.length,
                completed_payouts: allPayouts.filter(p => p.status === 'completed').length,
                pending_payouts: allPayouts.filter(p => p.status === 'pending' || p.status === 'processing').length,
                failed_payouts: allPayouts.filter(p => p.status === 'failed').length,
                total_paid_out: totalPaid.toFixed(2),
                total_commission_earned: totalCommission.toFixed(2),
                total_pending: totalPending.toFixed(2)
            }
        });

    } catch (error) {
        console.error('❌ Get Payouts Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch payouts'
        });
    }
};

// ============ APPROVE PAYOUT REQUEST ============
exports.approvePayoutRequest = async (req, res) => {
    try {
        const { payoutId } = req.params;
        const { notes } = req.body;

        // Find payout in requested state
        const payout = await Payout.findOne({ payoutId });
        if (!payout) {
            return res.status(404).json({ success: false, error: 'Payout not found' });
        }
        if (payout.status !== 'requested') {
            return res.status(400).json({ success: false, error: `Only requested payouts can be approved. Current status: ${payout.status}` });
        }

        // Approve metadata
        payout.approvedBy = req.user._id;
        payout.approvedByName = req.user.name;
        payout.approvedAt = new Date();
        payout.notes = notes || payout.notes;
        payout.status = 'pending';
        await payout.save();

        return res.json({
            success: true,
            message: 'Payout approved and moved to pending for processing',
            payout: {
                payoutId: payout.payoutId,
                status: payout.status,
                approvedAt: payout.approvedAt,
                approvedBy: payout.approvedByName
            }
        });
    } catch (error) {
        console.error('❌ Approve Payout Error:', error);
        res.status(500).json({ success: false, error: 'Failed to approve payout' });
    }
};

// ============ GET MERCHANT BALANCE ============
exports.getMerchantBalance = async (req, res) => {
    try {
        const { merchantId } = req.params;

        // Get all successful transactions for this merchant
        const successfulTransactions = await Transaction.find({
            merchantId,
            status: 'paid'
        });

        // Calculate total revenue
        const totalRevenue = successfulTransactions.reduce((sum, t) => sum + t.amount, 0);
        const totalRefunded = successfulTransactions.reduce((sum, t) => sum + (t.refundAmount || 0), 0);

        // Calculate commission (2.5%)
        const commission = totalRevenue * 0.025;

        // Get total payouts already made
        const completedPayouts = await Payout.find({
            merchantId,
            status: 'completed'
        });
        const totalPaidOut = completedPayouts.reduce((sum, p) => sum + p.netAmount, 0);

        // Get pending payouts
        const pendingPayouts = await Payout.find({
            merchantId,
            status: { $in: ['pending', 'processing'] }
        });
        const totalPending = pendingPayouts.reduce((sum, p) => sum + p.netAmount, 0);

        // Calculate available balance
        const netRevenue = totalRevenue - totalRefunded - commission;
        const availableBalance = netRevenue - totalPaidOut - totalPending;

        // Get merchant details
        const merchant = await User.findById(merchantId).select('name email');

        res.json({
            success: true,
            merchant: {
                merchantId,
                merchantName: merchant?.name,
                merchantEmail: merchant?.email
            },
            balance: {
                total_revenue: totalRevenue.toFixed(2),
                total_refunded: totalRefunded.toFixed(2),
                commission_deducted: commission.toFixed(2),
                net_revenue: netRevenue.toFixed(2),
                total_paid_out: totalPaidOut.toFixed(2),
                pending_payouts: totalPending.toFixed(2),
                available_balance: availableBalance.toFixed(2)
            },
            transaction_summary: {
                total_transactions: successfulTransactions.length,
                total_payouts: completedPayouts.length,
                pending_payout_requests: pendingPayouts.length
            }
        });

    } catch (error) {
        console.error('❌ Get Merchant Balance Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch merchant balance'
        });
    }
};
