import React, { useState } from 'react';
import { X, Trash2, Plus, Minus, CreditCard, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';

export default function CartDrawer({
  isOpen,
  onClose,
  cartItems,
  onUpdateQuantity,
  onRemoveItem,
  onProceedToPayment,
  isProcessing,
}) {
  const [customer, setCustomer] = useState({
    name: 'Vishal Tester',
    email: 'vishal.test@example.com',
    phone: '+31 6 12345678',
    address: 'Keizersgracht 421, 1016 EK Amsterdam',
  });

  const [formErrors, setFormErrors] = useState({});

  if (!isOpen) return null;

  const subtotal = cartItems.reduce(
    (sum, item) => sum + parseFloat(item.price) * item.quantity,
    0
  );
  const total = subtotal;

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setCustomer((prev) => ({ ...prev, [name]: value }));
    if (formErrors[name]) {
      setFormErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errors = {};
    if (!customer.name.trim()) errors.name = 'Name is required';
    if (!customer.email.trim()) errors.email = 'Email is required';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    onProceedToPayment({
      customer,
      items: cartItems.map((item) => ({
        productId: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
      })),
      totalAmount: total,
    });
  };

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div className="drawer-title-box">
            <h2>Your Shopping Cart</h2>
            <span className="items-count-tag">{cartItems.length} items</span>
          </div>
          <button type="button" className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {cartItems.length === 0 ? (
          <div className="empty-cart">
            <div className="empty-cart-icon">🛒</div>
            <h3>Your cart is empty</h3>
            <p>Add some products from the catalog to test the payment gateway flow!</p>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Browse Products
            </button>
          </div>
        ) : (
          <div className="drawer-body">
            {/* Items list */}
            <div className="cart-items-list">
              {cartItems.map((item) => (
                <div key={item.id} className="cart-item">
                  <img src={item.image_url} alt={item.name} className="cart-item-img" />
                  <div className="cart-item-details">
                    <h4 className="cart-item-title">{item.name}</h4>
                    <span className="cart-item-price">€{parseFloat(item.price).toFixed(2)}</span>
                    
                    <div className="cart-qty-controls">
                      <button 
                        type="button" 
                        className="qty-btn"
                        onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                      >
                        <Minus size={14} />
                      </button>
                      <span className="qty-number">{item.quantity}</span>
                      <button 
                        type="button" 
                        className="qty-btn"
                        onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                      >
                        <Plus size={14} />
                      </button>

                      <button 
                        type="button" 
                        className="remove-item-btn"
                        onClick={() => onRemoveItem(item.id)}
                        title="Remove item"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="cart-item-subtotal">
                    €{(parseFloat(item.price) * item.quantity).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>

            {/* Customer Details Form */}
            <form onSubmit={handleSubmit} className="checkout-form">
              <h3 className="section-subtitle">Customer & Delivery Info</h3>
              
              <div className="form-group">
                <label>Full Name *</label>
                <input
                  type="text"
                  name="name"
                  value={customer.name}
                  onChange={handleInputChange}
                  placeholder="e.g. John Doe"
                  className={formErrors.name ? 'input-error' : ''}
                />
                {formErrors.name && <span className="error-text">{formErrors.name}</span>}
              </div>

              <div className="form-group">
                <label>Email Address (for Receipt) *</label>
                <input
                  type="email"
                  name="email"
                  value={customer.email}
                  onChange={handleInputChange}
                  placeholder="e.g. john@example.com"
                  className={formErrors.email ? 'input-error' : ''}
                />
                {formErrors.email && <span className="error-text">{formErrors.email}</span>}
              </div>

              <div className="form-group">
                <label>Delivery Address</label>
                <input
                  type="text"
                  name="address"
                  value={customer.address}
                  onChange={handleInputChange}
                  placeholder="Street and City"
                />
              </div>

              {/* Order summary totals */}
              <div className="order-summary-box">
                <div className="summary-row">
                  <span>Subtotal</span>
                  <span>€{subtotal.toFixed(2)}</span>
                </div>
                <div className="summary-row">
                  <span>Shipping</span>
                  <span className="free-shipping">FREE</span>
                </div>
                <div className="summary-row total-row">
                  <span>Total Amount</span>
                  <span>€{total.toFixed(2)}</span>
                </div>
              </div>

              {/* The Payment Trigger Button */}
              <div className="payment-trigger-section">
                <button
                  type="submit"
                  className="pay-trigger-button"
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <>
                      <span className="spinner"></span>
                      <span>Creating Order & Triggering Payment API...</span>
                    </>
                  ) : (
                    <>
                      <CreditCard size={20} />
                      <span>Proceed to Payment (€{total.toFixed(2)})</span>
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
                <div className="payment-note">
                  <ShieldCheck size={14} />
                  <span>Triggers <code>POST /api/payments/create-session</code> on click</span>
                </div>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
