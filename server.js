const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

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

// POST /api/payment - Process payment and add questions to user wallet
app.post('/api/payment', authenticateToken, async (req, res) => {
  try {
    const { payment, questionCount } = req.body;
    const userId = req.userId;

    console.log('Processing payment:', { userId, payment, questionCount });

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
      type: 'payment'
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