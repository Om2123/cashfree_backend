const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const { settlementJob, backfillSettlementDates } = require('./jobs/settlementJob'); // ✅ Import backfill

dotenv.config();
connectDB();

const app = express();

// Enable CORS
app.use(cors());

// Parse bodies
app.use(express.urlencoded({ extended: true }));
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf.toString();
    }
}));

// ✅ Start settlement job (runs daily at 4 PM IST)
settlementJob.start();
console.log('✅ Settlement cron job started - runs daily at 4:00 PM IST');

// ✅ Backfill missing settlement dates on server startup
backfillSettlementDates().then(result => {
    if (result.success) {
        console.log(`✅ Backfilled ${result.count} transactions with missing settlement dates`);
    } else {
        console.error(`❌ Backfill failed: ${result.error}`);
    }
}).catch(err => {
    console.error('❌ Backfill error:', err);
});

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api', require('./routes/apiRoutes'));
app.use('/api/superadmin', require('./routes/superAdminRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/razorpay', require('./routes/razorpayRoutes')); // ✅ NEW

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
