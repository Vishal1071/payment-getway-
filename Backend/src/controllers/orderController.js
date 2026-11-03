import { pool, query } from '../db/index.js';

/**
 * POST /api/orders
 * Creates an order in PostgreSQL with order_items
 * Request Body:
 * {
 *   customerName: "Vishal",
 *   customerEmail: "vishal@example.com",
 *   customerPhone: "+1234567890",
 *   shippingAddress: "123 Main St, Amsterdam",
 *   items: [{ productId: 1, quantity: 1 }]
 * }
 */
export async function createOrder(req, res) {
  const {
    customerName,
    customerEmail,
    customerPhone = '',
    shippingAddress = '',
    items,
  } = req.body ?? {};

  if (!customerName || !customerEmail) {
    return res.status(400).json({
      success: false,
      error: 'Customer name and email are required',
    });
  }
console.log("Order Items:", items);

  if (
    !Array.isArray(items) ||
    items.length === 0 ||
    items.some((item) =>
      !item ||
      !Number.isSafeInteger(Number(item.productId)) ||
      Number(item.productId) <= 0 ||
      Number(item.productId) > 2147483647 ||
      !Number.isSafeInteger(Number(item.quantity)) ||
      Number(item.quantity) <= 0 ||
      Number(item.quantity) > 2147483647
    )
  ) {
    return res.status(400).json({
      success: false,
      error: 'Order items must include valid product IDs and positive integer quantities',
    });
  }

  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

    await client.query('BEGIN');
    transactionStarted = true;

    const productIds = [...new Set(items.map((item) => Number(item.productId)))];
    const productsResult = await client.query(
      'SELECT id, name, price FROM products WHERE id = ANY($1::int[]) FOR SHARE',
      [productIds]
    );
    const productsById = new Map(
      productsResult.rows.map((product) => [product.id, product])
    );

    if (productsById.size !== productIds.length) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(400).json({
        success: false,
        error: 'One or more products do not exist',
      });
    }

    const orderItems = items.map((item) => {
      const product = productsById.get(Number(item.productId));
      const priceInCents = Math.round(Number(product.price) * 100);
      const quantity = Number(item.quantity);

      return {
        product,
        quantity,
        priceInCents,
        subtotalInCents: priceInCents * quantity,
      };
    });
    const totalInCents = orderItems.reduce(
      (sum, item) => sum + item.subtotalInCents,
      0
    );

    if (!Number.isSafeInteger(totalInCents) || totalInCents > 9999999999) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(400).json({
        success: false,
        error: 'Order total exceeds the supported amount',
      });
    }

    const formatCents = (value) => (value / 100).toFixed(2);

    // 1. Insert order
    const orderInsertQuery = `
      INSERT INTO orders (
        order_number, customer_name, customer_email, customer_phone, shipping_address, total_amount, currency, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;
    const orderRes = await client.query(orderInsertQuery, [
      orderNumber,
      customerName,
      customerEmail,
      customerPhone,
      shippingAddress,
      formatCents(totalInCents),
      'EUR',
      'PENDING',
    ]);

    const createdOrder = orderRes.rows[0];

    // 2. Insert order items
    for (const item of orderItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, price, quantity, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          createdOrder.id,
          item.product.id,
          item.product.name,
          formatCents(item.priceInCents),
          item.quantity,
          formatCents(item.subtotalInCents),
        ]
      );
    }

    await client.query('COMMIT');
    transactionStarted = false;

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: {
        orderId: createdOrder.id,
        orderNumber: createdOrder.order_number,
        totalAmount: createdOrder.total_amount,
        currency: createdOrder.currency,
        status: createdOrder.status,
        customerName: createdOrder.customer_name,
        customerEmail: createdOrder.customer_email,
        itemsCount: items.length,
      },
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK');
    }
    console.error('Error creating order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create order',
      details: error.message,
    });
  } finally {
    client.release();
  }
}

/**
 * GET /api/orders/:id
 * Retrieve order details, items, and associated payment records
 */
export async function getOrderById(req, res) {
  try {
    const { id } = req.params;

    const orderRes = await query('SELECT * FROM orders WHERE id = $1', [id]);
    if (orderRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    const order = orderRes.rows[0];

    const itemsRes = await query('SELECT * FROM order_items WHERE order_id = $1', [id]);
    const paymentsRes = await query('SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC', [id]);

    res.json({
      success: true,
      data: {
        ...order,
        items: itemsRes.rows,
        payments: paymentsRes.rows,
      },
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch order',
    });
  }
}
