import express from 'express';
import * as paymentController from '../controllers/paymentController';
import { authenticate, authorize, validateRequest } from '../middlewares/authMiddlewares'; // Import validateRequest
import { createPaymentIntentSchema } from '../validation/paymentValidation'; // Import the schema
import { verifyStripeWebhook } from '../middlewares/stripeWebhookMiddleware';

const router = express.Router();

// POST /api/payments/create-intent
// Creates a Stripe Payment Intent for a registration
// Authorization handled in service via JWT or payment token
router.post(
  '/create-intent',
  validateRequest(createPaymentIntentSchema), 
  // authorize(UserRole.PARTICIPANT, UserRole.ADMIN), Add authorization if needed (e.g., check if user owns the registrationId)
  paymentController.createPaymentIntentHandler
);

// POST /api/payments/webhook/stripe
// Handles incoming webhook events from Stripe
// IMPORTANT: This route MUST use express.raw({type: 'application/json'}) middleware BEFORE this handler
// This middleware should be applied in src/app.ts where this router is mounted.
router.post(
  '/webhook/stripe',
  
  // No authentication needed for webhooks, Stripe verifies via signature
  verifyStripeWebhook,
  paymentController.handleStripeWebhook
);

export default router;
