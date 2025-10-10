const mongoose = require('mongoose');
require('dotenv').config();

// Import Transaction model
const Transaction = require('../models/Transaction');

async function fixOldTransactions() {
    try {
        console.log('🔄 Fixing old transactions...');
        
        // Connect to database
        await mongoose.connect("mongodb://admin:StrongPassword123!@16.16.219.182:27018/?authSource=admin");
        console.log('✅ Connected to database');

        // Find all paid transactions without settlementStatus
        const result = await Transaction.updateMany(
            {
                status: 'paid',
                $or: [
                    { settlementStatus: { $exists: false } },
                    { settlementStatus: null },
                    { settlementStatus: '' }
                ]
            },
            {
                $set: {
                    settlementStatus: 'settled',
                    settlementDate: new Date(),
                    expectedSettlementDate: new Date()
                }
            }
        );

        console.log(`✅ Fixed ${result.modifiedCount} transactions`);
        console.log('   All old transactions are now marked as SETTLED');

        // Show stats
        const totalPaid = await Transaction.countDocuments({ status: 'paid' });
        const settled = await Transaction.countDocuments({ status: 'paid', settlementStatus: 'settled' });
        const unsettled = await Transaction.countDocuments({ status: 'paid', settlementStatus: 'unsettled' });

        console.log('\n📊 Current status:');
        console.log(`   Total paid transactions: ${totalPaid}`);
        console.log(`   Settled: ${settled}`);
        console.log(`   Unsettled: ${unsettled}`);

        await mongoose.connection.close();
        console.log('\n✅ Done! Your balance should now show correctly.');
        process.exit(0);

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

fixOldTransactions();
