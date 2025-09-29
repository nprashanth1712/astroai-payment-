const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const Razorpay = require('razorpay');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_live_RNJ5ri76TyH7pe',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'i3hi1AboTliywjFE8UUBpsoi'
});

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin (you'll need to add your service account key)
// For now, using environment variables
if (!admin.apps.length) {
  try {
    // You'll need to set FIREBASE_SERVICE_ACCOUNT_KEY environment variable
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
      : null;

    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL || "https://astroai-28ea8-default-rtdb.firebaseio.com/"
      });
    } else {
      console.log('Firebase not initialized - missing service account key');
    }
  } catch (error) {
    console.log('Firebase initialization error:', error.message);
  }
}

// Authentication middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // For simplicity, we'll treat the token as the user ID
    // In production, you'd verify this is a valid Firebase token
    req.userId = token;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(403).json({ error: 'Invalid token' });
  }
};

// Helper function to get user wallet
const getUserWallet = async (userId) => {
  try {
    if (!admin.apps.length) {
      throw new Error('Firebase not initialized');
    }

    const db = admin.database();
    const walletRef = db.ref(`wallets/${userId}`);
    const snapshot = await walletRef.once('value');

    return snapshot.val() || { balance: 0, transaction: [] };
  } catch (error) {
    console.error('Error getting wallet:', error);
    throw error;
  }
};

// Helper function to update user wallet
const updateUserWallet = async (userId, walletData) => {
  try {
    if (!admin.apps.length) {
      throw new Error('Firebase not initialized');
    }

    const db = admin.database();
    const walletRef = db.ref(`wallets/${userId}`);
    await walletRef.set(walletData);

    return walletData;
  } catch (error) {
    console.error('Error updating wallet:', error);
    throw error;
  }
};

// Helper function to verify Razorpay signature
const verifyRazorpaySignature = (orderId, paymentId, signature) => {
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'i3hi1AboTliywjFE8UUBpsoi')
    .update(orderId + '|' + paymentId)
    .digest('hex');

  return expectedSignature === signature;
};

// Routes

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Laxmi Astrology Payment API',
    timestamp: new Date().toISOString(),
    firebase: admin.apps.length > 0 ? 'Connected' : 'Not connected'
  });
});

// POST /api/create-order - Create Razorpay order
app.post('/api/create-order', authenticateToken, async (req, res) => {
  try {
    const { amount, questionCount } = req.body;
    const userId = req.userId;

    console.log('Creating order:', { userId, amount, questionCount });

    if (!amount || !questionCount) {
      return res.status(400).json({
        error: 'Amount and question count are required'
      });
    }

    // Create order with Razorpay
    const options = {
      amount: parseInt(amount) * 100, // Convert to paise
      currency: 'INR',
      receipt: `ord_${Date.now()}`, // Shortened to fit 40 char limit
      notes: {
        userId: userId,
        questionCount: questionCount
      }
    };

    const order = await razorpay.orders.create(options);

    console.log('Order created successfully:', order.id);

    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID || 'rzp_live_RNJ5ri76TyH7pe'
    });

  } catch (error) {
    console.error('Order creation error:', error);
    res.status(500).json({
      error: 'Order creation failed',
      details: error.message
    });
  }
});

// POST /api/verify-payment - Verify payment and update wallet
app.post('/api/verify-payment', authenticateToken, async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      questionCount
    } = req.body;
    const userId = req.userId;

    console.log('Verifying payment:', {
      userId,
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id
    });

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        error: 'Missing payment verification data'
      });
    }

    // Verify signature
    const isValidSignature = verifyRazorpaySignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );

    if (!isValidSignature) {
      console.error('Invalid payment signature');
      return res.status(400).json({
        error: 'Payment verification failed - invalid signature'
      });
    }

    // Get payment details from Razorpay
    const payment = await razorpay.payments.fetch(razorpay_payment_id);

    if (payment.status !== 'captured') {
      return res.status(400).json({
        error: 'Payment not captured',
        status: payment.status
      });
    }

    // Get current wallet
    const currentWallet = await getUserWallet(userId);

    // Calculate new balance
    const newBalance = (currentWallet.balance || 0) + parseInt(questionCount);

    // Create transaction record
    const transaction = {
      amount: payment.amount / 100, // Convert from paise
      currency: payment.currency,
      questionCount: parseInt(questionCount),
      timestamp: new Date().toISOString(),
      type: 'payment',
      razorpayPaymentId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
      status: 'completed'
    };

    // Update wallet
    const updatedWallet = {
      balance: newBalance,
      transaction: [
        ...(currentWallet.transaction || []),
        transaction
      ]
    };

    await updateUserWallet(userId, updatedWallet);

    console.log('Payment verified and processed successfully:', { userId, newBalance });

    res.json({
      success: true,
      message: 'Payment verified and processed successfully',
      balance: newBalance,
      transaction: transaction
    });

  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({
      error: 'Payment verification failed',
      details: error.message
    });
  }
});

// POST /api/payment - Legacy endpoint (kept for backward compatibility)
app.post('/api/payment', authenticateToken, async (req, res) => {
  try {
    const { payment, questionCount, razorpayPaymentId } = req.body;
    const userId = req.userId;

    console.log('Processing payment (legacy):', { userId, payment, questionCount });

    if (!payment || !questionCount) {
      return res.status(400).json({
        error: 'Payment amount and question count are required'
      });
    }

    // Get current wallet
    const currentWallet = await getUserWallet(userId);

    // Calculate new balance
    const newBalance = (currentWallet.balance || 0) + parseInt(questionCount);

    // Create transaction record
    const transaction = {
      amount: parseInt(payment),
      currency: 'INR',
      questionCount: parseInt(questionCount),
      timestamp: new Date().toISOString(),
      type: 'payment',
      razorpayPaymentId: razorpayPaymentId || null,
      status: 'completed'
    };

    // Update wallet
    const updatedWallet = {
      balance: newBalance,
      transaction: [
        ...(currentWallet.transaction || []),
        transaction
      ]
    };

    await updateUserWallet(userId, updatedWallet);

    console.log('Payment processed successfully:', { userId, newBalance });

    res.json({
      success: true,
      message: 'Payment processed successfully',
      balance: newBalance,
      transaction: transaction
    });

  } catch (error) {
    console.error('Payment processing error:', error);
    res.status(500).json({
      error: 'Payment processing failed',
      details: error.message
    });
  }
});

// GET /api/payment/balance - Get user's current balance
app.get('/api/payment/balance', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    console.log('Getting balance for user:', userId);

    const wallet = await getUserWallet(userId);

    res.json({
      success: true,
      balance: wallet.balance || 0,
      transactions: wallet.transaction || []
    });

  } catch (error) {
    console.error('Balance fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch balance',
      details: error.message
    });
  }
});

// POST /app/api/promocode - Apply promocode (placeholder)
app.post('/app/api/promocode', authenticateToken, async (req, res) => {
  try {
    const { promocode } = req.body;

    // Placeholder implementation
    // You can implement actual promocode logic here
    res.json({
      success: false,
      message: 'Promocode feature coming soon'
    });

  } catch (error) {
    console.error('Promocode error:', error);
    res.status(500).json({
      error: 'Promocode processing failed',
      details: error.message
    });
  }
});

// POST /api/refund - Process refund
app.post('/api/refund', authenticateToken, async (req, res) => {
  try {
    const { paymentId, amount, reason } = req.body;
    const userId = req.userId;

    console.log('Processing refund:', { userId, paymentId, amount });

    if (!paymentId) {
      return res.status(400).json({
        error: 'Payment ID is required for refund'
      });
    }

    // Create refund with Razorpay
    const refundData = {
      amount: amount ? parseInt(amount) * 100 : undefined, // Convert to paise if provided
      speed: 'normal',
      receipt: `refund_${userId}_${Date.now()}`,
      notes: {
        userId: userId,
        reason: reason || 'User requested refund'
      }
    };

    const refund = await razorpay.payments.refund(paymentId, refundData);

    console.log('Refund created successfully:', refund.id);

    res.json({
      success: true,
      refundId: refund.id,
      amount: refund.amount / 100, // Convert from paise
      status: refund.status,
      message: 'Refund initiated successfully'
    });

  } catch (error) {
    console.error('Refund processing error:', error);
    res.status(500).json({
      error: 'Refund processing failed',
      details: error.message
    });
  }
});

// POST /webhook/razorpay - Handle Razorpay webhooks
app.post('/webhook/razorpay', express.raw({type: 'application/json'}), (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const webhookSignature = req.headers['x-razorpay-signature'];

    if (!webhookSecret) {
      console.log('Webhook secret not configured, skipping verification');
    } else {
      // Verify webhook signature
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(req.body)
        .digest('hex');

      if (expectedSignature !== webhookSignature) {
        console.error('Invalid webhook signature');
        return res.status(400).json({ error: 'Invalid signature' });
      }
    }

    const event = JSON.parse(req.body);

    console.log('Received webhook:', event.event, event.payload.payment?.entity?.id);

    // Handle different webhook events
    switch (event.event) {
      case 'payment.captured':
        console.log('Payment captured:', event.payload.payment.entity.id);
        // Additional processing if needed
        break;

      case 'payment.failed':
        console.log('Payment failed:', event.payload.payment.entity.id);
        // Handle failed payment
        break;

      case 'refund.created':
        console.log('Refund created:', event.payload.refund.entity.id);
        // Handle refund creation
        break;

      case 'dispute.created':
        console.log('Dispute created:', event.payload.dispute.entity.id);
        // Handle dispute creation
        break;

      default:
        console.log('Unhandled webhook event:', event.event);
    }

    res.json({ success: true });

  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// POST /app/api/refer - Handle referrals (placeholder)
app.post('/app/api/refer', authenticateToken, async (req, res) => {
  try {
    const { referralCode } = req.body;

    // Placeholder implementation
    res.json({
      success: false,
      message: 'Referral feature coming soon'
    });

  } catch (error) {
    console.error('Referral error:', error);
    res.status(500).json({
      error: 'Referral processing failed',
      details: error.message
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    details: error.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Laxmi Astrology Payment API running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/`);
  console.log(`💳 Payment endpoint: http://localhost:${PORT}/api/payment`);
  console.log(`💰 Balance endpoint: http://localhost:${PORT}/api/payment/balance`);
});