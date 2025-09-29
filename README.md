# Laxmi Astrology Payment Backend

A Node.js Express server for handling payment operations for the Laxmi Astrology mobile app.

## Features

- ✅ Payment processing with Firebase integration
- ✅ User wallet management
- ✅ Transaction history
- ✅ Balance checking
- ✅ Authentication middleware
- ✅ Railway deployment ready

## API Endpoints

### Payment Operations
- `POST /api/payment` - Process payment and add questions to wallet
- `GET /api/payment/balance` - Get user balance and transaction history

### Additional Endpoints
- `POST /app/api/promocode` - Apply promocode (placeholder)
- `POST /app/api/refer` - Handle referrals (placeholder)

## Setup for Railway Deployment

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables in Railway:**
   - `FIREBASE_DATABASE_URL`: Your Firebase Realtime Database URL
   - `FIREBASE_SERVICE_ACCOUNT_KEY`: Your Firebase service account JSON (as string)
   - `PORT`: Will be automatically set by Railway

3. **Deploy to Railway:**
   - Connect your GitHub repo to Railway
   - Railway will automatically detect and deploy the Node.js app

## Local Testing

1. Create `.env` file from `.env.example`
2. Add your Firebase credentials
3. Run: `npm run dev`
4. Server will start on http://localhost:3000

## Firebase Setup Required

You need to:
1. Get your Firebase service account key JSON
2. Set it as `FIREBASE_SERVICE_ACCOUNT_KEY` environment variable
3. Make sure your database URL is correct

## Testing the API

Health check:
```bash
curl https://your-railway-url.railway.app/
```

Process payment:
```bash
curl -X POST https://your-railway-url.railway.app/api/payment \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer USER_ID" \
  -d '{"payment": 49, "questionCount": 1}'
```