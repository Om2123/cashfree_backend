
const crypto = require('crypto');
const Payout = require('../models/Payout');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { calculatePayinCommission, calculatePayoutCommission } = require('../utils/commissionCalculator');

// ============ GET MY BALANCE (Updated with real commission) ============
exports.getMyBalance = async (req, res) => {
    try {
        console.log(`💰 Admin ${req.user.name} checking balance`);

        // Get all successful transactions
        const successfulTransactions = await Transaction.find({
            merchantId: req.merchantId,
            status: 'paid'
        });

        // Calculate total revenue and commission with real pricing
        let totalRevenue = 0;
        let totalCommission = 0;
        let transactionCommissionDetails = [];

        successfulTransactions.forEach(transaction => {
            const amount = transaction.amount;
            totalRevenue += amount;

            // Calculate payin commission for each transaction
            const commissionInfo = calculatePayinCommission(amount);
            totalCommission += commissionInfo.commission;

            transactionCommissionDetails.push({
                transactionId: transaction.transactionId,
                amount: amount,
                commission: commissionInfo.commission,
                isMinimumCharge: commissionInfo.isMinimumCharge
            });
        });

        const totalRefunded = successfulTransactions.reduce((sum, t) => sum + (t.refundAmount || 0), 0);

        // Get payouts
        const completedPayouts = await Payout.find({
            merchantId: req.merchantId,
            status: 'completed'
        });
        const pendingPayouts = await Payout.find({
            merchantId: req.merchantId,
            status: { $in: ['requested', 'pending', 'processing'] }
        });

        const totalPaidOut = completedPayouts.reduce((sum, p) => sum + p.netAmount, 0);
        const totalPending = pendingPayouts.reduce((sum, p) => sum + p.netAmount, 0);

        const netRevenue = totalRevenue - totalRefunded - totalCommission;
        const availableBalance = netRevenue - totalPaidOut - totalPending;

        res.json({
            success: true,
            merchant: {
                merchantId: req.merchantId,
                merchantName: req.merchantName,
                merchantEmail: req.user.email
            },
            balance: {
                total_revenue: totalRevenue.toFixed(2),
                total_refunded: totalRefunded.toFixed(2),
                commission_deducted: totalCommission.toFixed(2),
                commission_structure: {
                    payin: '3.8% + 18% GST (Effective: 4.484%)',
                    minimum_charge: '₹18 + 18% GST (₹21.24)',
                    payout_500_to_1000: '₹30 + 18% GST (₹35.40)',
                    payout_above_1000: '1.50% + 18% GST (1.77%)'
                },
                net_revenue: netRevenue.toFixed(2),
                total_paid_out: totalPaidOut.toFixed(2),
                pending_payouts: totalPending.toFixed(2),
                available_balance: availableBalance.toFixed(2)
            },
            transaction_summary: {
                total_transactions: successfulTransactions.length,
                total_payouts_completed: completedPayouts.length,
                pending_payout_requests: pendingPayouts.length,
                avg_commission_per_transaction: (totalCommission / successfulTransactions.length).toFixed(2)
            },
            payout_eligibility: {
                can_request_payout: availableBalance >= 500,
                minimum_payout_amount: 500,
                maximum_payout_amount: Math.min(availableBalance, 100000).toFixed(2)
            }
        });

    } catch (error) {
        console.error('❌ Get My Balance Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch balance'
        });
    }
};

// ============ REQUEST PAYOUT (Updated with real payout commission) ============
exports.requestPayout = async (req, res) => {
    try {
        const {
            amount,
            transferMode,
            beneficiaryDetails,
            notes
        } = req.body;

        console.log(`💰 Admin ${req.user.name} requesting payout of ₹${amount}`);

        // Validation
        if (!amount || !transferMode || !beneficiaryDetails) {
            return res.status(400).json({
                success: false,
                error: 'amount, transferMode, and beneficiaryDetails are required'
            });
        }

        // Validate amount
        const payoutAmount = parseFloat(amount);
        
        // ✅ UPDATED: Minimum payout is ₹500 (to match payout pricing)
        if (payoutAmount < 500) {
            return res.status(400).json({
                success: false,
                error: 'Minimum payout amount is ₹500'
            });
        }

        if (payoutAmount > 100000) {
            return res.status(400).json({
                success: false,
                error: 'Maximum payout amount is ₹1,00,000 per request'
            });
        }

        // Validate beneficiary details
        if (transferMode === 'bank_transfer') {
            if (!beneficiaryDetails.accountNumber || !beneficiaryDetails.ifscCode || 
                !beneficiaryDetails.accountHolderName) {
                return res.status(400).json({
                    success: false,
                    error: 'Bank transfer requires accountNumber, ifscCode, and accountHolderName'
                });
            }

            const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
            if (!ifscRegex.test(beneficiaryDetails.ifscCode)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid IFSC code format'
                });
            }

            if (beneficiaryDetails.accountNumber.length < 9 || beneficiaryDetails.accountNumber.length > 18) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid account number length'
                });
            }
        } else if (transferMode === 'upi') {
            if (!beneficiaryDetails.upiId) {
                return res.status(400).json({
                    success: false,
                    error: 'UPI transfer requires upiId'
                });
            }

            const upiRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z]+$/;
            if (!upiRegex.test(beneficiaryDetails.upiId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid UPI ID format'
                });
            }
        } else {
            return res.status(400).json({
                success: false,
                error: 'Invalid transfer mode. Use bank_transfer or upi'
            });
        }

        // ✅ CALCULATE AVAILABLE BALANCE WITH REAL PAYIN COMMISSION
        const successfulTransactions = await Transaction.find({
            merchantId: req.merchantId,
            status: 'paid'
        });

        let totalRevenue = 0;
        let totalPayinCommission = 0;

        successfulTransactions.forEach(transaction => {
            totalRevenue += transaction.amount;
            const commissionInfo = calculatePayinCommission(transaction.amount);
            totalPayinCommission += commissionInfo.commission;
        });

        const totalRefunded = successfulTransactions.reduce((sum, t) => sum + (t.refundAmount || 0), 0);

        const completedPayouts = await Payout.find({
            merchantId: req.merchantId,
            status: 'completed'
        });
        const pendingPayouts = await Payout.find({
            merchantId: req.merchantId,
            status: { $in: ['requested', 'pending', 'processing'] }
        });

        const totalPaidOut = completedPayouts.reduce((sum, p) => sum + p.netAmount, 0);
        const totalPending = pendingPayouts.reduce((sum, p) => sum + p.netAmount, 0);

        const netRevenue = totalRevenue - totalRefunded - totalPayinCommission;
        const availableBalance = netRevenue - totalPaidOut - totalPending;

        // ✅ CALCULATE PAYOUT COMMISSION WITH REAL PRICING
        const payoutCommissionInfo = calculatePayoutCommission(payoutAmount);
        const payoutCommission = payoutCommissionInfo.commission;
        const netAmount = payoutCommissionInfo.netAmount;

        if (netAmount > availableBalance) {
            return res.status(400).json({
                success: false,
                error: 'Insufficient balance for this payout request',
                balance_info: {
                    available_balance: availableBalance.toFixed(2),
                    requested_gross_amount: payoutAmount.toFixed(2),
                    payout_commission: payoutCommission.toFixed(2),
                    requested_net_amount: netAmount.toFixed(2),
                    shortfall: (netAmount - availableBalance).toFixed(2)
                },
                commission_breakdown: payoutCommissionInfo.breakdown
            });
        }

        // Generate payout ID
        const payoutId = `PAYOUT_REQ_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

        // Create payout request
        const payout = new Payout({
            payoutId,
            merchantId: req.merchantId,
            merchantName: req.merchantName,
            amount: payoutAmount,
            commission: payoutCommission,
            commissionType: payoutCommissionInfo.commissionType,
            commissionBreakdown: payoutCommissionInfo.breakdown,
            netAmount,
            currency: 'INR',
            transferMode,
            beneficiaryDetails,
            status: 'requested',
            adminNotes: notes || '',
            requestedBy: req.user._id,
            requestedByName: req.user.name,
            requestedAt: new Date()
        });

        await payout.save();

        console.log(`✅ Payout request created: ${payoutId} by ${req.user.name}`);

        // Mask sensitive info in response
        const maskedBeneficiary = { ...beneficiaryDetails };
        if (maskedBeneficiary.accountNumber) {
            const accNum = maskedBeneficiary.accountNumber;
            maskedBeneficiary.accountNumber = 'XXXX' + accNum.slice(-4);
        }

        res.json({
            success: true,
            payout: {
                payoutId,
                amount: payoutAmount,
                commission: payoutCommission,
                commissionType: payoutCommissionInfo.commissionType,
                commissionBreakdown: payoutCommissionInfo.breakdown,
                netAmount,
                transferMode,
                beneficiaryDetails: maskedBeneficiary,
                status: 'requested',
                requestedAt: payout.requestedAt,
                notes: notes || ''
            },
            balance_info: {
                previous_available_balance: availableBalance.toFixed(2),
                new_available_balance: (availableBalance - netAmount).toFixed(2),
                total_pending_payouts: (totalPending + netAmount).toFixed(2)
            },
            message: 'Payout request submitted successfully. Awaiting SuperAdmin approval.'
        });

    } catch (error) {
        console.error('❌ Request Payout Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create payout request'
        });
    }
};

// ... (getMyPayouts and cancelPayoutRequest remain the same)

// ============ GET MY PAYOUTS (Admin viewing their own payouts) ============
exports.getMyPayouts = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            status,
            startDate,
            endDate,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        console.log(`📋 Admin ${req.user.name} fetching their payouts - Page ${page}`);

        // Build query for this merchant only
        let query = { merchantId: req.merchantId };

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
            .populate('processedBy', 'name email')
            .populate('approvedBy', 'name email')
            .populate('rejectedBy', 'name email')
            .select('-beneficiaryDetails.accountNumber') // Hide full account number for security
            .lean();

        // Mask account numbers (show only last 4 digits)
        const maskedPayouts = payouts.map(payout => {
            if (payout.beneficiaryDetails?.accountNumber) {
                const accNum = payout.beneficiaryDetails.accountNumber;
                payout.beneficiaryDetails.accountNumber = 'XXXX' + accNum.slice(-4);
            }
            return payout;
        });

        // Calculate summary for this merchant
        const allMyPayouts = await Payout.find({ merchantId: req.merchantId });
        const totalRequested = allMyPayouts.reduce((sum, p) => sum + p.amount, 0);
        const totalCompleted = allMyPayouts.filter(p => p.status === 'completed').reduce((sum, p) => sum + p.netAmount, 0);
        const totalPending = allMyPayouts.filter(p => p.status === 'requested' || p.status === 'pending' || p.status === 'processing').reduce((sum, p) => sum + p.netAmount, 0);
        const totalCommission = allMyPayouts.reduce((sum, p) => sum + p.commission, 0);

        res.json({
            success: true,
            payouts: maskedPayouts,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalCount / parseInt(limit)),
                totalCount,
                limit: parseInt(limit),
                hasNextPage: parseInt(page) < Math.ceil(totalCount / parseInt(limit)),
                hasPrevPage: parseInt(page) > 1
            },
            summary: {
                total_payout_requests: allMyPayouts.length,
                requested_payouts: allMyPayouts.filter(p => p.status === 'requested').length,
                pending_payouts: allMyPayouts.filter(p => p.status === 'pending' || p.status === 'processing').length,
                completed_payouts: allMyPayouts.filter(p => p.status === 'completed').length,
                failed_payouts: allMyPayouts.filter(p => p.status === 'failed').length,
                cancelled_payouts: allMyPayouts.filter(p => p.status === 'cancelled').length,
                total_amount_requested: totalRequested.toFixed(2),
                total_completed: totalCompleted.toFixed(2),
                total_pending: totalPending.toFixed(2),
                total_commission_paid: totalCommission.toFixed(2)
            },
            merchant_info: {
                merchantId: req.merchantId,
                merchantName: req.merchantName,
                merchantEmail: req.user.email
            }
        });

        console.log(`✅ Returned ${maskedPayouts.length} payouts to admin ${req.user.name}`);

    } catch (error) {
        console.error('❌ Get My Payouts Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch payout history'
        });
    }
};

// ============ CANCEL PAYOUT REQUEST (Admin cancelling their own request) ============
exports.cancelPayoutRequest = async (req, res) => {
    try {
        const { payoutId } = req.params;
        const { reason } = req.body;

        console.log(`❌ Admin ${req.user.name} cancelling payout: ${payoutId}`);

        // Find payout
        const payout = await Payout.findOne({
            payoutId,
            merchantId: req.merchantId
        });

        if (!payout) {
            return res.status(404).json({
                success: false,
                error: 'Payout request not found'
            });
        }

        // Can only cancel if status is 'requested'
        if (payout.status !== 'requested') {
            return res.status(400).json({
                success: false,
                error: `Cannot cancel payout with status: ${payout.status}. Only 'requested' payouts can be cancelled.`
            });
        }

        // Update payout
        payout.status = 'cancelled';
        payout.rejectedBy = req.user._id;
        payout.rejectedByName = req.user.name;
        payout.rejectedAt = new Date();
        payout.rejectionReason = reason || 'Cancelled by merchant';

        await payout.save();

        res.json({
            success: true,
            message: 'Payout request cancelled successfully',
            payout: {
                payoutId: payout.payoutId,
                status: payout.status,
                cancelledAt: payout.rejectedAt,
                reason: payout.rejectionReason
            }
        });

    } catch (error) {
        console.error('❌ Cancel Payout Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to cancel payout request'
        });
    }
};
