import React from 'react';
import { ShoppingCart, ShieldCheck, Code, Sparkles } from 'lucide-react';

export default function Navbar({ cartCount, onOpenCart }) {
  return (
    <header className="navbar">
      <div className="nav-container">
        <div className="logo-brand">
          <div className="logo-icon">
            <Sparkles size={22} className="text-primary" />
          </div>
          <div>
            <h1 className="logo-title">DevShop</h1>
          </div>
        </div>

        <div className="nav-actions">

          <button 
            type="button" 
            className="cart-btn"
            onClick={onOpenCart}
            aria-label="Open Shopping Cart"
          >
            <ShoppingCart size={20} />
            <span className="cart-text">Cart</span>
            {cartCount > 0 && (
              <span className="cart-badge">{cartCount}</span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
