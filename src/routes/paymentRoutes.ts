import express from 'express';
import * as paymentController from '../controllers/paymentController';
import { authenticate, authorize, validateRequest } from '../middlewares/authMiddlewares'; // Import validateRequest
import { createPaymentIntentSchema } from '../validation/paymentValidation'; // Import the schema
import { UserRole } from '@prisma/client';

const router = express.Router();

// POST /api/payments/create-intent
// Creates a Stripe Payment Intent for a registration
// Requires authentication (e.g., logged-in participant)
router.post(
  '/create-intent',
  authenticate,
  validateRequest(createPaymentIntentSchema), // Add validation middleware
  // Add authorization if needed (e.g., check if user owns the registrationId)
  // authorize(UserRole.PARTICIPANT, UserRole.ADMIN),
  paymentController.createPaymentIntentHandler
);

// POST /api/payments/webhook/stripe
// Handles incoming webhook events from Stripe
// IMPORTANT: This route MUST use express.raw({type: 'application/json'}) middleware BEFORE this handler
// This middleware should be applied in src/app.ts where this router is mounted.
router.post(
  '/webhook/stripe',
  // No authentication needed for webhooks, Stripe verifies via signature
  paymentController.handleStripeWebhook
);

export default router;
