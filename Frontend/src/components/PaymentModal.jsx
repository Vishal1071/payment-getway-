import React from 'react';
import { 
  X, 
  CheckCircle2, 
  ExternalLink, 
  Database, 
  CreditCard, 
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

export default function PaymentModal({
  isOpen,
  onClose,
  paymentData,
  onVerifyPayment,
  isVerifying,
  paymentResult,
}) {
  if (!isOpen || !paymentData) return null;

  const { order, checkoutUrl, transactionId } = paymentData;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-box">
            <div className="payment-icon-wrap">
              <CreditCard size={22} />
            </div>
            <div>
              <h3>Payment status</h3>
              <p>Payment status is retrieved directly from Mollie</p>
            </div>
          </div>
          <button type="button" className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {/* Order Details in DB */}
          <div className="db-summary-card">
            <div className="db-summary-header">
              <Database size={16} />
              <span>Created in PostgreSQL</span>
            </div>
            <div className="db-grid">
              <div>
                <span className="db-label">Order ID (DB):</span>
                <span className="db-value">#{order?.id}</span>
              </div>
              <div>
                <span className="db-label">Order Number:</span>
                <span className="db-value">{order?.orderNumber}</span>
              </div>
              <div>
                <span className="db-label">Customer:</span>
                <span className="db-value">{order?.customerName}</span>
              </div>
              <div>
                <span className="db-label">Amount:</span>
                <span className="db-value">€{parseFloat(order?.amount).toFixed(2)} {order?.currency}</span>
              </div>
              <div>
                <span className="db-label">Transaction ID:</span>
                <span className="db-value text-mono">{transactionId || 'None yet'}</span>
              </div>
              <div>
                <span className="db-label">Status:</span>
                <span className={`status-pill ${paymentResult ? paymentResult.status : 'status-pending'}`}>
                  {paymentResult ? paymentResult.status : 'PENDING'}
                </span>
              </div>
            </div>
          </div>

          {/* If Mollie or Gateway Checkout URL is returned */}
          {checkoutUrl ? (
            <div className="checkout-redirect-card">
              <h4>🚀 Gateway Checkout URL Ready</h4>
              <p>Your payment gateway returned a hosted checkout page URL:</p>
              <a 
                href={checkoutUrl} 
                target="_blank" 
                rel="noreferrer" 
                className="btn-gateway-redirect"
              >
                <span>Continue to Mollie checkout</span>
                <ExternalLink size={18} />
              </a>
            </div>
          ) : null}

          {/* Verify the authoritative status with the payment provider. */}
          <div className="verification-testing-box">
            <h4>Check payment status</h4>
            <p className="subtext">
              Return here after checkout, or refresh the status while payment is pending.
            </p>

            <div className="verify-action-buttons">
              <button
                type="button"
                className="btn-verify-success"
                onClick={() => onVerifyPayment(order?.id, transactionId)}
                disabled={isVerifying || !transactionId}
              >
                <RefreshCw size={16} />
                <span>{isVerifying ? 'Checking...' : 'Refresh payment status'}</span>
              </button>
            </div>

            {paymentResult && (
              <div className="verification-feedback">
                {paymentResult.status === 'PAID' ? (
                  <CheckCircle2 size={18} className="text-success" />
                ) : (
                  <AlertCircle size={18} />
                )}
                <span>{paymentResult.message}</span>
              </div>
            )}
          </div>

          {/* Raw JSON inspection */}
          <div className="raw-response-box">
            <span className="raw-title">API Response JSON:</span>
            <pre>{JSON.stringify(paymentData, null, 2)}</pre>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
