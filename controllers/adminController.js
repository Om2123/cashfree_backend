const crypto = require('crypto');
const Payout = require('../models/Payout');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { calculatePayinCommission, calculatePayoutCommission } = require('../utils/commissionCalculator');
const { getSettlementDateText, getSettlementStatusText } = require('../utils/settlementCalculator');

// ============ GET MY BALANCE (Updated with T+1 settlement tracking) ============

exports.getMyBalance = async (req, res) => {
    try {
        console.log(`💰 Admin ${req.user.name} checking balance`);

        // Get all successful transactions
        const successfulTransactions = await Transaction.find({
            merchantId: req.merchantId,
            status: 'paid'
        });

        // ✅ SEPARATE SETTLED AND UNSETTLED
        const settledTransactions = successfulTransactions.filter(t => t.settlementStatus === 'settled');
        const unsettledTransactions = successfulTransactions.filter(t => t.settlementStatus === 'unsettled');

        // Calculate settled revenue and commission
        let settledRevenue = 0;
        let settledCommission = 0;

        settledTransactions.forEach(transaction => {
            settledRevenue += transaction.amount;
            const commissionInfo = calculatePayinCommission(transaction.amount);
            settledCommission += commissionInfo.commission;
        });

        // Calculate unsettled revenue and commission
        let unsettledRevenue = 0;
        let unsettledCommission = 0;

        unsettledTransactions.forEach(transaction => {
            unsettledRevenue += transaction.amount;
            const commissionInfo = calculatePayinCommission(transaction.amount);
            unsettledCommission += commissionInfo.commission;
        });

        const totalRevenue = settledRevenue + unsettledRevenue;
        const totalCommission = settledCommission + unsettledCommission;
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

        // ✅ CALCULATE SETTLED BALANCE (available for payout)
        const settledNetRevenue = settledRevenue - totalRefunded - settledCommission;
        const availableBalance = settledNetRevenue - totalPaidOut - totalPending;

        // ✅ CALCULATE UNSETTLED BALANCE (locked until settlement)
        const unsettledNetRevenue = unsettledRevenue - unsettledCommission;

        // ✅ Calculate maximum payout amount (considering commission)
        let maxPayoutGrossAmount = availableBalance;
        if (availableBalance > 0) {
            if (availableBalance > 1000) {
                maxPayoutGrossAmount = availableBalance / 0.9823; // Accounting for 1.77% commission
            } else if (availableBalance > 500) {
                maxPayoutGrossAmount = Math.min(availableBalance + 35.40, 1000);
            } else {
                maxPayoutGrossAmount = availableBalance;
            }
        }

        // ✅ Get next settlement info
        const nextUnsettledTransaction = unsettledTransactions
            .sort((a, b) => new Date(a.expectedSettlementDate) - new Date(b.expectedSettlementDate))[0];

        const nextSettlementText = nextUnsettledTransaction 
            ? getSettlementDateText(nextUnsettledTransaction.expectedSettlementDate)
            : 'No pending settlements';

        const nextSettlementStatus = nextUnsettledTransaction
            ? getSettlementStatusText(
                nextUnsettledTransaction.paidAt,
                nextUnsettledTransaction.expectedSettlementDate,
                nextUnsettledTransaction.settlementStatus
              )
            : null;

        res.json({
            success: true,
            merchant: {
                merchantId: req.merchantId,
                merchantName: req.merchantName,
                merchantEmail: req.user.email
            },
            balance: {
                // ✅ SETTLED BALANCE (can withdraw)
                settled_revenue: settledRevenue.toFixed(2),
                settled_commission: settledCommission.toFixed(2),
                settled_net_revenue: settledNetRevenue.toFixed(2),
                available_balance: availableBalance.toFixed(2),
                
                // ✅ UNSETTLED BALANCE (locked)
                unsettled_revenue: unsettledRevenue.toFixed(2),
                unsettled_commission: unsettledCommission.toFixed(2),
                unsettled_net_revenue: unsettledNetRevenue.toFixed(2),
                
                // TOTALS
                total_revenue: totalRevenue.toFixed(2),
                total_refunded: totalRefunded.toFixed(2),
                total_commission: totalCommission.toFixed(2),
                commission_deducted: totalCommission.toFixed(2),
                net_revenue: (settledNetRevenue + unsettledNetRevenue).toFixed(2),
                total_paid_out: totalPaidOut.toFixed(2),
                pending_payouts: totalPending.toFixed(2),
                
                commission_structure: {
                    payin: '3.8% + 18% GST (Effective: 4.484%)',
                    payout_500_to_1000: '₹30 + 18% GST (₹35.40)',
                    payout_above_1000: '1.50% + 18% GST (1.77%)'
                }
            },
            settlement_info: {
                // Counts
                settled_transactions: settledTransactions.length,
                unsettled_transactions: unsettledTransactions.length,
                
                // Next settlement
                next_settlement: nextSettlementText,
                next_settlement_date: nextUnsettledTransaction?.expectedSettlementDate?.toISOString() || null,
                next_settlement_status: nextSettlementStatus,
                
                // Settlement policy
                settlement_policy: 'T+1 settlement (24 hours after payment)',
                weekend_policy: 'Saturday and Sunday are off. Weekend payments settle on Monday.',
                
                // Examples for clarity
                settlement_examples: {
                    'Monday payment': 'Settles Tuesday (24 hours)',
                    'Tuesday payment': 'Settles Wednesday (24 hours)',
                    'Wednesday payment': 'Settles Thursday (24 hours)',
                    'Thursday payment': 'Settles Friday (24 hours)',
                    'Friday payment': 'Settles Monday (skip weekend)',
                    'Saturday payment': 'Settles Monday (skip Sunday)',
                    'Sunday payment': 'Settles Monday (24+ hours)'
                }
            },
            transaction_summary: {
                total_transactions: successfulTransactions.length,
                settled_transactions: settledTransactions.length,
                unsettled_transactions: unsettledTransactions.length,
                total_payouts_completed: completedPayouts.length,
                pending_payout_requests: pendingPayouts.length,
                avg_commission_per_transaction: successfulTransactions.length > 0 
                    ? (totalCommission / successfulTransactions.length).toFixed(2) 
                    : '0.00'
            },
            payout_eligibility: {
                can_request_payout: availableBalance > 0,
                minimum_payout_amount: 0,
                maximum_payout_amount: maxPayoutGrossAmount.toFixed(2),
                available_for_payout: availableBalance.toFixed(2),
                reason: availableBalance <= 0 
                    ? 'No settled balance available. Wait for T+1 settlement (24 hours after payment).' 
                    : availableBalance < 500 
                        ? `Available balance is ₹${availableBalance.toFixed(2)} (after commission)`
                        : 'Eligible for payout'
            }
        });

        console.log(`✅ Balance returned to ${req.user.name}:`);
        console.log(`   - Available: ₹${availableBalance.toFixed(2)}`);
        console.log(`   - Settled: ${settledTransactions.length} transactions`);
        console.log(`   - Unsettled: ${unsettledTransactions.length} transactions`);
        console.log(`   - Next settlement: ${nextSettlementText}`);

    } catch (error) {
        console.error('❌ Get My Balance Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch balance'
        });
    }
};

// ============ REQUEST PAYOUT (Updated - No Min/Max Limits) ============
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
        
        // ✅ NO MINIMUM/MAXIMUM LIMITS - Only positive amount check
        if (payoutAmount <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Payout amount must be greater than 0'
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

        // ✅ CALCULATE AVAILABLE BALANCE (ONLY SETTLED TRANSACTIONS)
        const successfulTransactions = await Transaction.find({
            merchantId: req.merchantId,
            status: 'paid'
        });

        // Separate settled and unsettled
        const settledTransactions = successfulTransactions.filter(t => t.settlementStatus === 'settled');
        const unsettledTransactions = successfulTransactions.filter(t => t.settlementStatus === 'unsettled');

        let settledRevenue = 0;
        let settledCommission = 0;

        settledTransactions.forEach(transaction => {
            settledRevenue += transaction.amount;
            const commissionInfo = calculatePayinCommission(transaction.amount);
            settledCommission += commissionInfo.commission;
        });

        let unsettledRevenue = 0;
        unsettledTransactions.forEach(transaction => {
            unsettledRevenue += transaction.amount;
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

        // ✅ ONLY SETTLED BALANCE AVAILABLE FOR PAYOUT
        const settledNetRevenue = settledRevenue - totalRefunded - settledCommission;
        const availableBalance = settledNetRevenue - totalPaidOut - totalPending;

        // Check if sufficient settled balance
        if (availableBalance <= 0) {
            return res.status(400).json({
                success: false,
                error: 'No settled balance available for payout',
                balance_info: {
                    settled_balance: settledNetRevenue.toFixed(2),
                    available_balance: availableBalance.toFixed(2),
                    total_paid_out: totalPaidOut.toFixed(2),
                    pending_payouts: totalPending.toFixed(2),
                    unsettled_revenue: unsettledRevenue.toFixed(2)
                },
                message: 'Wait for settlement to complete before requesting payout. Settlement happens daily at 3 PM (T+1).'
            });
        }

        // ✅ CALCULATE PAYOUT COMMISSION
        const payoutCommissionInfo = calculatePayoutCommission(payoutAmount);
        const payoutCommission = payoutCommissionInfo.commission;
        const netAmount = payoutCommissionInfo.netAmount;

        // ✅ Check if net amount can be paid from available balance
        if (netAmount > availableBalance) {
            return res.status(400).json({
                success: false,
                error: 'Insufficient settled balance for this payout request',
                balance_info: {
                    available_balance: availableBalance.toFixed(2),
                    requested_gross_amount: payoutAmount.toFixed(2),
                    payout_commission: payoutCommission.toFixed(2),
                    requested_net_amount: netAmount.toFixed(2),
                    shortfall: (netAmount - availableBalance).toFixed(2),
                    
                    // ✅ Additional breakdown
                    settled_revenue: settledRevenue.toFixed(2),
                    settled_commission: settledCommission.toFixed(2),
                    settled_net_revenue: settledNetRevenue.toFixed(2),
                    total_paid_out: totalPaidOut.toFixed(2),
                    pending_payouts: totalPending.toFixed(2),
                    
                    // Unsettled funds info
                    unsettled_revenue: unsettledRevenue.toFixed(2),
                    unsettled_transactions_count: unsettledTransactions.length
                },
                commission_breakdown: payoutCommissionInfo.breakdown,
                suggestion: `You can request up to ₹${(availableBalance / (1 - (payoutAmount > 1000 ? 0.0177 : 35.40/payoutAmount))).toFixed(2)} (gross amount)`
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
        console.log(`   - Gross Amount: ₹${payoutAmount}`);
        console.log(`   - Commission: ₹${payoutCommission} (${payoutCommissionInfo.commissionType})`);
        console.log(`   - Net Amount: ₹${netAmount}`);
        console.log(`   - Available Balance: ₹${availableBalance.toFixed(2)}`);

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
                // Before payout
                previous_available_balance: availableBalance.toFixed(2),
                previous_settled_balance: settledNetRevenue.toFixed(2),
                
                // After payout
                new_available_balance: (availableBalance - netAmount).toFixed(2),
                total_pending_payouts: (totalPending + netAmount).toFixed(2),
                
                // Settlement info
                settled_transactions_count: settledTransactions.length,
                unsettled_transactions_count: unsettledTransactions.length,
                unsettled_revenue: unsettledRevenue.toFixed(2)
            },
            message: 'Payout request submitted successfully. Awaiting SuperAdmin approval.',
            note: 'Only settled balance is available for payout. Unsettled funds will be available after tomorrow 3 PM settlement.'
        });

    } catch (error) {
        console.error('❌ Request Payout Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create payout request'
        });
    }
};

// ============ GET MY PAYOUTS (Unchanged) ============
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

        let query = { merchantId: req.merchantId };

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

        const totalCount = await Payout.countDocuments(query);

        const sort = {};
        sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

        const payouts = await Payout.find(query)
            .sort(sort)
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .populate('processedBy', 'name email')
            .populate('approvedBy', 'name email')
            .populate('rejectedBy', 'name email')
            .select('-beneficiaryDetails.accountNumber')
            .lean();

        const maskedPayouts = payouts.map(payout => {
            if (payout.beneficiaryDetails?.accountNumber) {
                const accNum = payout.beneficiaryDetails.accountNumber;
                payout.beneficiaryDetails.accountNumber = 'XXXX' + accNum.slice(-4);
            }
            return payout;
        });

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

// ============ CANCEL PAYOUT REQUEST (Unchanged) ============
exports.cancelPayoutRequest = async (req, res) => {
    try {
        const { payoutId } = req.params;
        const { reason } = req.body;

        console.log(`❌ Admin ${req.user.name} cancelling payout: ${payoutId}`);

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

        if (payout.status !== 'requested') {
            return res.status(400).json({
                success: false,
                error: `Cannot cancel payout with status: ${payout.status}. Only 'requested' payouts can be cancelled.`
            });
        }

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
