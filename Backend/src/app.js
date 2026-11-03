import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { initializeDatabase } from './db/setup.js';
import productRoutes from './routes/productRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';

const app = express();
const PORT = process.env.PORT || 5002;

// Middleware
app.use(cors({
  origin: '*', // Allow frontend development requests
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Required for payment gateway webhooks (e.g. Mollie)

// Request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

// Root & Health
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'eCommerce & Payment Gateway Learning API is running 🚀',
    endpoints: {
      products: '/api/products',
      orders: '/api/orders',
      paymentSession: '/api/payments/create-session',
      paymentLogs: '/api/payments/logs',
    },
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', uptime: process.uptime() });
});

// API Routes
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);

// 404 Not Found Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err.stack);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal Server Error',
  });
});

// Start Server and initialize PostgreSQL
async function startServer() {
  try {
    await initializeDatabase();
    app.listen(PORT, () => {
      console.log(`\n==================================================`);
      console.log(` Backend server listening on http://localhost:${PORT}`);
      console.log(` Database: Connected to PostgreSQL "eCommerce"`);
      console.log(`==================================================\n`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
}

startServer();
