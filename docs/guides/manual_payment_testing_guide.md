# Manual Payment Testing Guide

This guide outlines the steps to manually test the payment intent creation and Stripe webhook handling for the event registration system.

**Last Updated:** 2025-05-09

## I. Prerequisites & Setup Verification

Before starting, ensure the following are in place:

*   **A. Backend Server Running:**
    *   Start your server: `npm run dev`
    *   Verify it's running without errors on your configured port (e.g., `http://localhost:3000`).

*   **B. Database Seeded:**
    *   Run `npm run db:setup` if you need a fresh dataset or haven't done so recently.
    *   This ensures you have test users (e.g., `participant1@example.com`), paid events, and tickets.

*   **C. `.env` File Configuration:**
    *   `DATABASE_URL`: Correctly configured for your database.
    *   `JWT_SECRET`: Set for testing logged-in user flows.
    *   `STRIPE_SECRET_KEY`: Must be your Stripe **test** secret key (e.g., `sk_test_...`).
    *   `STRIPE_WEBHOOK_SECRET`: This will be set during webhook testing (see section III).

*   **D. API Client:**
    *   Have Postman, Insomnia, `curl`, or a similar API client ready.

*   **E. Stripe CLI:**
    *   Installed and logged into your Stripe account (`stripe login`).

*   **F. Successful Registrations Data:**
    *   You will need `registrationId` values from successful `PENDING` registrations (created via `POST /api/registrations`).
    *   For guest registrations, you also need the `paymentToken` returned by the registration endpoint.
    *   It's recommended to create fresh registrations before testing payment intent creation to ensure guest payment tokens are not expired (they are valid for 1 hour).

## II. Testing Payment Intent Creation

**Objective:** Verify that the backend can create a Stripe Payment Intent for `PENDING` registrations (both guest and logged-in users) for paid events.

**Endpoint:** `POST http://localhost:YOUR_PORT/api/payments/create-intent`
*(Replace `YOUR_PORT` with your actual backend port, e.g., 3000)*

**Common Headers:** `Content-Type: application/json`

---

### Scenario 2.1: Logged-in User Payment Intent

1.  **Obtain JWT:**
    *   Log in as a seeded participant (e.g., `participant1@example.com`) via `POST /api/auth/login`.
    *   Copy the JWT access token from the response.

2.  **Obtain `registrationId`:**
    *   Use a `registrationId` from a `PENDING` registration previously created by this logged-in user for a paid event. If the registration is old, consider creating a new one to ensure it's in the correct state.

3.  **Send Request to Create Payment Intent:**
    *   **Method:** `POST`
    *   **URL:** `http://localhost:YOUR_PORT/api/payments/create-intent`
    *   **Headers:**
        *   `Content-Type: application/json`
        *   `Authorization: Bearer <YOUR_JWT_ACCESS_TOKEN>`
    *   **Body:**
        ```json
        {
          "registrationId": <ID_OF_LOGGED_IN_USERS_PENDING_REGISTRATION>
        }
        ```

4.  **Expected Response (HTTP 201 Created or 200 OK):**
    ```json
    {
      "clientSecret": "pi_xxxxxxxxxxxx_secret_xxxxxxxxxxxx", // Stripe Payment Intent client secret
      "paymentId": <YOUR_INTERNAL_PAYMENT_TABLE_ID>        // ID from your 'Payment' table
    }
    ```

5.  **Verification:**
    *   **Note:** Record the `clientSecret` and the `paymentIntentId` (the `pi_...` part of the `clientSecret`).
    *   **Database:**
        *   Check your `Payment` table for a new record linked to the `Purchase` of the registration.
        *   `Payment.status` should be `PENDING`.
        *   `Payment.stripePaymentIntentId` should match the `pi_...` ID from Stripe.
        *   `Payment.amount` and `Payment.currency` should be correct.
    *   **Stripe Dashboard (Test Mode):**
        *   Go to "Payments" -> "All payments".
        *   You should find a new Payment Intent with the matching ID, typically with a status like "Incomplete" or "Requires payment method".

---

### Scenario 2.2: Guest User Payment Intent

1.  **Obtain `registrationId` and `paymentToken`:**
    *   Create a **new** guest registration for a paid event via `POST /api/registrations` to get a fresh `registrationId` and `paymentToken` (guest tokens expire in 1 hour).
    *   Refer to `docs/test_payloads/registration_payloads.md` for example guest registration payloads.

2.  **Send Request to Create Payment Intent:**
    *   **Method:** `POST`
    *   **URL:** `http://localhost:YOUR_PORT/api/payments/create-intent`
    *   **Headers:** `Content-Type: application/json` (No `Authorization` header)
    *   **Body:**
        ```json
        {
          "registrationId": <ID_OF_GUESTS_PENDING_REGISTRATION>,
          "paymentToken": "<THE_GUEST_PAYMENT_TOKEN_FROM_REGISTRATION_RESPONSE>"
        }
        ```

3.  **Expected Response (HTTP 201 Created or 200 OK):** Same as Scenario 2.1.

4.  **Verification:** Same as Scenario 2.1 (note `clientSecret` and `paymentIntentId`, check database, check Stripe Dashboard).

## III. Testing Stripe Webhook Handling

**Objective:** Verify the backend processes `payment_intent.succeeded` and `payment_intent.payment_failed` webhooks from Stripe, updating database records correctly.

**Webhook Endpoint (configured in Stripe CLI):** `http://localhost:YOUR_PORT/api/payments/webhook/stripe`

---

### Setup Steps for Webhook Testing:

1.  **Start Stripe CLI Webhook Forwarding:**
    *   Open a **new terminal window**.
    *   Run: `stripe listen --forward-to http://localhost:YOUR_PORT/api/payments/webhook/stripe`
    *   The CLI will output a webhook signing secret (e.g., `whsec_...`). **Copy this secret.**

2.  **Set `STRIPE_WEBHOOK_SECRET` in `.env`:**
    *   Add or update `STRIPE_WEBHOOK_SECRET="whsec_..."` in your active `.env` file with the secret obtained from the Stripe CLI.

3.  **Restart Your Backend Server:**
    *   Stop and restart your `npm run dev` server. This is crucial for it to load the new `STRIPE_WEBHOOK_SECRET`.

---

### Scenario 3.1: Testing `payment_intent.succeeded`

1.  **Obtain a `clientSecret` and `paymentIntentId`:**
    *   Successfully create a Payment Intent using either Scenario 2.1 or 2.2 above. Note the `clientSecret` and the `paymentIntentId` (the `pi_...` part).

2.  **Simulate Successful Payment:**
    *   **Method A (Using Stripe Test Card - if you have a test frontend):**
        *   Use the `clientSecret` with Stripe Elements on a simple test frontend.
        *   Use a Stripe test card that results in success (e.g., card number `4242 ... 4242`, or `pm_card_visa`).
    *   **Method B (Using Stripe CLI `trigger` - often simpler for backend focus):**
        ```bash
        stripe trigger payment_intent.succeeded --id <YOUR_PAYMENT_INTENT_ID>
        ```
        (e.g., `stripe trigger payment_intent.succeeded --id pi_xxxxxxxxxxxx`)

3.  **Observe & Verify:**
    *   **Stripe CLI (`stripe listen` terminal):**
        *   Should log the `payment_intent.succeeded` event.
        *   Should show the event being forwarded to your local endpoint and receiving a `200 OK` response from your server.
    *   **Backend Server Logs (`npm run dev` terminal):**
        *   Look for logs like "Received Stripe webhook: Type=payment_intent.succeeded..."
        *   Confirm logs indicating successful signature verification (if your `verifyStripeWebhook` middleware logs this).
        *   Check for logs from `PaymentService.processPaymentSuccess` indicating successful processing.
    *   **Database Check:**
        *   `Payment` table: The status of the payment record corresponding to the `paymentIntentId` should change to `COMPLETED`.
        *   `Registration` table: The status of the associated registration should change to `CONFIRMED`.
        *   `Ticket` table: The `quantitySold` for the relevant ticket(s) should increment by the purchased quantity.
    *   **Stripe Dashboard (Test Mode):** The Payment Intent should now be marked as "Succeeded".

---

### Scenario 3.2: Testing `payment_intent.payment_failed`

1.  **Obtain a `clientSecret` and `paymentIntentId`:**
    *   Create a **new** Payment Intent (Scenario 2.1 or 2.2). It's best to use a fresh one for each webhook test.

2.  **Simulate Failed Payment:**
    *   **Method A (Using Stripe Test Card - if you have a test frontend):**
        *   Use a Stripe test card that simulates a payment failure (e.g., a card that triggers a decline like `pm_card_visa_chargeDeclined`).
    *   **Method B (Using Stripe CLI `trigger`):**
        ```bash
        stripe trigger payment_intent.payment_failed --id <YOUR_NEW_PAYMENT_INTENT_ID>
        ```

3.  **Observe & Verify:**
    *   **Stripe CLI (`stripe listen` terminal):**
        *   Should log the `payment_intent.payment_failed` event and show successful forwarding (200 OK).
    *   **Backend Server Logs:**
        *   Look for logs like "Received Stripe webhook: Type=payment_intent.payment_failed..."
        *   Confirm signature verification.
        *   Check for logs from `PaymentService.processPaymentFailure`.
    *   **Database Check:**
        *   `Payment` table: The status of the payment record should change to `FAILED`.
        *   `Registration` table: The status should typically remain `PENDING` (allowing the user to potentially retry payment).
        *   `Ticket` table: `quantitySold` should *not* have changed.
    *   **Stripe Dashboard (Test Mode):** The Payment Intent should be marked as "Failed".

## IV. Important Notes & Troubleshooting

*   **Idempotency:** Your webhook handlers should be designed to be idempotent. This means if Stripe sends the same event multiple times, your system should handle it gracefully without causing duplicate data changes or errors. (Your current service has some checks for this).
*   **Error Logging:** Closely monitor your backend server logs during testing. Detailed error messages are crucial for debugging.
*   **Stripe API Version:** If you encounter unexpected errors from the Stripe library itself when creating payment intents, re-check the `apiVersion` used in `src/services/paymentServices.ts` (e.g., `'2025-03-31.basil'`). Consider using a standard, non-beta recent version if issues arise.
*   **Server Restarts:** Always restart your backend server after making changes to `.env` files or any server-side code to ensure changes are applied.
*   **Guest Token Expiry:** Remember guest payment tokens (for creating payment intents) expire after 1 hour. Always generate a fresh guest registration if you suspect an old token has expired.

This guide should help you systematically test your payment integration.
