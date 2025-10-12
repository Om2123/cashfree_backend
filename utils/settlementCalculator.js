// utils/settlementCalculator.js

/**
 * Calculate expected settlement date with 4 PM cutoff rule
 * - Payment before 4 PM: T+1 settlement
 * - Payment after 4 PM: T+2 settlement (considered next day)
 * - Weekends: Settle on Monday
 */
function calculateExpectedSettlementDate(paidAt) {
    const paymentDate = new Date(paidAt);
    const paymentHour = paymentDate.getHours();
    
    // If payment is after 4 PM (16:00), consider it as next day
    const effectivePaymentDate = paymentHour >= 16 
        ? new Date(paymentDate.getTime() + 24 * 60 * 60 * 1000) // Add 1 day
        : paymentDate;
    
    // Calculate T+1 from effective payment date
    let settlementDate = new Date(effectivePaymentDate);
    settlementDate.setDate(settlementDate.getDate() + 1); // T+1
    
    // Handle weekends
    const dayOfWeek = settlementDate.getDay();
    
    if (dayOfWeek === 0) { // Sunday -> Monday
        settlementDate.setDate(settlementDate.getDate() + 1);
    } else if (dayOfWeek === 6) { // Saturday -> Monday
        settlementDate.setDate(settlementDate.getDate() + 2);
    }
    
    return settlementDate;
}

/**
 * Check if transaction is ready for settlement
 */
function isReadyForSettlement(paidAt, expectedSettlementDate) {
    const now = new Date();
    const currentDay = now.getDay();
    
    // Don't settle on weekends
    if (currentDay === 0 || currentDay === 6) {
        return false;
    }
    
    const settlementTime = new Date(expectedSettlementDate);
    
    // Ready if current time >= expected settlement time
    return now >= settlementTime;
}

/**
 * Get settlement status message for display
 */
function getSettlementStatusMessage(paidAt, expectedSettlementDate) {
    const now = new Date();
    const paymentDate = new Date(paidAt);
    const paymentHour = paymentDate.getHours();
    const settlementDate = new Date(expectedSettlementDate);
    
    const isAfter4PM = paymentHour >= 16;
    
    if (now >= settlementDate) {
        return 'Ready for settlement';
    }
    
    const daysUntil = Math.ceil((settlementDate - now) / (1000 * 60 * 60 * 24));
    
    if (isAfter4PM) {
        return `Settles in ${daysUntil} day(s) (paid after 4 PM - T+2)`;
    }
    
    return `Settles in ${daysUntil} day(s) (T+1)`;
}

module.exports = {
    calculateExpectedSettlementDate,
    isReadyForSettlement,
    getSettlementStatusMessage
};
