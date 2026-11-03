import { query } from '../db/index.js';

/**
 * GET /api/products
 * Fetch all products from the PostgreSQL database
 */
export async function getAllProducts(req, res) {
  try {
    const result = await query(
      'SELECT id, name, description, price, image_url, category, stock, created_at FROM products ORDER BY id ASC'
    );
    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows,
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch products from database',
    });
  }
}

/**
 * GET /api/products/:id
 * Fetch single product by ID
 */
export async function getProductById(req, res) {
  try {
    const { id } = req.params;
    const result = await query(
      'SELECT id, name, description, price, image_url, category, stock, created_at FROM products WHERE id = $1',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error fetching product by ID:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch product',
    });
  }
}
