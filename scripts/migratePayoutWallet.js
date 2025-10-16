// scripts/migratePayoutWallet.js

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const connectDB = require('../config/db');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Payout = require('../models/Payout');

dotenv.config({ path: '../.env' }); // Make sure to point to the correct .env file path

const migratePayoutWallets = async () => {
    await connectDB();

    try {
        const merchants = await User.find({ role: 'admin' });
        console.log(`Found ${merchants.length} merchants to migrate.`);

        for (const merchant of merchants) {
            let wallet = 0;

            // 1. Credit settled transactions
            const settledTransactions = await Transaction.find({
                merchantId: merchant._id,
                status: 'paid',
                settlementStatus: 'settled'
            });

            for (const txn of settledTransactions) {
                const commission = (txn.amount * merchant.commissionRate) / 100;
                const netAmount = txn.amount - commission;
                wallet += netAmount;
            }
            console.log(`  [${merchant.businessName}] Credited ${settledTransactions.length} settled transactions. Wallet is now: ${wallet.toFixed(2)}`);

            // 2. Debit payouts that have been requested/approved/processed but not yet completed
            const pendingPayouts = await Payout.find({
                merchantId: merchant._id,
                status: { $in: ['requested', 'pending', 'processing'] }
            });

            for (const payout of pendingPayouts) {
                wallet -= payout.amount;
            }
            console.log(`  [${merchant.businessName}] Debited ${pendingPayouts.length} pending payouts. Wallet is now: ${wallet.toFixed(2)}`);
            
            // 3. Update the merchant's wallet
            merchant.payoutWallet = wallet;
            await merchant.save();

            console.log(`✅ Migrated ${merchant.businessName}. Final wallet balance: ${merchant.payoutWallet.toFixed(2)}`);
        }

        console.log('\nMigration completed successfully!');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        mongoose.disconnect();
    }
};

migratePayoutWallets();
