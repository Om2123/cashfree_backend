const cron = require('node-cron');
const Transaction = require('../models/Transaction');
const { isReadyForSettlement } = require('../utils/settlementCalculator');

// Run every hour (can adjust to run more frequently if needed)
const settlementJob = cron.schedule('0 * * * *', async () => {
    try {
        const now = new Date();
        const currentDay = now.getDay();
        
        console.log(`🔄 Running settlement job at ${now.toISOString()}`);
        
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

        for (const transaction of unsettledTransactions) {
            // Check if ready for settlement
            if (isReadyForSettlement(transaction.paidAt, transaction.expectedSettlementDate)) {
                transaction.settlementStatus = 'settled';
                transaction.settlementDate = now;
                transaction.updatedAt = now;
                await transaction.save();
                
                settledCount++;
                
                const hoursSincePayment = (now - new Date(transaction.paidAt)) / (1000 * 60 * 60);
                console.log(`✅ Settled: ${transaction.transactionId}`);
                console.log(`   - Paid: ${transaction.paidAt.toISOString()}`);
                console.log(`   - Settled: ${now.toISOString()}`);
                console.log(`   - Hours since payment: ${hoursSincePayment.toFixed(1)}`);
            } else {
                notReadyCount++;
            }
        }

        console.log(`✅ Settlement job completed`);
        console.log(`   - Settled: ${settledCount} transactions`);
        console.log(`   - Not ready yet: ${notReadyCount} transactions`);

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
