// ============ PAYIN COMMISSION CALCULATOR ============
function calculatePayinCommission(amount) {
    const baseRate = 3.8; // 3.8%
    const gstRate = 0; // 18% GST
    
    // Calculate base commission
    const baseCommission = (amount * baseRate) / 100;
    
    // Calculate GST on the commission
    const gstAmount = baseCommission * gstRate;
    
    // Total commission = base + GST
    const totalCommission = baseCommission + gstAmount;
    
    // Effective rate
    const effectiveRate = baseRate + (baseRate * gstRate); // 3.8% + (3.8% × 18%) = 4.484%
    
    return {
        commission: parseFloat(totalCommission.toFixed(2)),
        commissionRate: effectiveRate,
        isMinimumCharge: false,
        breakdown: {
            baseAmount: amount,
            baseRate: `${baseRate}%`,
            baseCommission: baseCommission.toFixed(2),
            gstRate: '0%',
            gstAmount: gstAmount.toFixed(2),
            effectiveRate: `${effectiveRate}%`,
            totalCommission: totalCommission.toFixed(2)
        }
    };
}

 
// ============ PAYOUT COMMISSION CALCULATOR ============
function calculatePayoutCommission(amount, merchant) {
    const gst = 1.18; // 18% GST
    let commission;
    let commissionType;
    let breakdown;

    if (amount < 500) {
        if (merchant && merchant.freePayoutsUnder500 > 0) {
            commission = 0;
            commissionType = 'free';
            breakdown = {
                baseAmount: amount,
                note: 'Free payout utilized'
            };
        } else {
            commission = 10;
            commissionType = 'flat';
            breakdown = {
                baseAmount: amount,
                flatFee: '₹10',
                totalCommission: commission.toFixed(2)
            };
        }
    } else if (amount >= 500 && amount <= 1000) {
        // Flat ₹30 + GST
        commission = 30 * gst; // ₹35.40
        commissionType = 'flat';
        breakdown = {
            baseAmount: amount,
            flatFee: '₹30',
            gst: '18%',
            totalCommission: commission.toFixed(2)
        };
    } else if (amount > 1000) {
        // 1.50% + GST
        const baseRate = 1.50; // 1.50%
        const effectiveRate = (baseRate * gst) / 100; // 1.77%
        commission = amount * effectiveRate;
        commissionType = 'percentage';
        breakdown = {
            baseAmount: amount,
            baseRate: `${baseRate}%`,
            gst: '18%',
            effectiveRate: `${(effectiveRate * 100).toFixed(2)}%`,
            totalCommission: commission.toFixed(2)
        };
    } else {
        commission = 0;
        commissionType = 'free';
        breakdown = {
            baseAmount: amount,
            note: 'No commission for this amount'
        };
    }
    
    return {
        commission: parseFloat(commission.toFixed(2)),
        commissionType: commissionType,
        breakdown: breakdown,
        netAmount: parseFloat((amount - commission).toFixed(2))
    };
}

module.exports = {
    calculatePayinCommission,
    calculatePayoutCommission
};
