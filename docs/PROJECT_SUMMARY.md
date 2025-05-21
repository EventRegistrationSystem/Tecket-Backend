# Project Summary: Event Registration System Backend

**Last Updated:** 21/05/2025

## 1. Project Purpose and Core Functionalities

**Purpose:**
To provide a robust backend API for managing events, registrations, tickets, and associated questionnaires. The system enables event organizers to create and manage events (both free and paid) and allows participants (registered users or guests) to browse, register, and complete event-specific questionnaires. Secure payment processing is planned for paid events.

**Core Functionalities:**
*   **User Management & Authentication:**
    *   JWT-based authentication (access and refresh tokens). Refresh tokens stored in secure HttpOnly cookies.
    *   Role-Based Access Control (PARTICIPANT, ORGANIZER, ADMIN).
    *   Profile management (get/update), password management.
    *   `authMiddlewares.ts` improved: `optionalAuthenticate` now correctly triggers a 401 for expired/invalid tokens (to enable frontend refresh flow), and `authenticate` correctly throws `AuthenticationError` for missing tokens.
    *   Comprehensive ADMIN privilege system implemented across services, allowing ADMINs to bypass ownership checks.
    *   **Admin User Management (Backend):** Full CRUD operations for managing user accounts by ADMINs implemented (backend services and routes).
*   **Event Management:**
    *   Full CRUD operations, status management, support for free/paid events, advanced filtering/search, role-based visibility.
    *   `EventService.updateEvent` now handles monolithic updates for associated tickets and questions by orchestrating calls to `TicketService` and `EventQuestionService` within a transaction. This was a strategic reversion to simplify frontend integration while retaining backend modularity.
*   **Ticket Management:**
    *   Dedicated service (`TicketService`) and granular API endpoints (`/api/events/:eventId/tickets/*`) for CRUD operations, pricing, availability, sales periods, and validation.
    *   `TicketService` methods are transaction-aware (accepting Prisma `tx` client) for use by `EventService`.
    *   ADMIN privileges and ownership checks are enforced.
*   **Questionnaire Management (Event-Specific Questions):**
    *   Dedicated service (`EventQuestionService`) and granular API endpoints (`/api/events/:eventId/questions/*`) for managing links between events and global questions, including `isRequired` and `displayOrder`.
    *   `EventQuestionService` handles find-or-create logic for global `Question` entities and is transaction-aware.
    *   ADMIN privileges and ownership checks are enforced.
    *   Joi validation for question link DTOs implemented.
*   **Registration System:**
    *   Supports registered users and guests, linking participants to events.
    *   Handles conditional status (`PENDING` for paid, `CONFIRMED` for free).
    *   **Refactored for multiple participants (attendees) and multiple ticket types per registration.**
    *   Retrieval and cancellation implemented with ADMIN/ownership checks.
    *   Joi validation for registration payloads.
    *   **Admin/Organizer Registration Viewing (Backend):** Implemented backend APIs for admins/organizers to view registration lists for specific events (`GET /api/events/:eventId/registrations`), view system-wide registration summaries (`GET /api/registrations/admin/all-system-summary`), and retrieve detailed information for a single registration (`GET /api/registrations/:registrationId` enhanced for full details).
*   **Payment Processing (Stripe):** **(Core Backend Functionality Implemented & Manually Tested; Further Development Postponed)**
    *   Core logic for creating Stripe Payment Intents and handling webhooks for payment success/failure is in place and tested.
    *   Guest Payment Token system implemented.
    *   Further enhancements (e.g., refund processing) and full frontend integration are postponed.
*   **Notifications:** Basic infrastructure not yet implemented; major notification features are postponed.
*   **Reporting & Analytics:** (Planned) Data collection to support future reporting for organizers/admins.

## 2. Technology Stack

*   **Language:** TypeScript
*   **Runtime:** Node.js
*   **Framework:** Express.js
*   **Database:** MySQL
*   **ORM:** Prisma
*   **Authentication:** JWT (access & HttpOnly refresh tokens), bcrypt. Refresh token rotation implemented. `authMiddlewares.ts` enhanced for better error propagation for expired/missing tokens.
*   **Validation:** Joi (schema validation for request payloads). Partially re-enabled for some routes.
*   **Testing:** Jest (Unit tests with Prisma/bcrypt mocks).
*   **Payment Gateway:** Stripe (using Stripe Node.js SDK)

## 3. Architecture and Component Structure

**Architecture:**
Layered Architecture:
1.  **Routes (`src/routes/`):** Define API endpoints, apply middleware (authentication, validation).
2.  **Controllers (`src/controllers/`):** Handle HTTP request/response cycle, pass user context (ID, role) to services. Error handling standardized in `EventController` to return specific HTTP status codes for custom errors.
3.  **Services (`src/services/`):** Encapsulate core business logic. `EventService` orchestrates complex updates. `TicketService` and `EventQuestionService` manage their respective domains and are transaction-aware. All services implement ADMIN privilege bypass for ownership checks.
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

## 4. Frontend System

**Purpose:**
Provides the user interface for interacting with the Event Registration System backend. Enables users (participants, organizers, and admins) to browse events, register, manage profiles, and access admin functionalities.

**Technology Stack:**
*   **Framework:** Vue.js (using Composition API and Pinia for state management)
*   **Build Tool:** Vite
*   **Routing:** Vue Router
*   **API Communication:** Native Fetch API wrapped with custom authentication handling in Pinia store.

**High-Level Architecture:**
*   **Views (`src/views/`):** Top-level components representing different pages/routes.
*   **Components (`src/components/`):** Reusable UI elements.
*   **Router (`src/router/index.js`):** Defines application routes and maps them to views.
*   **Store (`src/store/user.js`):** Pinia store for managing application state, including user authentication (`accessToken`, `role`) and a `customFetch` function for authenticated API calls.
*   **API Services (`src/api/`):** Modules for making specific API calls to the backend (`events.js`, `locations.js`, `users.js`).

**Key Views and User Flows (Based on Router):**
*   **User-Facing:** Home, Event Listing, Event Detail, Sign In, Sign Up, Multi-step Registration/Questionnaire (Select Category, Personal Info, Questionnaire, Review, Checkout), User Profile, User Management (self), User Events.
*   **Admin-Facing:** Dashboard, Event Management (List, Create, Detail, Edit), User Management (List, Create, Detail, Edit), Ticket Management (List, Management per Event, User/Participant Details, Create, Edit), Questionnaire Management (List, View per Event).

**API Integration Points:**
*   API calls are made from within views or API service files using `fetch` wrapped by the `userStore.customFetch` function to automatically include JWT for authenticated requests.
*   API service files (`src/api/`):
    *   `events.js`: Handles fetching/managing events and ticket types.
    *   `locations.js`: Handles fetching locations (endpoint needs verification).
    *   `users.js`: Handles fetching user profile and admin user management (endpoints need verification, admin routes currently commented out on backend).
    *   `tickets.js`: (Deprecated - functions moved to `events.js`)

**State Management:**
*   Pinia is used for state management, with `useUserStore` handling authentication state (`accessToken`, `role`) and providing the `customFetch` utility.

**Known Issues / Areas for Improvement (Frontend Specific):**
*   Inconsistent use of `API_BASE_URL` vs `import.meta.env.VITE_API_BASE_URL` in older API functions (mostly resolved).
*   Duplication of ticket-related API functions (resolved by removing from `tickets.js`).
*   Potential endpoint mismatches for `/locations`, `/events/:eventId/attendees`, and admin user management endpoints (requires backend verification).
*   Error handling in API calls could be more standardized and user-friendly.
*   Admin user management backend routes are currently commented out, preventing full frontend integration.

**Recent Frontend Developments (as of 2025-05-19):**
*   **Event Registration Flow (Initial Implementation):**
    *   Successfully integrated the creation flow for event registrations (paid events focus, payment processing deferred).
    *   Users can navigate from event details, select tickets, provide personal information for multiple participants, and answer dynamic event-specific questionnaires.
    *   A review page summarizes all information before submission.
    *   Submission calls the backend `POST /api/registrations` endpoint.
    *   Navigation to success or pending payment pages based on event type (free/paid).
*   **State Management for Registration:**
    *   Created `src/store/registrationStore.js` (Pinia) to manage state across the multi-step registration process (event details, selected tickets, participant info, questionnaire responses).
    *   Created `src/api/registrationServices.js` for API calls related to registration.
*   **View Refactoring for Registration:**
    *   `EventDetailsView.vue` now fetches full event details (including tickets and questions) and initializes the registration store.
    *   Registration step views (`TicketSelectionFormView.vue`, `PersonalInfoFormView.vue`, `QuestionnaireFormView.vue`, `ReviewFormView.vue`) refactored to use `registrationStore` and handle dynamic data.
    *   New views created: `RegistrationSuccessView.vue` and `RegistrationPendingPaymentView.vue`.
*   **Admin Registration Management Views (Implemented):**
    *   Implemented frontend views for the completed backend read APIs:
        *   Event-Specific Registration List (`src/views/admin/Registration/EventRegistrationListView.vue`)
        *   System-Wide Registration List (`src/views/admin/Registration/SystemRegistrationListView.vue`)
        *   Detailed Registration View (`src/views/admin/Registration/RegistrationDetailsView.vue`)
    *   These views are integrated into the Admin Layout and routing.
*   **User Experience Enhancements:**
    *   Added a "Cancel Registration" button to the `StepIndicator.vue` component, allowing users to exit the flow and reset registration state.
*   **Router Refactoring:**
    *   Standardized all route component imports in `src/router/index.js` to use dynamic imports (lazy loading) for better performance.
    *   Modularized the router configuration:
        *   Created `src/router/modules/` directory.
        *   Split routes into logical files: `publicRoutes.js`, `authRoutes.js`, `registrationRoutes.js`, `adminRoutes.js`, `userProfileRoutes.js`.
        *   Created `src/router/index-1.js` as the new main router file, importing these modules (original `index.js` kept as backup).
*   **Admin Dashboard Cleanup:**
    *   Removed the top-level "Tickets" management link from the admin sidebar.
    *   Removed associated routes from the router.
    *   Associated view files for this top-level ticket management were manually deleted.
*   **Bug Fixes & Debugging:**
    *   Addressed a "Maximum recursive updates" warning in `PersonalInfoFormView.vue`.
    *   Investigated and clarified that missing questionnaire questions for a test event were due to no questions being associated with that event in the backend data.
    *   Improved rendering of questionnaire questions with a fallback for unrecognized types.

## 5. Implemented Features (as of Sprint 4, Week 1)

*   **Authentication & Authorization:**
    *   User registration, login, JWT generation/validation, HttpOnly refresh tokens with rotation.
    *   Role-based access control middleware (`authenticate`, `authorize`).
    *   `optionalAuthenticate` improved to return 401 for expired/invalid tokens.
    *   Comprehensive ADMIN privilege system implemented across services.
    *   **Admin User Management (Backend):** Backend CRUD operations for users by ADMINs completed.
*   **User Profile:** Fetching, updating user profiles, and password updates.
*   **Event Management:**
    *   Full CRUD, status transitions, free/paid event distinction, role-based visibility.
    *   `EventService.createEvent` handles initial creation of event with tickets and questions.
    *   `EventService.updateEvent` refactored to manage monolithic updates of an event including its tickets and questions by orchestrating calls to transaction-aware `TicketService` and `EventQuestionService`.
*   **Ticket Management:**
    *   Dedicated `TicketService` and granular API for CRUD, pricing, availability, etc.
    *   Methods made transaction-aware.
*   **Questionnaire Management (Event-Specific Questions):**
    *   Dedicated `EventQuestionService` and granular API for managing event-question links.
    *   Handles find-or-create for global questions.
    *   Methods made transaction-aware.
    *   Joi validation for question link DTOs added.
*   **Registration System:**
    *   Refactored for multiple participants (attendees) and multiple ticket types per registration.
    *   CRUD operations with ADMIN/ownership checks. Joi validation for payloads.
    *   **Registration Management (Admin/Organizer View - Backend Read APIs):**
        *   `GET /api/events/:eventId/registrations`: Implemented for admins/organizers to list registration summaries for a specific event with filtering and pagination.
        *   `GET /api/registrations/admin/all-system-summary`: Implemented for admins to list all registration summaries system-wide with comprehensive filtering and pagination (serves the purpose of planned `/api/admin/registrations`).
        *   `GET /api/registrations/:registrationId`: Enhanced to return full registration details, including all attendees, their questionnaire responses, and purchase/ticket information.
*   **Payment Processing (Stripe):** **(Core Backend Functionality Implemented & Manually Tested)**
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
*   **Error Handling:** Standardized in `EventController`. `authMiddlewares` improved. Global error handler implementation is pending.
*   **Logging:** Basic `console.log` and `console.error` used.
*   **Image Uploads:** No functionality for handling image uploads.
*   **Notifications (Core):** Postponed.
*   **Participant Service:** Minimal implementation.
*   **Payment Module:** Core backend logic for Stripe payment intents and webhooks implemented and manually tested. Further development and full frontend integration postponed. Refund logic postponed.

## 6. Immediate Next Steps & Future Development Plan (Revised 2025-05-19)

**Current Development Focus (High Priority):**
1.  **Registration Management (Admin/Organizer - Backend & Frontend):**
    *   **Backend:**
        *   **Read APIs (View/Search): COMPLETED.** Endpoints for admins/organizers to view and search registration details (list for event, list all for admin, get by ID) are implemented.
        *   **Next Backend Steps:** Implement update/action APIs (e.g., update status, limited edits, export).
    *   **Frontend:** Develop UI components for these registration management features, starting with integrating the completed read APIs.
2.  **Support New Question Types (Backend & Frontend):**
    *   **Backend:** Update Prisma schema (`QuestionType` enum, add `options` field to `Question` model for choices). Modify services and DTOs to handle at least one new type (e.g., multiple-choice/dropdown) including storage and retrieval of options.
    *   **Frontend:** Update event creation/question management UI to allow organizers to define new question types and their options. Update registration questionnaire form to render these new types.
3.  **Frontend Static Data Cleanup:**
    *   **Frontend:** Systematically replace mock data in frontend components with live API calls to the backend.
4.  **Backend Joi Validations:**
    *   Re-enable `validateRequest(createEventSchema)` (events) and `validateRequest(addEventQuestionLinkSchema)` (event questions).
    *   Create and apply Joi schemas for `updateEvent` and `updateEventStatus` payloads.
5.  **Finalize Refresh Token Flow (Frontend/Backend):**
    *   Continue debugging to ensure robust and seamless token refresh when access tokens expire.

**Postponed / Lower Priority (Based on Client Feedback):**
*   Advanced Payment Features (e.g., Refund Processing via Stripe API).
*   PaymentService Unit Tests (beyond initial setup).
*   Core Email Notification System.

**Ongoing & Future Development:**
*   **Admin User Management (Frontend Integration):** Integrate frontend UI with completed backend admin user management APIs.
*   **Global Error Handler (Backend):** Re-implement a robust global error handler in `app.ts`.
*   **Integration Testing:** Add API-level tests for key user flows.
*   **Deployment:** Plan and execute deployment to Render.
*   **Reporting System (Basic).**
*   **Refine API & Support Frontend (General).**
*   **Advanced Features (Image uploads, etc.).**

## 7. Critical Design Decisions & Tradeoffs

*   **Participant Model:** Using a single `Participant` model linked optionally to `User` supports guest registration.
*   **Explicit `isFree` Flag:** Added `isFree` boolean to `Event` model for clarity.
*   **Conditional Registration Status:** Using `PENDING` for paid events until payment is confirmed via webhook.
*   **Transaction-Based Operations:** Consistent use of Prisma transactions for complex CUD operations.
*   **Multi-Level Validation:** Route middleware (Joi), service layer (business rules), database constraints.
*   **JWT Authentication:** Access and HttpOnly refresh tokens. Refresh token rotation in place. Middleware improved for handling expired tokens.
*   **Ownership Authorization & ADMIN Privileges:** Standardized across services: ORGANIZERs own resources, ADMINs have bypass privileges.
*   **Attendee Model:** Explicitly linking Registration and Participant via `Attendee` provides a clear way to manage individual attendees and their responses.
*   **PurchaseItem Model:** Decoupling ticket details from the main `Purchase` via `PurchaseItem` allows a single purchase to include multiple ticket types.
*   **Guest Payment Authorization:** Using temporary, hashed, expiring tokens for guest payment intent creation.
*   **Event Update Strategy:** Reverted `EventService.updateEvent` to a monolithic style (orchestrating calls to specialized, transaction-aware services for tickets/questions) to simplify frontend integration, while retaining granular APIs.

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
