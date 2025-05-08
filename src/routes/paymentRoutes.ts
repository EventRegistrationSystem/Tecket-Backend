import express from 'express';
import * as paymentController from '../controllers/paymentController';
import { optionalAuthenticate, validateRequest } from '../middlewares/authMiddlewares'; 
import { createPaymentIntentSchema } from '../validation/paymentValidation';
import { verifyStripeWebhook } from '../middlewares/stripeWebhookMiddleware';

const router = express.Router();

// POST /api/payments/create-intent
// Creates a Stripe Payment Intent for a registration
// Authorization handled in service via JWT or payment token
router.post(
  '/create-intent',
  validateRequest(createPaymentIntentSchema), 
  optionalAuthenticate,
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
