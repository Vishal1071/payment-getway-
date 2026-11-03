import React from 'react';
import { ShoppingCart, Check } from 'lucide-react';

export default function ProductCard({ product, inCartCount, onAddToCart }) {
  const price = parseFloat(product.price).toFixed(2);

  return (
    <div className="product-card">
      <div className="product-image-wrap">
        <img 
          src={product.image_url} 
          alt={product.name} 
          className="product-image"
          loading="lazy"
        />
        <span className="product-category">{product.category}</span>
      </div>

      <div className="product-content">
        <h3 className="product-name">{product.name}</h3>
        <p className="product-desc">{product.description}</p>

        <div className="product-footer">
          <div className="product-price-box">
            <span className="currency-symbol">€</span>
            <span className="product-price">{price}</span>
          </div>

          <button
            type="button"
            className={`add-cart-btn ${inCartCount > 0 ? 'in-cart' : ''}`}
            onClick={() => onAddToCart(product)}
          >
            {inCartCount > 0 ? (
              <>
                <Check size={16} />
                <span>Added ({inCartCount})</span>
              </>
            ) : (
              <>
                <ShoppingCart size={16} />
                <span>Add to Cart</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
