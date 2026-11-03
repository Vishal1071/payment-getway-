import pg from 'pg';
import 'dotenv/config';
import { pool, dbConfig } from './index.js';

const { Client } = pg;
const targetDb = process.env.DATABASE || 'eCommerce';

/**
 * Ensures the target database exists; if not, creates it using default postgres connection.
 */
async function ensureDatabaseExists() {
  const rootClient = new Client({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: 'postgres',
  });

  try {
    await rootClient.connect();
    const res = await rootClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [targetDb]
    );

    if (res.rowCount === 0) {
      console.log(`Database "${targetDb}" does not exist. Creating...`);
      await rootClient.query(`CREATE DATABASE "${targetDb}"`);
      console.log(` Database "${targetDb}" created successfully!`);
    } else {
      console.log(` Database "${targetDb}" already exists.`);
    }
  } catch (err) {
    console.error(`Database check notice:`, err.message);
  } finally {
    try {
      await rootClient.end();
    } catch (_) {}
  }
}

/**
 * Creates the required eCommerce and Payment tables
 */
export async function initializeDatabase() {
  await ensureDatabaseExists();

  try {
    const client = await pool.connect();
    console.log(` Connected to PostgreSQL database "${targetDb}".`);

    // 1. Products table
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price NUMERIC(10, 2) NOT NULL,
        image_url TEXT,
        category VARCHAR(100) DEFAULT 'Electronics',
        stock INT DEFAULT 50,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Orders table
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        order_number VARCHAR(100) UNIQUE NOT NULL,
        customer_name VARCHAR(255) NOT NULL,
        customer_email VARCHAR(255) NOT NULL,
        customer_phone VARCHAR(50),
        shipping_address TEXT,
        total_amount NUMERIC(10, 2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'EUR',
        status VARCHAR(50) DEFAULT 'PENDING',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Order Items table
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INT REFERENCES orders(id) ON DELETE CASCADE,
        product_id INT REFERENCES products(id),
        product_name VARCHAR(255) NOT NULL,
        price NUMERIC(10, 2) NOT NULL,
        quantity INT NOT NULL,
        subtotal NUMERIC(10, 2) NOT NULL
      );
    `);

    // 4. Payments table - ready for storing transactions from Mollie, Stripe, Razorpay, etc.
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        order_id INT REFERENCES orders(id) ON DELETE CASCADE,
        payment_gateway VARCHAR(50) DEFAULT 'mollie',
        transaction_id VARCHAR(255),
        amount NUMERIC(10, 2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'EUR',
        status VARCHAR(50) DEFAULT 'PENDING',
        payment_method VARCHAR(50),
        gateway_response JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Seed dummy products if table is empty
    const productCountRes = await client.query('SELECT COUNT(*) FROM products');
    if (parseInt(productCountRes.rows[0].count, 10) === 0) {
      console.log(' Seeding sample products into "products" table...');
      const sampleProducts = [
        {
          name: 'Sony WH-1000XM5 Wireless Headphones',
          description: 'Industry-leading noise cancellation with high-resolution sound and 30-hour battery life.',
          price: 349.99,
          image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=80',
          category: 'Audio',
          stock: 25,
        },
        {
          name: 'Mechanical Gaming Keyboard RGB',
          description: 'Custom hot-swappable tactile switches with aluminum top frame and PBT keycaps.',
          price: 119.50,
          image_url: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=600&auto=format&fit=crop&q=80',
          category: 'Peripherals',
          stock: 40,
        },
        {
          name: 'Ultra-light Wireless Mouse',
          description: 'Sub-60g lightweight design with precision 26K DPI optical sensor and ultra-fast wireless.',
          price: 69.00,
          image_url: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=600&auto=format&fit=crop&q=80',
          category: 'Peripherals',
          stock: 60,
        },
        {
          name: 'Smart Fitness & Health Watch Pro',
          description: 'Always-on AMOLED display, heart rate, SPO2 monitoring, and 7-day battery life.',
          price: 199.00,
          image_url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80',
          category: 'Wearables',
          stock: 35,
        },
        {
          name: 'Waterproof Commuter Backpack 25L',
          description: 'Weatherproof Oxford canvas with dedicated 16-inch padded laptop compartment.',
          price: 54.99,
          image_url: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&auto=format&fit=crop&q=80',
          category: 'Lifestyle',
          stock: 50,
        },
        {
          name: 'Minimalist Aluminum Laptop Stand',
          description: 'Ergonomic ventilated riser suitable for MacBook and Windows laptops.',
          price: 39.99,
          image_url: 'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=600&auto=format&fit=crop&q=80',
          category: 'Accessories',
          stock: 80,
        },
      ];

      for (const p of sampleProducts) {
        await client.query(
          `INSERT INTO products (name, description, price, image_url, category, stock)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [p.name, p.description, p.price, p.image_url, p.category, p.stock]
        );
      }
      console.log(' 6 Sample products seeded successfully.');
    }

    client.release();
    console.log(' Database initialization complete! All tables ready.');
  } catch (err) {
    console.error(' Error setting up database tables:', err.message);
    throw err;
  }
}
