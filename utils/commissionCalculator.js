// ============ PAYIN COMMISSION CALCULATOR ============
function calculatePayinCommission(amount) {
    const baseRate = 3.8; // 3.8%
    const gst = 1.18; // 18% GST
    const effectiveRate = baseRate * gst / 100; // 4.484%
    
    const calculatedCommission = amount * effectiveRate;
    const minimumCommission = 18 * gst; // ₹21.24
    
    // Take whichever is higher
    const commission = Math.max(calculatedCommission, minimumCommission);
    
    return {
        commission: parseFloat(commission.toFixed(2)),
        commissionRate: effectiveRate,
        isMinimumCharge: commission === minimumCommission,
        breakdown: {
            baseAmount: amount,
            baseRate: `${baseRate}%`,
            gst: '18%',
            effectiveRate: `${(effectiveRate * 100).toFixed(3)}%`,
            calculatedCommission: calculatedCommission.toFixed(2),
            minimumCommission: minimumCommission.toFixed(2),
            appliedCommission: commission.toFixed(2)
        }
    };
}

// ============ PAYOUT COMMISSION CALCULATOR ============
function calculatePayoutCommission(amount) {
    const gst = 1.18; // 18% GST
    let commission;
    let commissionType;
    let breakdown;
    
    if (amount >= 500 && amount <= 1000) {
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
        const effectiveRate = baseRate * gst / 100; // 1.77%
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
        // Below ₹500 - not allowed or use flat fee
        commission = 30 * gst;
        commissionType = 'flat';
        breakdown = {
            baseAmount: amount,
            note: 'Below minimum payout amount, using flat fee',
            flatFee: '₹30',
            gst: '18%',
            totalCommission: commission.toFixed(2)
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
