// utils/settlementCalculator.js

/**
 * Calculate expected settlement date with 4 PM cutoff rule
 * Settlement happens AFTER 4 PM on the settlement date
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
    
    // ✅ NEW: Set settlement time to 4 PM (16:00) of the settlement date
    settlementDate.setHours(16, 0, 0, 0);
    
    return settlementDate;
}

/**
 * Check if transaction is ready for settlement
 * Now checks if current time >= settlement date at 4 PM
 */
function isReadyForSettlement(paidAt, expectedSettlementDate) {
    const now = new Date();
    const currentDay = now.getDay();
    const currentHour = now.getHours();
    
    // Don't settle on weekends
    if (currentDay === 0 || currentDay === 6) {
        return false;
    }
    
    const settlementTime = new Date(expectedSettlementDate);
    
    // ✅ NEW: Must be after 4 PM on the settlement date
    // Ready if current time >= expected settlement time (which is 4 PM on settlement date)
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
    
    // Calculate days and hours until settlement
    const msUntilSettlement = settlementDate - now;
    const hoursUntil = Math.ceil(msUntilSettlement / (1000 * 60 * 60));
    const daysUntil = Math.ceil(msUntilSettlement / (1000 * 60 * 60 * 24));
    
    // Format settlement date nicely
    const settlementDateStr = settlementDate.toLocaleDateString('en-IN', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
    });
    
    if (hoursUntil < 24) {
        return `Settles today at 4 PM`;
    }
    
    if (isAfter4PM) {
        return `Settles on ${settlementDateStr} at 4 PM (paid after 4 PM - T+2)`;
    }
    
    return `Settles on ${settlementDateStr} at 4 PM (T+1)`;
}

module.exports = {
    calculateExpectedSettlementDate,
    isReadyForSettlement,
    getSettlementStatusMessage
};
