import express from 'express';
import {
  createPaymentSession,
  verifyPayment,
  handlePaymentWebhook,
  getPaymentLogs,
} from '../controllers/paymentController.js';

const router = express.Router();

// Triggered when frontend clicks "Pay Now"
router.post('/create-session', createPaymentSession);

// Called to verify or mark payment status
router.post('/verify', verifyPayment);

// Webhook endpoint for gateways
router.post('/webhook', handlePaymentWebhook);

// Inspect saved payments in PostgreSQL
router.get('/logs', getPaymentLogs);

export default router;
