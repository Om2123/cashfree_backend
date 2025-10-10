/**
 * Calculate settlement date for a transaction (T+1 with weekend skip)
 * 
 * Rules:
 * - T+1: 24 hours minimum after payment
 * - Saturday & Sunday are off (no settlement)
 * - If T+1 falls on weekend, move to Monday
 * 
 * Examples:
 * - Monday payment → Tuesday (24 hours later)
 * - Tuesday payment → Wednesday (24 hours later)
 * - Wednesday payment → Thursday (24 hours later)
 * - Thursday payment → Friday (24 hours later)
 * - Friday payment → Monday (skip weekend, 72+ hours)
 * - Saturday payment → Monday (skip Sunday, 48+ hours)
 * - Sunday payment → Monday (24+ hours)
 */
function calculateSettlementDate(paidAt) {
    const paid = new Date(paidAt);
    const settlement = new Date(paid);
    
    // Add 24 hours (T+1)
    settlement.setTime(settlement.getTime() + (24 * 60 * 60 * 1000));
    
    // Check what day T+1 falls on
    const dayOfWeek = settlement.getDay();
    
    // If T+1 is Saturday (6), move to Monday
    if (dayOfWeek === 6) {
        settlement.setDate(settlement.getDate() + 2); // Saturday -> Monday
    }
    // If T+1 is Sunday (0), move to Monday
    else if (dayOfWeek === 0) {
        settlement.setDate(settlement.getDate() + 1); // Sunday -> Monday
    }
    
    return settlement;
}

/**
 * Check if a transaction is ready for settlement
 * - Must be at least 24 hours old
 * - Current time must be past the expected settlement date
 * - Not on weekend
 */
function isReadyForSettlement(paidAt, expectedSettlementDate) {
    const now = new Date();
    const paid = new Date(paidAt);
    const expected = new Date(expectedSettlementDate);
    
    // Don't settle on weekends
    const currentDay = now.getDay();
    if (currentDay === 0 || currentDay === 6) {
        return false; // Saturday or Sunday - no settlement
    }
    
    // Check if 24 hours have passed since payment
    const hoursSincePayment = (now - paid) / (1000 * 60 * 60);
    if (hoursSincePayment < 24) {
        return false;
    }
    
    // Check if expected settlement time has passed
    return now >= expected;
}

/**
 * Get settlement status text for display
 */
function getSettlementStatusText(paidAt, expectedSettlementDate, settlementStatus) {
    if (settlementStatus === 'settled') {
        return 'Settled';
    }
    
    const now = new Date();
    const expected = new Date(expectedSettlementDate);
    
    const diffMs = expected - now;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMs <= 0) {
        return 'Settling soon';
    } else if (diffDays > 0) {
        return `Settles in ${diffDays} day${diffDays > 1 ? 's' : ''}`;
    } else if (diffHours > 0) {
        return `Settles in ${diffHours} hour${diffHours > 1 ? 's' : ''}`;
    } else {
        return 'Settling soon';
    }
}

/**
 * Get human-readable settlement date text
 */
function getSettlementDateText(expectedSettlementDate) {
    const settlement = new Date(expectedSettlementDate);
    const now = new Date();
    
    // Check if today
    if (settlement.toDateString() === now.toDateString()) {
        return 'Today';
    }
    
    // Check if tomorrow
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (settlement.toDateString() === tomorrow.toDateString()) {
        return 'Tomorrow';
    }
    
    // Otherwise return day name
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[settlement.getDay()];
}

module.exports = {
    calculateSettlementDate,
    isReadyForSettlement,
    getSettlementStatusText,
    getSettlementDateText
};
