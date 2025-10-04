const express = require('express');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

dotenv.config();
connectDB();

const app = express();

app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api', require('./routes/apiRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes')); // ← Add this
 
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => console.log(`🚀 CashCavash Server running on port ${PORT}`));
