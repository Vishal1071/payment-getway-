import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar.jsx';
import ProductCard from './components/ProductCard.jsx';
import CartDrawer from './components/CartDrawer.jsx';
import PaymentModal from './components/PaymentModal.jsx';
import { AlertCircle, RefreshCw } from 'lucide-react';
import './App.css';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5002')
  .replace(/\/+$/, '');

function App() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [dbStatus, setDbStatus] = useState(false);
  
  // Payment flow state
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentData, setPaymentData] = useState(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [paymentResult, setPaymentResult] = useState(null);

  // Notification toast
  const [toast, setToast] = useState(null);

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  // Fetch products from backend (PostgreSQL)
  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/products`);
      const data = await res.json();
      if (data.success) {
        setProducts(data.data);
        setDbStatus(true);
      } else {
        console.error('Failed to load products:', data.error);
        setDbStatus(false);
      }
    } catch (err) {
      console.error('API connection error:', err);
      setDbStatus(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  // Cart operations
  const handleAddToCart = (product) => {
    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.id === product.id);
      if (existing) {
        return prevCart.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prevCart, { ...product, quantity: 1 }];
    });
    showToast(`Added "${product.name}" to cart! 🛍️`);
  };

  const handleUpdateQuantity = (productId, newQty) => {
    if (newQty <= 0) {
      handleRemoveItem(productId);
      return;
    }
    setCart((prevCart) =>
      prevCart.map((item) =>
        item.id === productId ? { ...item, quantity: newQty } : item
      )
    );
  };

  const handleRemoveItem = (productId) => {
    setCart((prevCart) => prevCart.filter((item) => item.id !== productId));
  };

  // PAYMENT TRIGGER: Calls the backend to create order & initiate payment gateway
  const handleProceedToPayment = async ({ customer, items }) => {
    setIsProcessingPayment(true);
    setPaymentResult(null);
    
    try {
      // Step 1: Create Order in PostgreSQL
      const orderResponse = await fetch(`${API_BASE}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customer.name,
          customerEmail: customer.email,
          customerPhone: customer.phone,
          shippingAddress: customer.address,
          items: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        }),
      });

      const orderData = await orderResponse.json();
      if (!orderData.success) {
        throw new Error(orderData.error || 'Failed to create order in database');
      }

      const createdOrder = orderData.data;

      // Step 2: Trigger Payment Session on Backend
      const paymentResponse = await fetch(`${API_BASE}/api/payments/create-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: createdOrder.orderId,
        }),
      });

      const paymentSessionData = await paymentResponse.json();
      if (!paymentSessionData.success) {
        throw new Error(paymentSessionData.error || 'Failed to initiate payment session');
      }

      // Step 3: Open Payment Modal to inspect response and test next steps
      setPaymentData({
        ...paymentSessionData,
        transactionId: paymentSessionData.paymentId,
      });
      setIsPaymentModalOpen(true);
      setIsCartOpen(false);
      // Clear cart once order is placed
      setCart([]);

      // If user has implemented Mollie or another gateway and returned a checkoutUrl,
      // they can open it immediately from the modal!
    } catch (err) {
      console.error('Payment flow error:', err);
      alert(`Payment Trigger Error: ${err.message}`);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleVerifyPayment = async (orderId, transactionId) => {
    setIsVerifying(true);
    try {
      const res = await fetch(`${API_BASE}/api/payments/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          transactionId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to verify payment');
      }
      setPaymentResult({
        status: data.data.paymentStatus,
        message: data.message,
      });
    } catch (err) {
      console.error('Verify error:', err);
      setPaymentResult({
        status: 'error',
        message: err.message,
      });
    } finally {
      setIsVerifying(false);
    }
  };

  useEffect(() => {
    if (window.location.pathname !== '/payment-result') return;

    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('orderId');
    const transactionId = params.get('id');

    if (!orderId || !transactionId) return;

    const verifyRedirectedPayment = async () => {
      setIsVerifying(true);

      try {
        const [verifyResponse, orderResponse] = await Promise.all([
          fetch(`${API_BASE}/api/payments/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId, transactionId }),
          }),
          fetch(`${API_BASE}/api/orders/${encodeURIComponent(orderId)}`),
        ]);
        const [verifyData, orderData] = await Promise.all([
          verifyResponse.json(),
          orderResponse.json(),
        ]);

        if (!verifyResponse.ok || !verifyData.success) {
          throw new Error(verifyData.error || 'Failed to verify payment');
        }
        if (!orderResponse.ok || !orderData.success) {
          throw new Error(orderData.error || 'Failed to load order details');
        }

        setPaymentData({
          order: {
            id: orderData.data.id,
            orderNumber: orderData.data.order_number,
            customerName: orderData.data.customer_name,
            amount: orderData.data.total_amount,
            currency: orderData.data.currency,
          },
          orderId,
          paymentId: transactionId,
          transactionId,
        });
        setPaymentResult({
          status: verifyData.data.paymentStatus,
          message: verifyData.message,
        });
        setIsPaymentModalOpen(true);
      } catch (error) {
        console.error('Payment return verification error:', error);
        setPaymentResult({ status: 'error', message: error.message });
      } finally {
        setIsVerifying(false);
      }
    };

    verifyRedirectedPayment();
  }, []);

  const categories = ['All', ...new Set(products.map((p) => p.category))];
  const filteredProducts =
    selectedCategory === 'All'
      ? products
      : products.filter((p) => p.category === selectedCategory);

  const cartTotalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="app-container">
      {/* Navbar */}
      <Navbar
        cartCount={cartTotalItems}
        onOpenCart={() => setIsCartOpen(true)}
        dbStatus={dbStatus}
      />

      {/* Toast alert */}
      {toast && <div className="toast-notification">{toast}</div>}

      {/* Main Content: Category filter & Product Grid */}
      <main className="main-content">
        <div className="catalog-header">
          <div className="catalog-title-box">
            <h2>Featured Products</h2>
          </div>

          {/* Filter Pills */}
          <div className="category-pills">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                className={`category-pill ${selectedCategory === category ? 'active' : ''}`}
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="loading-state">
            <RefreshCw size={28} className="spinner-icon" />
            <p>Connecting to PostgreSQL database & loading products...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="empty-state">
            <AlertCircle size={32} />
            <h3>No products found in database</h3>
            <p>Make sure PostgreSQL is running on port 5432 and the Backend server is started.</p>
            <button type="button" className="btn-primary" onClick={fetchProducts}>
              Retry Connection
            </button>
          </div>
        ) : (
          <div className="products-grid">
            {filteredProducts.map((product) => {
              const cartItem = cart.find((item) => item.id === product.id);
              const inCartCount = cartItem ? cartItem.quantity : 0;
              return (
                <ProductCard
                  key={product.id}
                  product={product}
                  inCartCount={inCartCount}
                  onAddToCart={handleAddToCart}
                />
              );
            })}
          </div>
        )}
      </main>

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={cart}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onProceedToPayment={handleProceedToPayment}
        isProcessing={isProcessingPayment}
      />

      {/* Payment Response & Verification Modal */}
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        paymentData={paymentData}
        onVerifyPayment={handleVerifyPayment}
        isVerifying={isVerifying}
        paymentResult={paymentResult}
      />

      {/* Footer */}
      <footer className="footer">
        <p>
          🚀 <strong>DevShop</strong> &mdash; eCommerce Payment Gateway Learning Project. PostgreSQL + Express + React.
        </p>
      </footer>
    </div>
  );
}

export default App;
