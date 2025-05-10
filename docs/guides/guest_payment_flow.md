# Guest Payment Flow Documentation

**Last Updated:** 08/05/2025

This document explains the mechanism implemented to allow guest users (users who are not logged in) to securely pay for event registrations.

## Problem

When a guest registers for a paid event, their registration status is set to `PENDING`. They then need to proceed to payment. The backend needs a way to securely link the subsequent payment attempt (calling `/api/payments/create-intent`) back to that specific pending registration. Relying solely on the `registrationId` is insecure. Guests do not have JWTs for standard authentication.

## Solution: Temporary Payment Tokens

A temporary, single-use, expiring token system is used:

1.  **Schema:** The `Purchase` model in `prisma/schema.prisma` has two nullable fields:
    *   `paymentToken: String? @unique`: Stores a **hashed** version of the generated token using bcrypt.
    *   `paymentTokenExpiry: DateTime?`: Stores the token's expiry timestamp (e.g., 1 hour from creation).

2.  **Token Generation (`RegistrationService.createRegistration`):**
    *   When a guest (`userId` is null) successfully completes the initial registration step for a paid event (`!event.isFree`), and a `Purchase` record is created:
        *   A unique plaintext token (UUID) is generated using `crypto.randomUUID()`.
        *   The plaintext token is hashed using `bcrypt.hash()`.
        *   An expiry time is set.
        *   The **hashed token** and expiry time are stored in the corresponding `Purchase` record via `tx.purchase.update()`.
        *   The **plaintext token** is returned to the frontend as part of the `CreateRegistrationResponse` (in the optional `paymentToken` field).

3.  **Frontend Handling:**
    *   Receives `registrationId` and optional `paymentToken` from `POST /api/registrations`.
    *   If `paymentToken` is present, stores it temporarily (e.g., session storage).
    *   When initiating payment, sends `POST /api/payments/create-intent` with `registrationId` and the stored `paymentToken` in the request body.

4.  **Payment Intent Creation & Authorization (`PaymentService.createPaymentIntent`):**
    *   The `/api/payments/create-intent` endpoint does *not* use the `authenticate` JWT middleware.
    *   The `createPaymentIntent` service function receives `registrationId`, optional `paymentToken`, and `authUser` (which will be `null` for guests).
    *   **Authorization Logic:**
        *   Fetches the `Registration` and its related `Purchase` (including `paymentToken` hash and `paymentTokenExpiry`).
        *   **If `authUser` exists (Logged-in User):** Verifies ownership via `registration.userId` or admin role.
        *   **If `authUser` is `null` AND `paymentToken` is provided (Guest User):**
            *   Checks if `purchase.paymentToken` exists and `purchase.paymentTokenExpiry` is in the future.
            *   Compares the hash of the received `paymentToken` with the stored hash using `bcrypt.compare()`.
            *   If all checks pass, authorization succeeds. (Optional TODO: Invalidate token after use).
        *   If authorization fails for either case, an `AuthorizationError` is thrown.
    *   If authorized, proceeds to create/retrieve the Stripe Payment Intent.

## Security Considerations

*   **Hashing:** Storing only the hash prevents exposure of the actual token if the database is compromised.
*   **Expiry:** Limits the time window in which the token is valid.
*   **Uniqueness:** The `@unique` constraint on `paymentToken` helps prevent potential collisions (though unlikely with UUIDs).
*   **Single-Use (Recommended TODO):** For enhanced security, the stored `paymentToken` hash should ideally be cleared from the database immediately after it's successfully used to create the payment intent, preventing replay attacks.
*   **HTTPS:** Ensure all communication is over HTTPS to protect the plaintext token in transit between the backend and frontend.
