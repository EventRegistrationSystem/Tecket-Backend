# Project Summary: Event Registration System Backend

**Last Updated:** 10/05/2025

## 1. Project Purpose and Core Functionalities

**Purpose:**
To provide a robust backend API for managing events, registrations, tickets, and associated questionnaires. The system enables event organizers to create and manage events (both free and paid) and allows participants (registered users or guests) to browse, register, and complete event-specific questionnaires. Secure payment processing is planned for paid events.

**Core Functionalities:**
*   **User Management:** Authentication (JWT-based), authorization (Role-Based Access Control: PARTICIPANT, ORGANIZER, ADMIN), profile management (get/update), password management.
*   **Event Management:** Full CRUD operations, status management (draft, published, cancelled, completed), support for free/paid events, advanced filtering/search, role-based visibility, dynamic question updates.
*   **Ticket Management:** Creation/management of ticket types per event, pricing, availability checks, sales periods, validation against sold quantities, ownership authorization checks.
*   **Registration System:**
    *   Supports both registered users and guest participants, linking participants to events.
    *   Handles conditional status (`PENDING` for paid, `CONFIRMED` for free).
    *   **Refactored to support multiple participants (attendees) and multiple ticket types per registration.** This involved adding the `Attendee` and `PurchaseItem` models, updating the `Purchase` and `Ticket` models, and refactoring the `createRegistration` service method to handle arrays of participants and tickets, create `Attendee` and `PurchaseItem` records, and link responses correctly.
    *   Retrieval (`GET /registrations`, `GET /registrations/:id`) implemented with authorization and updated includes for `Attendee` and `PurchaseItem` data.
    *   **Cancellation implemented** (`PATCH /registrations/:registrationId`) allowing owner/admin to cancel, including decrementing ticket count for paid events based on `PurchaseItem` quantities.
    *   **Validation re-enabled** for `POST /registrations` using Joi, including custom validation for matching participant count to ticket quantity.
*   **Questionnaire Management:** Custom questions per event, response collection from participants during registration, now linked via the `Attendee` model.
*   **Payment Processing:** **(In Progress - Stripe Backend Setup)**
    *   Secure handling of payments for paid event tickets using Stripe.
    *   Creating Stripe Payment Intents (`POST /api/payments/create-intent`) is implemented and manually tested for guest and logged-in users. Authorization correctly uses JWT for authenticated users (via `optionalAuthenticate` middleware) and temporary payment tokens for guests.
    *   **Guest Payment Token System:** Implemented and manually tested (generation, hashing, storage, expiry, validation during payment intent creation).
    *   **Webhook Handling:** Webhook handler (`POST /api/payments/webhook/stripe`) for `payment_intent.succeeded` and `payment_intent.payment_failed` events is implemented and has been manually tested, correctly updating `Payment` and `Registration` statuses.
    *   **Webhook Signature Verification:** Middleware implemented, reviewed, corrected, and manually tested.
    *   **Raw Body Parsing for Webhooks:** Correctly configured in `app.ts` using `express.raw()` for the specific webhook route.
*   **Reporting & Analytics:** (Planned) Data collection to support future reporting for organizers/admins.

## 2. Technology Stack

*   **Language:** TypeScript
*   **Runtime:** Node.js
*   **Framework:** Express.js
*   **Database:** MySQL
*   **ORM:** Prisma
*   **Authentication:** JWT (JSON Web Tokens) with Refresh Tokens (stored in HTTP-only cookies), bcrypt for password hashing.
*   **Validation:** Joi (Schema validation used in middleware).
*   **Testing:** Jest (Unit tests with Prisma/bcrypt mocks).
*   **Payment Gateway:** Stripe (using Stripe Node.js SDK)

## 3. Architecture and Component Structure

**Architecture:**
Layered Architecture:
1.  **Routes (`src/routes/`):** Define API endpoints, apply middleware (authentication, validation).
2.  **Controllers (`src/controllers/`):** Handle HTTP request/response cycle, orchestrate service calls.
3.  **Services (`src/services/`):** Encapsulate core business logic, interact with the data layer.
4.  **Data Layer (Prisma - `prisma/schema.prisma`):** Defines database models and handles database interactions.

**Key Database Entities (`prisma/schema.prisma`):**
*   `User`: Authenticated users (organizers, admins, participants with accounts).
*   `Participant`: Stores profile info for *all* participants (guests or registered users). Linked to `User` if applicable.
*   `Event`: Event details, including `isFree` flag.
*   `Ticket`: Ticket types for paid events (linked to `Event`).
*   `Question`: Custom questions.
*   `EventQuestions`: Links `Event` and `Question`, stores `isRequired`, `displayOrder`.
*   `Registration`: Links `Participant` to `Event`, stores `status`.
*   `Attendee`: Links `Registration` and `Participant`, representing an individual attending under a registration. Has many `Response` records.
*   `Response`: Participant answers to `EventQuestions`, linked to an `Attendee`.
*   `Purchase`: Records ticket purchases for paid events, linked to a `Registration`. Has many `PurchaseItem` records. Includes optional `paymentToken` (hashed) and `paymentTokenExpiry` for guest checkout.
*   `PurchaseItem`: Records details for each type of ticket bought within a `Purchase`, linked to `Purchase` and `Ticket`.
*   `Payment`: Records payment details, linked to a `Purchase`. Includes `stripePaymentIntentId` and `currency` for Stripe integration.

**Directory Structure:**
Standard structure for a Node.js/Express/TypeScript project:
```
.
├── prisma/             # Prisma schema, migrations, seeding
├── src/
│   ├── config/         # App configuration (DB, Swagger)
│   ├── controllers/    # Request handlers
│   ├── services/       # Business logic
│   ├── middlewares/    # Express middleware (auth, validation, stripe)
│   ├── routes/         # API route definitions
│   ├── types/          # TypeScript type definitions
│   ├── utils/          # Utility functions (e.g., error handling)
│   ├── validation/     # Joi validation schemas
│   ├── __tests__/      # Unit tests (Jest)
│   ├── app.ts          # Express application setup
│   └── server.ts       # Server entry point
├── docs/               # Project documentation (including refactor summaries)
├── .env.example        # Environment variable template
├── jest.config.ts      # Jest configuration
├── package.json
└── tsconfig.json
```
*(Updated `summaries/` to `docs/`)*

## 4. Implemented Features (as of Sprint 4, Week 1)

*   **Authentication:** User registration, login, JWT generation/validation, refresh tokens, role-based access control middleware (`src/middlewares/authMiddlewares.ts`).
*   **User Profile:** Fetching, updating user profiles, and password updates implemented and unit tested (`src/controllers/userController.ts`, `src/services/userServices.ts`, `src/__tests__/unit/userService.test.ts`).
*   **Event Management:** Full CRUD, status transitions, free/paid event distinction (`isFree` flag), role-based visibility and filtering. Refined logic for updating associated questions (`src/controllers/eventController.ts`, `src/services/eventServices.ts`). Enhanced unit test coverage (`src/__tests__/unit/eventService.test.ts`).
*   **Ticket Management:** CRUD for ticket types associated with events, pricing, availability checks, sales periods, validation against sold quantities, ownership authorization checks. Routes refactored for consistency (`/events/:eventId/tickets/:ticketId`). Ownership authorization added to service layer (`src/controllers/ticketController.ts`, `src/services/ticketServices.ts`). Good unit test coverage (`src/__tests__/unit/ticketService.test.ts`).
*   **Registration System:**
    *   Creation implemented for guests/users.
    *   **Refactored to support multiple participants (attendees) and multiple ticket types per registration.** Includes `Attendee` and `PurchaseItem` models. Manually tested for guest and logged-in user scenarios.
    *   `optionalAuthenticate` middleware now used for `POST /api/registrations` to securely derive `userId` from JWT for authenticated users. `CreateRegistrationDto` and Joi validation updated to remove `userId` from request body.
    *   Handles conditional status (`PENDING` for paid, `CONFIRMED` for free).
    *   Retrieval (`GET /registrations`, `GET /registrations/:id`) implemented with authorization and updated includes.
    *   **Cancellation implemented** (`PATCH /registrations/:registrationId`) allowing owner/admin to cancel, including decrementing ticket count based on `PurchaseItem` quantities.
    *   **Validation re-enabled** for `POST /registrations` using Joi, including custom validation for matching participant count to ticket quantity.
*   **Questionnaire Management:** Custom questions per event, response collection from participants during registration, now linked via `Attendee`.
*   **Payment Processing:** **(Core Backend Functionality Manually Tested)**
    *   Added Stripe dependencies and configured environment variables.
    *   Updated `Payment` and `Purchase` models in Prisma schema and migrated database.
    *   Created payment types, service, controller, and routes.
    *   Implemented and manually tested logic for creating Stripe Payment Intents (`createPaymentIntent`) with validation and authorization. Uses `optionalAuthenticate` middleware for JWT-based user identification, and temporary tokens for guests.
    *   Implemented and manually tested **Guest Payment Token System** (generation, hashing, storage, expiry, validation).
    *   Implemented and manually tested webhook handler (`handleWebhookEvent`) for `payment_intent.succeeded` and `payment_intent.payment_failed` events, including database status updates.
    *   Implemented, reviewed, corrected, and manually tested **Webhook Signature Verification** middleware.
    *   Correctly configured `express.raw()` middleware for the webhook route in `app.ts`.
*   **Database:** Schema defined (`prisma/schema.prisma`), migrations applied (`prisma/migrations/`), seeding script (`prisma/seed.ts`). Includes migrations for Attendee, PurchaseItem, and Guest Payment Token refactors.
*   **Basic Setup:** Project structure, dependencies, TypeScript config, Jest setup (`src/__tests__/setup.ts`) including test DB cleanup logic.
*   **API Documentation:** Basic Swagger setup (`src/config/swagger.ts`) exists, needs population/refinement.
*   **Custom Errors:** Added `AuthorizationError` and `NotFoundError` to `src/utils/errors.ts`.

## 5. Known Issues, Limitations & Technical Debt

*   **Registration Features:** Full registration *updates* not implemented. Cancellation logic does not yet include *refund processing* for paid events.
*   **Unit Testing:** 
    *   Unit tests for `RegistrationService` (covering multi-participant/multi-ticket refactoring and various scenarios) have been created and are **PASSING**.
    *   Initial unit tests for `PaymentService` have been created, but are currently encountering Jest mocking/hoisting issues. Further work on these specific tests is temporarily paused.
*   **Admin Features:** Admin user management endpoints are defined in routes; implementation is currently in progress by Steven.
*   **Integration Testing:** No integration tests currently exist.
*   **Error Handling:** Could be standardized further across all services/controllers. Webhook error handling could be more robust (e.g., retry mechanisms, alerting).
*   **Logging:** Minimal logging implemented.
*   **Image Uploads:** No functionality for handling image uploads.
*   **Notifications:** No email or other notification system implemented.
*   **Participant Service:** Minimal implementation (`findOrCreateParticipant` only). Lacks dedicated get/update methods.
*   **Payment Module:** Core manual API flows for registration, payment intent creation, and webhook handling (success/failure) have been tested. Still requires comprehensive unit and integration testing, and frontend integration. Webhook handler needs refinement for more event types if necessary. Currency is currently hardcoded ('aud'). Guest payment token invalidation after use is not yet implemented (logic present but commented out in `PaymentService`).

## 6. Immediate Next Steps & Future Development Plan

**Current Focus (Sprint 4 - Updated):**
*   **Manually Test Payment Flow:** Payment intent creation (guest and user) and webhook handling (`payment_intent.succeeded`, `payment_intent.payment_failed`) using Stripe CLI and mock UI **COMPLETED**.
*   **Unit Testing:** 
    *   `RegistrationService` unit tests: **COMPLETED & PASSING**.
    *   `PaymentService` unit tests: Fix Jest mocking issues and complete tests. (High Priority - Currently Paused)
*   **Implement Refund Logic:** Add refund processing (via Stripe API) to the `cancelRegistration` method. (High Priority)
*   **Frontend Integration:** Work with frontend to integrate Stripe Elements and the payment backend endpoints. (Very High Priority)

**Future Development Plan (Prioritized based on existing Frontend):**
1.  **Admin User Management:** Implementation in progress by team member. (High Priority)
2.  **Email Notifications:** Implement email sending for key user flows (registration, cancellation, password reset). (High Priority)
3.  **Integration Testing:** Add API-level tests for key user flows (registration, payment). (Medium Priority - Ongoing)
4.  **Deployment:** Plan and begin setup on Render (Web Service, DB, Env Vars, Migrations). (Medium Priority - Ongoing)
6.  **Reporting System (Basic):** Implement basic organizer reports if required by admin dashboard, otherwise potentially defer. (Low/Medium Priority)
7.  **Refine API & Support Frontend:** Address any specific data needs or endpoint adjustments identified during frontend refinement. (Ongoing)
8.  **Advanced Features:** Advanced reporting, image uploads, etc. (Lower Priority)

## 7. Critical Design Decisions & Tradeoffs

*   **Participant Model:** Using a single `Participant` model linked optionally to `User` supports guest registration.
*   **Explicit `isFree` Flag:** Added `isFree` boolean to `Event` model for clarity.
*   **Conditional Registration Status:** Using `PENDING` for paid events until payment is confirmed via webhook.
*   **Transaction-Based Operations:** Using Prisma transactions for multi-entity operations (event creation, registration, event update, registration cancellation, webhook processing).
*   **Multi-Level Validation:** Validation at route middleware (Joi), service layer (business rules), and database constraints.
*   **JWT Authentication:** Using JWT with refresh tokens stored in HTTP-only cookies for logged-in users.
*   **Ownership Authorization:** Implemented primarily in the service layer by passing `userId` and checking against resource owner IDs.
*   **Attendee Model:** Explicitly linking Registration and Participant via `Attendee` provides a clear way to manage individual attendees and their responses.
*   **PurchaseItem Model:** Decoupling ticket details from the main `Purchase` via `PurchaseItem` allows a single purchase to include multiple ticket types.
*   **Guest Payment Authorization:** Using temporary, hashed, expiring tokens stored in the `Purchase` record to authorize payment intent creation for guests.

## 8. Environment Setup

**Development Setup:**
1.  Clone the repository.
2.  Run `npm install` to install dependencies.
3.  Configure environment variables in a `.env` file (copy from `.env.example`). Key variables include database connection string, JWT secrets, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET`.
4.  Run `npm run db:setup` (or equivalent like `npx prisma migrate dev --name init && npx prisma db seed`) to apply database migrations and seed initial data. Ensure all migrations are applied.
5.  Start the development server using `npm run dev`.

**Test Accounts (Created during seeding):**
*   Admin: `admin@example.com` / `Admin123!`
*   Organizer: `john.smith@example.com` / `Organizer123!`
*   Participant: `participant1@example.com` / `Participant123!`

*(Project follows a 4-sprint cycle, aiming for completion by end of Week 12)*
