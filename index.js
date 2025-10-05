const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const cors = require('cors');  // ← Add this

dotenv.config();
connectDB();

const app = express();

app.use(cors()); // ← Enable CORS (default: allows all origins)
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api', require('./routes/apiRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
 
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`🚀 CashCavash Server running on port ${PORT}`));
