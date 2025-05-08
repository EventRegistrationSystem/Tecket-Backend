# Stripe Webhook Setup and Testing Guide

**Last Updated:** 08/05/2025

This document outlines how Stripe webhooks are handled in this backend application and how to test them during development.

## Purpose of Webhooks

Stripe uses webhooks to notify the backend application about events happening asynchronously in the Stripe system, such as payment success, payment failure, refunds, etc. This is crucial for updating the application's internal state (e.g., marking a registration as `CONFIRMED` after a successful payment) based on events that occur outside the direct request-response cycle.

## Backend Implementation

1.  **Webhook Endpoint:**
    *   A dedicated endpoint `POST /api/payments/webhook/stripe` is defined in `src/routes/paymentRoutes.ts`.
    *   This endpoint does **not** require JWT authentication, as requests come directly from Stripe.

2.  **Raw Body Parsing:**
    *   Stripe requires the **raw request body** (not parsed JSON) to verify the webhook signature.
    *   In `src/app.ts`, the `express.raw({ type: 'application/json' })` middleware is applied *specifically* to the `/api/payments/webhook/stripe` route *before* any global `express.json()` middleware. This makes the raw body available as `req.rawBody`.

3.  **Signature Verification:**
    *   The `verifyStripeWebhook` middleware (in `src/middlewares/stripeWebhookMiddleware.ts`) is applied to the webhook route in `src/routes/paymentRoutes.ts`.
    *   This middleware retrieves the `stripe-signature` header from the request.
    *   It uses `stripe.webhooks.constructEvent(req.rawBody, signature, webhookSecret)` to verify the signature using the `STRIPE_WEBHOOK_SECRET` environment variable.
    *   If verification fails, it returns a `400 Bad Request` response.
    *   If verification succeeds, it attaches the verified `Stripe.Event` object to the request as `req.stripeEvent` and calls `next()`.
    *   **Note:** For local development where the secret might not be configured, the middleware currently logs a warning and proceeds *without* verification (INSECURE - **DO NOT** do this in production).

4.  **Webhook Controller (`PaymentController.handleStripeWebhook`):**
    *   Receives the request after signature verification.
    *   Retrieves the verified `event` object from `req.stripeEvent`.
    *   Calls the `PaymentService.handleWebhookEvent(event, signature)` function.
    *   Sends a `200 OK` response back to Stripe immediately to acknowledge receipt (important to prevent Stripe from retrying). Error handling within the service should not prevent this acknowledgment.

5.  **Webhook Service Logic (`PaymentService.handleWebhookEvent`):**
    *   Logs the received event type and ID.
    *   Uses a `switch` statement to handle different `event.type` values.
    *   Currently handles:
        *   `payment_intent.succeeded`: Calls `processPaymentSuccess`.
        *   `payment_intent.payment_failed`: Calls `processPaymentFailure`.
    *   Logs warnings for unhandled event types.

6.  **Processing Logic (`processPaymentSuccess`, `processPaymentFailure`):**
    *   These helper functions contain the core logic for updating the database based on the webhook event.
    *   They retrieve necessary data from the event object (e.g., `paymentIntent.id`, `paymentIntent.metadata.registrationId`).
    *   They perform database updates within a `prisma.$transaction` for atomicity (e.g., updating `Payment` status, updating `Registration` status).
    *   They include idempotency checks (e.g., don't re-process if payment is already `COMPLETED`).
    *   They contain error handling and logging specific to webhook processing.

## Environment Variables

*   `STRIPE_SECRET_KEY`: Your Stripe API secret key (e.g., `sk_test_...`).
*   `STRIPE_WEBHOOK_SECRET`: The signing secret for your specific webhook endpoint configuration in the Stripe dashboard (e.g., `whsec_...`). This is **required** for signature verification.

## Local Development & Testing

Since Stripe cannot directly send webhooks to your `localhost`, you need a tool to forward these events. The **Stripe CLI** is the recommended tool.

1.  **Install Stripe CLI:** Follow instructions on the [Stripe CLI documentation](https://stripe.com/docs/stripe-cli).
2.  **Login:** Run `stripe login` in your terminal and follow the prompts to link the CLI to your Stripe account.
3.  **Start Your Backend:** Run your local server (`npm run dev`). Note the port (e.g., 3000).
4.  **Forward Webhooks:** Open a *separate* terminal window and run the following command:
    ```bash
    stripe listen --forward-to localhost:YOUR_PORT/api/payments/webhook/stripe
    ```
    (Replace `YOUR_PORT` with your actual port).
5.  **Get Webhook Secret:** The Stripe CLI will output a webhook signing secret (e.g., `whsec_...`). Copy this secret.
6.  **Set Environment Variable:** Add or update the `STRIPE_WEBHOOK_SECRET` variable in your `.env` file with the secret obtained from the Stripe CLI. **Restart your backend server** for the new environment variable to take effect.
7.  **Trigger Events:** Perform actions in your application (or directly in the Stripe dashboard test mode) that trigger payment events (e.g., create a payment intent via your API, simulate confirming a payment using test card numbers).
8.  **Observe:** Watch the terminal where `stripe listen` is running. You should see events being forwarded. Watch your backend server logs to see the "Received Stripe webhook..." messages and any processing logs or errors. Check your database to confirm records (Payment, Registration status) are updated correctly after successful payment events.

By following these steps, you can effectively test the entire webhook flow locally, including signature verification. Remember to use your actual production webhook secret when deploying.
