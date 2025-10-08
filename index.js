const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');

dotenv.config();
connectDB();

const app = express();

// Enable CORS for all origins
app.use(cors());

app.use(express.json());
app.use(
    express.json({
        verify: (req, res, buf) => {
            req.rawBody = buf.toString(); // Store raw body as string
        }
    })
);
// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api', require('./routes/apiRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
 
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`🚀 CashCavash Server running on port ${PORT}`));
