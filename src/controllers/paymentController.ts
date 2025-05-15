import { Request, Response, NextFunction } from 'express';
import Stripe from 'stripe';
import * as paymentService from '../services/paymentServices';
import { AppError } from '../utils/errors';
import { CreatePaymentIntentDto } from '../types/paymentTypes';

// Initialize Stripe only for webhook verification here
// Use the webhook secret from environment variables
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
if (!stripeWebhookSecret) {
  // Only throw if not in test environment, maybe? Or handle differently.
  // For now, we assume it's needed if webhooks are configured.
  console.warn('Stripe webhook secret not found in environment variables. Webhook verification will fail.');
  // Consider throwing new Error('Stripe webhook secret not found...') if essential for startup
}
// Need a separate Stripe instance potentially, or reuse the one from service if exported?
const stripeForWebhooks = new Stripe(process.env.STRIPE_SECRET_KEY || 'dummy_key_for_init', {
    apiVersion: '2025-03-31.basil', // Match service API version
    typescript: true,
});


/**
 * Controller to create a Stripe Payment Intent.
 */
export const createPaymentIntentHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    
    const paymentIntentDto: CreatePaymentIntentDto = req.body;
    const authUser = req.user; // Get user from request, set by optionalAuthenticate middleware

    if (!paymentIntentDto.registrationId) {
       throw new AppError(400, 'Registration ID is required.');
    }

    // Pass the DTO and user (nullable for guest payments) 
    const result = await paymentService.createPaymentIntent(paymentIntentDto, authUser || null);

    res.status(201).json(result); // Send back clientSecret and paymentId
  } catch (error) {
    next(error); // Pass error to global error handler
  }
};

/**
 * Controller to handle incoming Stripe Webhooks.
 * IMPORTANT: This endpoint needs a middleware to parse the RAW request body,
 * as Stripe requires the raw body for signature verification.
 * e.g., app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), handleStripeWebhook);
 */
export const handleStripeWebhook = async (req: Request, res: Response, next: NextFunction) => {
  // Check if webhook secret is configured
   if (!stripeWebhookSecret) {
    console.error("Webhook processing failed: Stripe webhook secret is not configured.");
    res.status(500).send('Webhook secret not configured.');
    return; // Explicitly return void
  }

  const signature = req.headers['stripe-signature'] as string;

  if (!signature) {
    console.error('Webhook error: Missing stripe-signature header.');
    res.status(400).send('Missing Stripe signature.');
    return; // Explicitly return void
  }

  if (!req.body || typeof req.body !== 'object') {
     console.error('Webhook error: Invalid request body. Ensure raw body parser is used.');
     res.status(400).send('Invalid request body. Requires raw body.');
     return; // Explicitly return void
  }

  let event: Stripe.Event;

  try {
    // Verify the event signature using the raw body (req.body should be buffer/string here)
    event = stripeForWebhooks.webhooks.constructEvent(
      req.body, // Should be the raw request body
      signature,
      stripeWebhookSecret
    );
  } catch (err: any) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return; // Explicitly return void
  }

  // Handle the verified event
  try {
    await paymentService.handleWebhookEvent(event, signature);
    // Send success response to Stripe
    res.status(200).json({ received: true });
  } catch (error) {
     // Catch errors from the service layer processing if any (though service aims to handle its own errors)
     console.error(`Error processing webhook event ${event.id}:`, error);
     // Still send 200 to Stripe to prevent retries for processing errors, but log the error server-side
     res.status(200).json({ received: true, error: 'Internal processing error' });
     // next(error); // Optionally pass to global error handler, but might cause Stripe retries
     // No explicit return needed here as it's the end of the function block
  }
  // Ensure function implicitly returns void if execution reaches here (though it shouldn't with the try/catch)
};
