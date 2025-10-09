const cron = require('node-cron');
const Transaction = require('../models/Transaction');

// Run every day at 3:00 PM
const settlementJob = cron.schedule('0 15 * * *', async () => {
    try {
        console.log('🔄 Running settlement job...');

        const now = new Date();
        
        // Find all unsettled transactions where expected settlement date has passed
        const transactionsToSettle = await Transaction.find({
            status: 'paid',
            settlementStatus: 'unsettled',
            expectedSettlementDate: { $lte: now }
        });

        console.log(`📦 Found ${transactionsToSettle.length} transactions to settle`);

        for (const transaction of transactionsToSettle) {
            transaction.settlementStatus = 'settled';
            transaction.settlementDate = now;
            transaction.updatedAt = now;
            await transaction.save();
            
            console.log(`✅ Settled transaction: ${transaction.transactionId}`);
        }

        console.log('✅ Settlement job completed');
    } catch (error) {
        console.error('❌ Settlement job error:', error);
    }
});

module.exports = { settlementJob };
