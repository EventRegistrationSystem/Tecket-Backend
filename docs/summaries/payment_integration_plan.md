# Stripe Payment Integration Plan

**Last Updated:** 01/05/2025

This document outlines the requirements and data flow for integrating Stripe payments into the Event Registration System, focusing on the interaction between the frontend (`Capstone-Frontend`) and backend (`Capstone-Backend`).

## Backend Requirements & Status

**Current Status:**
The core backend infrastructure for handling Stripe payments (using Payment Intents and webhooks) is implemented in Test Mode. This includes:
*   Stripe SDK installation and configuration.
*   Prisma schema updates (`Payment` model) and migration.
*   Payment types (`src/types/paymentTypes.ts`).
*   Payment service (`src/services/paymentServices.ts`) with logic for:
    *   `createPaymentIntent`: Creates a Stripe Payment Intent linked to a registration, returning a `client_secret`.
    *   `handleWebhookEvent`: Processes `payment_intent.succeeded` and `payment_intent.payment_failed` webhooks to update database status.
*   Payment controller (`src/controllers/paymentController.ts`) exposing service functions.
*   Payment routes (`src/routes/paymentRoutes.ts`) for `/api/payments/create-intent` and `/api/payments/webhook/stripe`.
*   App integration (`src/app.ts`) with correct middleware (`express.raw`) for the webhook endpoint.

**Remaining Backend Tasks:**

1.  **Validation:** Implement robust input validation (e.g., using Joi) for the `POST /api/payments/create-intent` request body (ensure `registrationId` is a valid number).
2.  **Authorization:** Add authorization checks to the `/api/payments/create-intent` route/handler to verify the authenticated user is permitted to initiate payment for the given `registrationId`.
3.  **Testing:**
    *   **Unit Tests:** Write tests for `paymentServices.ts`, mocking Stripe SDK and Prisma calls.
    *   **API/Integration Tests:** Test the `/create-intent` endpoint directly. Use `ngrok` or Stripe CLI to test the `/webhook/stripe` endpoint with test events from the Stripe dashboard. Verify database updates occur correctly.
4.  **Refinements (Optional/Future):**
    *   Implement refund logic (requires Stripe API calls, potentially new endpoints/service functions).
    *   Handle currency dynamically if needed.
    *   Enhance logging.
5.  **Go Live:** Switch from Stripe Test API keys/secrets to Live keys/secrets when ready for production.

## Frontend Requirements & Data Flow

**Assumptions:**
*   Frontend uses Vue.js.
*   User completes registration details (ticket selection, participant info, questions) *before* reaching the final checkout/payment page.
*   Backend registration endpoint (`POST /api/registrations`) creates the necessary `Registration`, `Purchase`, `Participant`, `Response` records (with `Registration.status: PENDING`) and returns the `registrationId`.

**Required Steps:**

1.  **Install Stripe.js:**
    ```bash
    npm install @stripe/stripe-js
    # or
    yarn add @stripe/stripe-js
    ```
2.  **Load Stripe.js:** In the checkout component, load Stripe using the **Test Publishable Key** (`pk_test_...`).
    ```javascript
    import { loadStripe } from '@stripe/stripe-js';
    const stripePromise = loadStripe('YOUR_STRIPE_PUBLISHABLE_KEY');
    ```
3.  **Fetch Client Secret:** When the checkout component mounts/loads:
    *   Make a `POST` request to the backend endpoint `/api/payments/create-intent`.
    *   Send the `registrationId` (obtained after submitting initial registration details) in the JSON body: `{ "registrationId": 123 }`.
    *   Include necessary authentication headers (e.g., JWT Bearer token).
    *   Receive the response: `{ "clientSecret": "pi_..._secret_...", "paymentId": ... }`. Store the `clientSecret`.
4.  **Initialize & Mount Stripe Elements:**
    *   Once `stripePromise` resolves and `clientSecret` is fetched, initialize Stripe Elements: `elements = stripe.elements({ clientSecret });`.
    *   Create a `CardElement` (or individual card elements): `cardElement = elements.create('card', { /* options */ });`.
    *   Mount the `cardElement` to a designated `<div>` in the component's template: `cardElement.mount('#card-element-div');`.
5.  **Handle Payment Submission:** On "Pay" button click:
    *   Prevent default form submission.
    *   Call `stripe.confirmCardPayment(clientSecret, { payment_method: { card: cardElement, /* billing_details: optional */ } });`.
    *   Process the result:
        *   **Error:** Display the `error.message` to the user (e.g., card declined).
        *   **Success (`paymentIntent.status === 'succeeded'`):** Show a success message/confirmation to the user. Redirect to a success page. **Important:** Do not fulfill the order based solely on this frontend result; wait for the backend webhook confirmation.
6.  **Styling:** Customize the appearance of Stripe Elements using the `style` option during creation.

This flow ensures sensitive card details are handled securely by Stripe Elements, while your backend manages the payment intent lifecycle and confirms successful payments via webhooks.
