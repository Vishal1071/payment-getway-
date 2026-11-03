import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

export const dbConfig = {
  host: process.env.DATABASEHOST || 'localhost',
  port: parseInt(process.env.DATABASEPORT || '5432', 10),
  user: process.env.DATABASEUSERNAME || 'postgres',
  password: process.env.DATABASEPASSWORD || 'vishal@123',
  database: process.env.DATABASE || 'eCommerce',
};

export const pool = new Pool(dbConfig);

// Helper query function with error logging
export const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    // console.log('executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Database query error:', error.message);
    throw error;
  }
};

export default {
  pool,
  query,
};
