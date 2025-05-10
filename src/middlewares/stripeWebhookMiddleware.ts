import { Request, Response, NextFunction, RequestHandler } from 'express'; 
import Stripe from 'stripe';
import { AppError } from '../utils/errors';

// Initialize Stripe (should be the same instance as in paymentServices)
// Ensure STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are in your .env
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

if (!stripeSecretKey) {
  console.error('STRIPE_SECRET_KEY not found in environment variables.');
  // Depending on setup, might throw error or handle gracefully
}
if (!webhookSecret) {
   console.error('STRIPE_WEBHOOK_SECRET not found in environment variables.');
   // Webhook verification will fail without this
}

const stripe = new Stripe(stripeSecretKey!, { // Use non-null assertion if you handle missing key at app startup
  apiVersion: '2025-03-31.basil', // Use the same API version as your Stripe SDK
  typescript: true,
});


/**
 * Middleware to verify the Stripe webhook signature.
 * Ensures the request is genuinely from Stripe.
 * Requires express.raw({type: 'application/json'}) middleware to be used BEFORE this middleware
 * on the webhook route to get the raw body.
 */
export const verifyStripeWebhook: RequestHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const signature = req.headers['stripe-signature'];

  if (!signature) {
    console.warn('Stripe webhook received without signature header.');
    res.status(400).send('No Stripe signature header');
    return;
  }

  if (!webhookSecret) {
      console.error('Stripe webhook secret is not configured. Cannot verify signature.');
      // In a production environment, you might want to throw an error here or have a more robust failure mechanism.
      // For development, we might allow it for testing, but it's insecure.
      // return res.status(500).send('Webhook secret not configured'); // Uncomment for production
       console.warn('Allowing webhook processing without signature verification (INSECURE).');
       // If allowing without verification in dev, proceed to next middleware
       next(); // Proceed without verification (Development ONLY)
       return;
  }


  try {
    // Use req.body, which express.raw() populates with a Buffer
    const event = stripe.webhooks.constructEvent(
      req.body, 
      signature,
      webhookSecret
    );

    // Attach the verified event to the request object for the handler
    (req as any).stripeEvent = event;

    next(); // Signature verified, proceed to the handler

  } catch (err : any) {
    console.error(`Stripe webhook signature verification failed: ${err.message}`);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return
  }
};
