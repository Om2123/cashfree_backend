// jobs/settlementJob.js

const cron = require('node-cron');
const Transaction = require('../models/Transaction');
const { isReadyForSettlement, calculateExpectedSettlementDate } = require('../utils/settlementCalculator');

// ✅ Run every day at 4:00 PM (16:00)
const settlementJob = cron.schedule('0 16 * * *', async () => {
    try {
        const now = new Date();
        const currentDay = now.getDay();
        
        console.log(`🔄 Running daily settlement job at ${now.toISOString()}`);
        console.log(`   Current day: ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][currentDay]}`);
        
        // Don't run on weekends (Saturday=6, Sunday=0)
        if (currentDay === 0 || currentDay === 6) {
            console.log('⏸️ Weekend - Skipping settlement job');
            return;
        }

        // Find all unsettled paid transactions
        const unsettledTransactions = await Transaction.find({
            status: 'paid',
            settlementStatus: 'unsettled'
        });

        console.log(`📦 Found ${unsettledTransactions.length} unsettled transactions`);

        let settledCount = 0;
        let notReadyCount = 0;
        let backfilledCount = 0;

        for (const transaction of unsettledTransactions) {
            // Backfill missing expectedSettlementDate if not present
            if (!transaction.expectedSettlementDate && transaction.paidAt) {
                transaction.expectedSettlementDate = calculateExpectedSettlementDate(transaction.paidAt);
                await transaction.save();
                backfilledCount++;
                console.log(`🔧 Backfilled settlement date for: ${transaction.transactionId}`);
            }

            // Skip if still no expected settlement date
            if (!transaction.expectedSettlementDate) {
                console.log(`⚠️ Skipping ${transaction.transactionId} - No expected settlement date`);
                continue;
            }

            const paymentDate = new Date(transaction.paidAt);
            const paymentHour = paymentDate.getHours();
            const isAfter4PM = paymentHour >= 16;
            
            // Check if ready for settlement
            if (isReadyForSettlement(transaction.paidAt, transaction.expectedSettlementDate)) {
                transaction.settlementStatus = 'settled';
                transaction.settlementDate = now;
                transaction.updatedAt = now;
                await transaction.save();
                
                settledCount++;
                
                const hoursSincePayment = (now - paymentDate) / (1000 * 60 * 60);
                console.log(`✅ Settled: ${transaction.transactionId}`);
                console.log(`   - Paid: ${paymentDate.toISOString()} (${paymentDate.getHours()}:00)`);
                console.log(`   - After 4 PM: ${isAfter4PM ? 'Yes (T+2)' : 'No (T+1)'}`);
                console.log(`   - Expected Settlement: ${transaction.expectedSettlementDate}`);
                console.log(`   - Settled: ${now.toISOString()}`);
                console.log(`   - Hours since payment: ${hoursSincePayment.toFixed(1)}`);
            } else {
                notReadyCount++;
                const expectedDate = new Date(transaction.expectedSettlementDate);
                const hoursUntilReady = (expectedDate - now) / (1000 * 60 * 60);
                console.log(`⏳ Not ready: ${transaction.transactionId}`);
                console.log(`   - Expected: ${expectedDate.toISOString()}`);
                console.log(`   - Current: ${now.toISOString()}`);
                console.log(`   - Hours until ready: ${hoursUntilReady.toFixed(1)}`);
            }
        }

        console.log(`✅ Settlement job completed`);
        console.log(`   - Settled: ${settledCount} transactions`);
        console.log(`   - Not ready yet: ${notReadyCount} transactions`);
        console.log(`   - Backfilled dates: ${backfilledCount} transactions`);

    } catch (error) {
        console.error('❌ Settlement job error:', error);
    }
}, {
    scheduled: true,
    timezone: "Asia/Kolkata"
});

// Manual backfill function for existing data
async function backfillSettlementDates() {
    try {
        console.log('🔧 Starting backfill for missing settlement dates...');
        
        const transactionsNeedingBackfill = await Transaction.find({
            status: 'paid',
            paidAt: { $exists: true },
            $or: [
                { expectedSettlementDate: { $exists: false } },
                { expectedSettlementDate: null }
            ]
        });

        console.log(`📦 Found ${transactionsNeedingBackfill.length} transactions needing backfill`);

        let backfilledCount = 0;
        for (const transaction of transactionsNeedingBackfill) {
            transaction.expectedSettlementDate = calculateExpectedSettlementDate(transaction.paidAt);
            await transaction.save();
            backfilledCount++;
            console.log(`✅ Backfilled: ${transaction.transactionId}`);
        }

        console.log(`✅ Backfill completed: ${backfilledCount} transactions updated`);
        return { success: true, count: backfilledCount };
    } catch (error) {
        console.error('❌ Backfill error:', error);
        return { success: false, error: error.message };
    }
}

// For testing: Manual settlement trigger
async function manualSettlement() {
    console.log('🔧 Manual settlement triggered');
    const task = settlementJob;
    if (task && typeof task._task === 'function') {
        await task._task();
    }
}

// ✅ IMPORTANT: Export all three functions
module.exports = { 
    settlementJob,
    manualSettlement,
    backfillSettlementDates
};
