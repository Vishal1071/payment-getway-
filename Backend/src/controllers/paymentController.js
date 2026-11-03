
import { query } from '../db/index.js';
import { createMollieClient } from '@mollie/api-client';

// Initialize Mollie client lazily so environment variables are loaded first.
let mollieClient;

function getMollieClient() {
  if (!process.env.MOLLIE_API_KEY) {
    throw new Error('MOLLIE_API_KEY is not configured');
  }

  if (!mollieClient) {
    mollieClient = createMollieClient({
      apiKey: process.env.MOLLIE_API_KEY,
    });
  }

  return mollieClient;
}

// Convert database amount into Mollie's decimal amount format.
function formatAmount(amount) {
  const value = Number(amount);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Invalid payment amount');
  }

  return value.toFixed(2);
}

// Map Mollie status to our database status.
function mapPaymentStatus(status) {
  const statusMap = {
    open: 'OPEN',
    pending: 'PENDING',
    authorized: 'AUTHORIZED',
    paid: 'PAID',
    failed: 'FAILED',
    canceled: 'CANCELED',
    expired: 'EXPIRED',
  };

  return statusMap[status] || status.toUpperCase();
}

// Validate payment against the original order.
function validatePayment(payment, order) {
  const expectedAmount = formatAmount(order.total_amount);
  const actualAmount = formatAmount(payment.amount.value);

  if (
    expectedAmount !== actualAmount ||
    order.currency.toUpperCase() !== payment.amount.currency.toUpperCase()
  ) {
    throw new Error('Payment amount or currency does not match the order');
  }

  if (String(payment.metadata?.orderId) !== String(order.id)) {
    throw new Error('Payment does not belong to this order');
  }
}

// Synchronize payment and order status with Mollie.
async function syncPaymentStatus(payment) {
  const orderId = payment.metadata?.orderId;

  if (!orderId) {
    throw new Error('Order ID missing from Mollie payment metadata');
  }

  const orderResult = await query(
    'SELECT * FROM orders WHERE id = $1',
    [orderId]
  );

  if (orderResult.rowCount === 0) {
    throw new Error(`Order ${orderId} not found`);
  }

  const order = orderResult.rows[0];

  validatePayment(payment, order);

  const paymentStatus = mapPaymentStatus(payment.status);

  // Update only the matching Mollie payment attempt.
  const paymentResult = await query(
    `UPDATE payments
     SET status = $1,
         gateway_response = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE transaction_id = $3
       AND order_id = $4
     RETURNING id`,
    [
      paymentStatus,
      JSON.stringify(payment),
      payment.id,
      orderId,
    ]
  );

  if (paymentResult.rowCount === 0) {
    throw new Error(`Payment record ${payment.id} not found`);
  }

  // Never mark an order completed unless Mollie confirms payment.
  if (payment.status === 'paid') {
    await query(
      `UPDATE orders
       SET status = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      ['COMPLETED', orderId]
    );
  }

  return {
    orderId,
    paymentId: payment.id,
    paymentStatus,
  };
}

/**
 * CREATE PAYMENT SESSION
 */
export async function createPaymentSession(req, res) {
  try {
    const { orderId } = req.body ?? {};

    if (
      !Number.isSafeInteger(Number(orderId)) ||
      Number(orderId) <= 0 ||
      Number(orderId) > 2147483647
    ) {
      return res.status(400).json({
        success: false,
        error: 'A valid order ID is required',
      });
    }

    if (!process.env.FRONTEND_URL) {
      return res.status(503).json({
        success: false,
        error: 'FRONTEND_URL is not configured',
      });
    }

    // Fetch order from PostgreSQL.
    const orderResult = await query(
      'SELECT * FROM orders WHERE id = $1',
      [orderId]
    );

    if (orderResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    const order = orderResult.rows[0];

    // Do not create another payment for an already completed order.
    if (order.status === 'COMPLETED') {
      return res.status(400).json({
        success: false,
        error: 'This order is already completed',
      });
    }

    const amount = formatAmount(order.total_amount);
    const currency = order.currency.toUpperCase();

    console.log(`Creating Mollie payment for order ${order.order_number}`);

    // Create payment with Mollie.
    const paymentPayload = {
      amount: {
        currency,
        value: amount,
      },

      description: `Payment for Order ${order.order_number}`,

      redirectUrl:
        `${process.env.FRONTEND_URL.replace(/\/+$/, '')}/payment-result?orderId=${encodeURIComponent(order.id)}`,

      metadata: {
        orderId: String(order.id),
        orderNumber: String(order.order_number),
      },
    };

    if (process.env.BACKEND_URL) {
      paymentPayload.webhookUrl =
        `${process.env.BACKEND_URL.replace(/\/+$/, '')}/api/payments/webhook`;
    }

    const payment = await getMollieClient().payments.create(paymentPayload);

    const checkoutUrl = payment.getCheckoutUrl();

    if (!checkoutUrl) {
      throw new Error('Mollie checkout URL was not returned');
    }

    // Save payment attempt.
    await query(
      `INSERT INTO payments (
        order_id,
        payment_gateway,
        transaction_id,
        amount,
        currency,
        status,
        gateway_response
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        order.id,
        'mollie',
        payment.id,
        amount,
        currency,
        mapPaymentStatus(payment.status),
        JSON.stringify(payment),
      ]
    );

    return res.status(201).json({
      success: true,
      gateway: 'mollie',
      message: 'Payment session created successfully',
      checkoutUrl,
      paymentId: payment.id,
      transactionId: payment.id,
      orderId: order.id,
      order: {
        id: order.id,
        orderNumber: order.order_number,
        customerName: order.customer_name,
        amount,
        currency,
      },
    });

  } catch (error) {
    console.error('Payment creation error:', error);

    return res.status(500).json({
      success: false,
      error: 'Failed to create payment session',
    });
  }
}

/**
 * VERIFY PAYMENT
 */
export async function verifyPayment(req, res) {
  try {
    const { orderId, transactionId } = req.body ?? {};

    if (
      !Number.isSafeInteger(Number(orderId)) ||
      Number(orderId) <= 0 ||
      Number(orderId) > 2147483647 ||
      typeof transactionId !== 'string' ||
      !transactionId
    ) {
      return res.status(400).json({
        success: false,
        error: 'A valid order ID and transaction ID are required',
      });
    }

    // Ensure this payment attempt belongs to the requested order.
    const existingPayment = await query(
      `SELECT id
       FROM payments
       WHERE order_id = $1
         AND transaction_id = $2
         AND payment_gateway = $3`,
      [orderId, transactionId, 'mollie']
    );

    if (existingPayment.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Payment record not found',
      });
    }

    // Retrieve actual payment status from Mollie.
    const payment = await getMollieClient().payments.get(transactionId);

    if (String(payment.metadata?.orderId) !== String(orderId)) {
      return res.status(400).json({
        success: false,
        error: 'Payment does not belong to this order',
      });
    }

    const result = await syncPaymentStatus(payment);

    return res.status(200).json({
      success: true,
      message: 'Payment status retrieved successfully',
      data: result,
    });

  } catch (error) {
    console.error('Payment verification error:', error);

    return res.status(500).json({
      success: false,
      error: 'Failed to verify payment',
    });
  }
}

/**
 * MOLLLIE WEBHOOK
 */
export async function handlePaymentWebhook(req, res) {
  try {
    const paymentId = req.body?.id;

    if (!paymentId) {
      return res.status(400).send('Payment ID is required');
    }

    console.log(`Mollie webhook received: ${paymentId}`);

    // Never trust the webhook body for payment status.
    // Retrieve the actual payment from Mollie.
    const payment = await getMollieClient().payments.get(paymentId);

    const result = await syncPaymentStatus(payment);

    console.log('Payment synchronized:', result);

    return res.status(200).send('Webhook processed successfully');

  } catch (error) {
    console.error('Mollie webhook error:', error);

    // Return an error so Mollie can retry the notification.
    return res.status(500).send('Webhook processing failed');
  }
}

/**
 * GET PAYMENT LOGS
 */
export async function getPaymentLogs(req, res) {
  try {
    const result = await query(
      `SELECT
         p.*,
         o.order_number,
         o.customer_name,
         o.customer_email
       FROM payments p
       LEFT JOIN orders o ON p.order_id = o.id
       ORDER BY p.created_at DESC
       LIMIT 50`
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
    });

  } catch (error) {
    console.error('Payment logs error:', error);

    return res.status(500).json({
      success: false,
      error: 'Failed to fetch payment logs',
    });
  }
}
