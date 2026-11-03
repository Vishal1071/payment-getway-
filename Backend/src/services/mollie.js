import { createMollieClient } from '@mollie/api-client';

const apiKey = process.env.MOLLIE_API_KEY || '';
const hasValidKey = apiKey && apiKey.startsWith('test_') && apiKey !== 'test_replace_with_your_mollie_api_key';

let mollieClient = null;
if (hasValidKey) {
  try {
    mollieClient = createMollieClient({ apiKey });
    console.log(' Mollie API client initialized with test/live key.');
  } catch (err) {
    console.warn('⚠️ Could not initialize Mollie client:', err.message);
  }
} else {
  console.log('ℹ️ Running Mollie in Educational Simulator Mode (Add a real MOLLIE_API_KEY in .env to connect to Mollie servers).');
}

// In-memory payment and order store for learning inspection
export const paymentsStore = new Map();
export const ordersStore = new Map();

/**
 * Returns configuration status for frontend awareness
 */
export function getMollieConfig() {
  return {
    isConfigured: !!mollieClient,
    mode: mollieClient ? 'live-or-test' : 'simulator',
    apiKeyPrefix: apiKey ? `${apiKey.substring(0, 7)}...` : 'none',
    currency: 'EUR',
  };
}

/**
 * Creates a Mollie payment session
 */
export async function createPayment({
  amount,
  description,
  orderId,
  customerEmail,
  customerName,
  redirectUrl,
  webhookUrl,
}) {
  const formattedAmount = Number(amount).toFixed(2);

  // If a valid Mollie API Key is present, call Mollie's real API
  if (mollieClient) {
    const payload = {
      amount: {
        currency: 'EUR',
        value: formattedAmount,
      },
      description: description || `Order #${orderId}`,
      redirectUrl: redirectUrl || `${process.env.CLIENT_URL || 'http://localhost:5173'}/?orderId=${orderId}`,
      metadata: {
        orderId,
        customerEmail,
        customerName,
      },
    };

    // Mollie requires a reachable public URL for webhooks; do not pass localhost
    if (webhookUrl && !webhookUrl.includes('localhost') && !webhookUrl.includes('127.0.0.1')) {
      payload.webhookUrl = webhookUrl;
    }

    const payment = await mollieClient.payments.create(payload);

    const record = {
      id: payment.id,
      orderId,
      amount: formattedAmount,
      currency: 'EUR',
      description,
      status: payment.status, // 'open', 'pending', 'paid', etc.
      checkoutUrl: payment.getCheckoutUrl(),
      createdAt: payment.createdAt || new Date().toISOString(),
      mode: 'mollie',
      method: payment.method,
    };
    paymentsStore.set(payment.id, record);

    return {
      paymentId: payment.id,
      checkoutUrl: payment.getCheckoutUrl(),
      status: payment.status,
      mode: 'mollie',
      orderId,
    };
  }

  // Educational Simulator Mode: Mimics Mollie's hosted checkout lifecycle
  const simulatedId = `tr_sim_${Date.now()}`;
  const clientBase = process.env.CLIENT_URL || 'http://localhost:5173';
  const checkoutUrl = `${clientBase}/?mode=simulate_mollie&paymentId=${simulatedId}&orderId=${orderId}&amount=${formattedAmount}`;

  const simulatedPayment = {
    id: simulatedId,
    orderId,
    amount: formattedAmount,
    currency: 'EUR',
    description: description || `Order #${orderId}`,
    status: 'open',
    checkoutUrl,
    customerEmail,
    customerName,
    createdAt: new Date().toISOString(),
    mode: 'simulator',
    method: 'ideal_or_card',
  };

  paymentsStore.set(simulatedId, simulatedPayment);

  return {
    paymentId: simulatedId,
    checkoutUrl,
    status: 'open',
    mode: 'simulator',
    orderId,
  };
}

/**
 * Retrieve payment status by Mollie payment id
 */
export async function getPaymentStatus(paymentId) {
  if (!paymentId) return null;

  if (mollieClient && !paymentId.startsWith('tr_sim_')) {
    try {
      const payment = await mollieClient.payments.get(paymentId);
      const existing = paymentsStore.get(paymentId) || {};
      const updated = {
        ...existing,
        id: payment.id,
        status: payment.status,
        amount: payment.amount?.value,
        currency: payment.amount?.currency,
        description: payment.description,
        method: payment.method || 'Credit Card / iDEAL',
        paidAt: payment.paidAt,
        canceledAt: payment.canceledAt,
        expiredAt: payment.expiredAt,
        failedAt: payment.failedAt,
        metadata: payment.metadata,
        mode: 'mollie',
      };
      paymentsStore.set(payment.id, updated);
      return updated;
    } catch (err) {
      console.error(`Error querying Mollie for ${paymentId}:`, err.message);
      return paymentsStore.get(paymentId) || null;
    }
  }

  return paymentsStore.get(paymentId) || null;
}

/**
 * Simulator action for educational testing
 */
export function updateSimulatedStatus(paymentId, status) {
  const payment = paymentsStore.get(paymentId);
  if (!payment) return null;

  payment.status = status; // 'paid', 'canceled', 'failed'
  if (status === 'paid') payment.paidAt = new Date().toISOString();
  if (status === 'canceled') payment.canceledAt = new Date().toISOString();
  if (status === 'failed') payment.failedAt = new Date().toISOString();

  paymentsStore.set(paymentId, payment);
  return payment;
}
