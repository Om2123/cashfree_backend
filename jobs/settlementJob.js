// jobs/settlementJob.js

const cron = require('node-cron');
const Transaction = require('../models/Transaction');
const { isReadyForSettlement } = require('../utils/settlementCalculator');

// Run every hour
const settlementJob = cron.schedule('0 * * * *', async () => {
    try {
        const now = new Date();
        const currentDay = now.getDay();
        const currentHour = now.getHours();
        
        console.log(`🔄 Running settlement job at ${now.toISOString()}`);
        console.log(`   Current time: ${currentHour}:00 on ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][currentDay]}`);
        
        // Don't run on weekends (Saturday=6, Sunday=0)
        if (currentDay === 0 || currentDay === 6) {
            console.log('⏸️ Weekend - Skipping settlement job');
            return;
        }

        // Find all unsettled transactions
        const unsettledTransactions = await Transaction.find({
            status: 'paid',
            settlementStatus: 'unsettled'
        });

        console.log(`📦 Found ${unsettledTransactions.length} unsettled transactions`);

        let settledCount = 0;
        let notReadyCount = 0;
        let after4PMCount = 0;

        for (const transaction of unsettledTransactions) {
            const paymentDate = new Date(transaction.paidAt);
            const paymentHour = paymentDate.getHours();
            const isAfter4PM = paymentHour >= 16;
            
            if (isAfter4PM) {
                after4PMCount++;
            }
            
            // Check if ready for settlement
            if (isReadyForSettlement(transaction.paidAt, transaction.expectedSettlementDate)) {
                transaction.settlementStatus = 'settled';
                transaction.settlementDate = now;
                transaction.availableForPayout = true; // ✅ Make available for payout
                transaction.updatedAt = now;
                await transaction.save();
                
                settledCount++;
                
                const hoursSincePayment = (now - paymentDate) / (1000 * 60 * 60);
                console.log(`✅ Settled: ${transaction.transactionId}`);
                console.log(`   - Paid: ${paymentDate.toISOString()} (${paymentDate.getHours()}:00)`);
                console.log(`   - After 4 PM: ${isAfter4PM ? 'Yes (T+2)' : 'No (T+1)'}`);
                console.log(`   - Settled: ${now.toISOString()}`);
                console.log(`   - Hours since payment: ${hoursSincePayment.toFixed(1)}`);
            } else {
                notReadyCount++;
            }
        }

        console.log(`✅ Settlement job completed`);
        console.log(`   - Settled: ${settledCount} transactions`);
        console.log(`   - Not ready yet: ${notReadyCount} transactions`);
        console.log(`   - After 4 PM payments (T+2): ${after4PMCount}`);

    } catch (error) {
        console.error('❌ Settlement job error:', error);
    }
});

// For testing: Manual settlement trigger
async function manualSettlement() {
    console.log('🔧 Manual settlement triggered');
    await settlementJob._task();
}

module.exports = { 
    settlementJob,
    manualSettlement 
};
