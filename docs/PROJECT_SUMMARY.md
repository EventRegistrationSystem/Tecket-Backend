# Project Summary: Event Registration System Backend

**Last Updated:** 2025-05-31
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
    *   **Admin User Management (Backend & Frontend):** Full CRUD operations for managing user accounts by ADMINs implemented (backend services, routes, and frontend UI views).
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
    *   **Choice-Based Questions (Backend & Frontend):** Backend and frontend support for `DROPDOWN` (single-choice) and `CHECKBOX` (multiple-choice) questions implemented. This includes defining questions with predefined options, storing these options, validating participant responses, and rendering/capturing these in the UI.
*   **Registration System:**
    *   Supports registered users and guests, linking participants to events.
    *   Handles conditional status (`PENDING` for paid, `CONFIRMED` for free).
    *   **Refactored for multiple participants (attendees) and multiple ticket types per registration.**
    *   Retrieval and cancellation implemented with ADMIN/ownership checks. (Note: Full registration details update, including questionnaire responses, not yet implemented).
    *   Joi validation for registration payloads.
    *   **Admin/Organizer Registration Viewing & Management (Backend & Frontend):**
        *   Backend APIs implemented for admins/organizers to view registration lists for specific events, view system-wide registration summaries (admin only), retrieve detailed information for a single registration, and update registration status.
        *   Frontend UI components/views for admin registration management (Read system-wide registration, registration per event, registration details, update registration status) are implemented.
        *   Organizers reuse these views and components, but currently only for their events (viewing all system-wide registrations is not yet implemented for organizers).
*   **Payment Processing (Stripe):** **(Core Backend Functionality Implemented & Manually Tested; Further Development Postponed for MVP)**
    *   Core logic for creating Stripe Payment Intents and handling webhooks for payment success/failure is in place and tested.
    *   Guest Payment Token system implemented.
    *   Further enhancements (e.g., refund processing) and full frontend integration are postponed.
*   **Notifications (Email):** Basic email notification system implemented.
*   **Reporting & Analytics (Backend):** Backend for report generation implemented, providing comprehensive event reports including sales, attendance, and questionnaire responses. (Frontend UI for reporting is in progress).

## 2. Technology Stack

*   **Language:** TypeScript
*   **Runtime:** Node.js
*   **Framework:** Express.js
*   **Database:** MySQL
*   **ORM:** Prisma
*   **Authentication:** JWT (access & HttpOnly refresh tokens), bcrypt. Refresh token rotation implemented. `authMiddlewares.ts` enhanced for better error propagation for expired/missing tokens.
*   **Validation:** Joi (schema validation for request payloads). Partially re-enabled for some routes; comprehensive validation deferred for MVP.
*   **Testing:** Jest (Unit tests with Prisma/bcrypt mocks). Comprehensive testing deferred for MVP.
*   **Payment Gateway:** Stripe (using Stripe Node.js SDK)
*   **Deployment (In Progress):** Docker (Dockerfile, docker-compose.yml created for VPS deployment).

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
*   `Question`: Custom questions. The `QuestionType` enum currently supports `TEXT`, `CHECKBOX`, `DROPDOWN`. Includes an `options` relation to `QuestionOption[]` for choice-based questions.
*   `QuestionOption`: Stores predefined choices for questions (e.g., for `DROPDOWN` type), linked to `Question`.
*   `EventQuestions`: Links `Event` and `Question`, stores `isRequired`, `displayOrder`.
*   `Registration`: Links `Participant` to `Event`, stores `status`.
*   `Attendee`: Links `Registration` and `Participant`, representing an individual attending under a registration. Has many `Response` records.
*   `Response`: Participant answers to `EventQuestions`, linked to an `Attendee`. `responseText` stores a single string for `TEXT`/`DROPDOWN` and a JSON string array for `CHECKBOX` selections.
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
*(Note: Previous mention of "Updated `summaries/` to `docs/`" is retained for historical context if needed, though the structure shown is current.)*

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
*   **Router (`src/router/index.js` or `src/router/index-1.js`):** Defines application routes and maps them to views.
*   **Store (`src/store/user.js`, `src/store/registrationStore.js`):** Pinia stores for managing application state.
*   **API Services (`src/api/`):** Modules for making specific API calls.

**Key Views and User Flows (Based on Router):**
*   **User-Facing:** Home, Event Listing, Event Detail, Sign In, Sign Up, Multi-step Registration/Questionnaire, User Profile, User Management (self), User Events.
*   **Admin-Facing:** Dashboard, Event Management, User Management, Ticket Management (within events), Questionnaire Management.

**API Integration Points:**
*   API calls use `fetch` wrapped by `userStore.customFetch`.
*   API service files in `src/api/` (e.g., `events.js`, `users.js`, `registrationServices.js`).

**State Management:**
*   Pinia (`useUserStore`, `registrationStore`).

**Known Issues / Areas for Improvement (Frontend Specific - from previous summary, verify current relevance):**
*   Inconsistent use of `API_BASE_URL` (mostly resolved).
*   Potential endpoint mismatches (requires backend verification).
*   Error handling in API calls could be more standardized.
*   Admin user management backend routes were previously commented out (now integrated).

**Recent Frontend Developments (Incorporating updates up to 2025-05-31):**
*   **Event Registration Flow (Initial Implementation):** Completed.
*   **State Management for Registration:** Completed.
*   **View Refactoring for Registration:** Completed.
*   **Admin Registration Management Views (Implemented):** For read operations and status updates. Organizers reuse these for their events.
*   **User Experience Enhancements (Cancel Registration):** Implemented.
*   **Router Refactoring (Dynamic Imports, Modularization):** Completed.
*   **Admin Dashboard Cleanup (Tickets link removed):** Completed.
*   **Bug Fixes & Debugging (Recursive updates, questionnaire rendering):** Addressed.
*   **Support for `DROPDOWN` and `CHECKBOX` Question Types (Frontend):** Implemented in `EventFormView.vue` and `QuestionnaireFormView.vue`.
*   **UI Views for User Management (CRUD):** Implemented.
*   **Mock Data Replacement:** Most mock data in admin/organizer dashboards replaced with live API calls (user profile section may still have some).

## 5. Implemented Features (Summary as of 2025-05-31)

*   **Authentication & Authorization:** Core functionalities complete.
*   **User Profile:** Fetching, updating user profiles, and password updates.
*   **Admin User Management (Backend & Frontend):** Full CRUD operations implemented.
*   **Event Management:** Core functionalities complete.
*   **Ticket Management:** Core functionalities complete.
*   **Questionnaire Management (Event-Specific Questions):** Core functionalities complete, including backend & frontend support for `DROPDOWN` and `CHECKBOX` types.
*   **Registration System:**
    *   Refactored for multiple participants (attendees) and ticket types.
    *   Backend Read APIs for Admin/Organizer registration viewing.
    *   Backend API for updating registration status.
    *   Frontend views for Admin/Organizer registration management (read, status update).
*   **Payment Processing (Stripe):** Core backend logic implemented and manually tested. Full integration/further features postponed for MVP.
*   **Reporting (Backend):** Backend service and API for generating comprehensive event reports.
*   **Email Notification System:** Basic implementation.
*   **Database:** Schema defined, migrations applied, seeding script available.
*   **API Documentation:** Basic Swagger setup with JSDoc annotations for report generation feature.
*   **Custom Errors:** Implemented.

## 6. Known Issues, Limitations & MVP Strategy

*   **MVP Focus:** To achieve a Minimum Viable Product (MVP), the current strategy involves prioritizing the completion of core features, specifically **Image Handling** and **Report Generation (Frontend UI)**.
*   **Deferred Testing & Validation:** Comprehensive unit testing, integration testing, and full Joi validation on all routes are being deferred to focus on MVP features. Some validation remains on critical paths. A dedicated phase for thorough testing and bug fixing is planned post-MVP.
*   **Registration Features:** Full registration *details update* (including questionnaire responses) not yet implemented. Cancellation logic does not yet include *refund processing* for paid events.
*   **Admin Features:** While admin user management is complete, system-wide registration viewing for Organizers (as opposed to Admins) is not yet implemented.
*   **Error Handling:** While custom errors exist and some standardization is done, a comprehensive global error handler (backend) is still pending.
*   **Logging:** Basic `console.log` and `console.error` used.
*   **Participant Service:** Minimal implementation (as per previous summary).
*   **User Profile Mock Data:** User profile section in dashboards may still use mock data.
*   **Unit Testing (PaymentService):** Initial unit tests for `PaymentService` were encountering Jest mocking/hoisting issues; further work on these specific tests was temporarily paused (as per previous summary).

## 7. Current Work in Progress & Immediate Next Steps (Revised 2025-05-31)

**MVP Completion Focus (Highest Priority):**
1.  **Image Handling (Backend & Frontend):** Implement functionality for uploading and managing images (e.g., for events, user profiles).
2.  **Report Generation (Frontend UI):** Develop the frontend UI to consume the existing reporting backend API and display event reports.
3.  **Backend/Database Deployment to VPS:** Continue and finalize deployment using Docker (`Dockerfile` and `docker-compose.yml` are created).

**Post-MVP Focus (Following completion of Image Handling & Reporting):**
1.  **Thorough Testing & Bug Fixing:**
    *   Conduct comprehensive unit and integration testing.
    *   Address any bugs identified during testing or from MVP usage.
2.  **Validation Enhancement:** Implement/re-enable full Joi validation across all relevant API routes.
3.  **Documentation:**
    *   Complete technical design documentation.
    *   Create/finalize user manual, developer guide, setup manual, and deployment manual.
4.  **Code Cleanup and Standardization:**
    *   Review and standardize routing/naming conventions.
    *   Ensure consistent role verification.
    *   Implement a robust global error handler (backend).
5.  **Finalize Refresh Token Flow (Frontend/Backend):** Ensure robust and seamless token refresh.

**Other Planned Work (Lower Priority / Future Enhancements):**
*   **Registration Details Update:** Implement full update functionality for registrations, including questionnaire responses.
*   **Advanced Payment Features:** Implement refund processing via Stripe API.
*   **Refactor Database Design Inconsistencies:** Address issues like the naming of the "Attendee" model if deemed necessary.
*   **Simplified User Profile Management:** (Very low priority).
*   Address any other leftover items from previous stages.
*   **Backend Joi Validations (from previous plan):**
    *   Re-enable `validateRequest(createEventSchema)` (events) and `validateRequest(addEventQuestionLinkSchema)` (event questions).
    *   Create and apply Joi schemas for `updateEvent` and `updateEventStatus` payloads.

**Postponed / Lower Priority (Based on Client Feedback - from previous summary):**
*   Advanced Payment Features (e.g., Refund Processing via Stripe API) - *Reiterated above*.
*   PaymentService Unit Tests (beyond initial setup) - *Noted in Known Issues*.
*   Core Email Notification System - *Marked as basic implementation done, further enhancements likely postponed*.

## 8. Critical Design Decisions & Tradeoffs

*   **Participant Model:** Using a single `Participant` model linked optionally to `User` supports guest registration.
*   **Explicit `isFree` Flag:** Added `isFree` boolean to `Event` model for clarity.
*   **Conditional Registration Status:** Using `PENDING` for paid events until payment is confirmed via webhook.
*   **Transaction-Based Operations:** Consistent use of Prisma transactions for complex CUD operations.
*   **Multi-Level Validation:** Route middleware (Joi), service layer (business rules), database constraints. (Note: Joi validation partially deferred for MVP).
*   **JWT Authentication:** Access and HttpOnly refresh tokens. Refresh token rotation in place. Middleware improved for handling expired tokens.
*   **Ownership Authorization & ADMIN Privileges:** Standardized across services: ORGANIZERs own resources, ADMINs have bypass privileges.
*   **Attendee Model:** Explicitly linking Registration and Participant via `Attendee` provides a clear way to manage individual attendees and their responses.
*   **PurchaseItem Model:** Decoupling ticket details from the main `Purchase` via `PurchaseItem` allows a single purchase to include multiple ticket types.
*   **Guest Payment Authorization:** Using temporary, hashed, expiring tokens for guest payment intent creation.
*   **Event Update Strategy:** Reverted `EventService.updateEvent` to a monolithic style (orchestrating calls to specialized, transaction-aware services for tickets/questions) to simplify frontend integration, while retaining granular APIs.
*   **MVP Prioritization:** Conscious decision to defer comprehensive testing and some validation to accelerate delivery of core MVP features.

## 9. Environment Setup

This section outlines how to get the backend running on your local machine.

**Prerequisites:**
*   **Git**
*   **Node.js:** v16.x or higher (nvm recommended).
*   **npm** or **yarn**.
*   **Docker Desktop:** (Recommended) For running containers locally.
*   **MySQL Server:** (Only if not using Docker for the database).

### Option 1: Using Docker Compose (Recommended)

This method uses Docker to containerize both the backend application and the MySQL database.

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/EventRegistrationSystem/Tecket-Backend.git # Replace with actual repo URL if different
    cd Tecket-Backend
    ```
2.  **Configure Environment Variables:**
    *   Copy `.env.example` to `.env`:
        ```bash
        cp .env.example .env
        ```
    *   Update `.env` with your settings. For Docker Compose, `DATABASE_URL` should use the service name (e.g., `db`):
        ```
        DATABASE_URL="mysql://username:password@db:3306/db_name"
        MYSQL_ROOT_PASSWORD="your_mysql_root_password"
        MYSQL_DATABASE="your_database_name"
        MYSQL_USER="your_database_user"
        MYSQL_PASSWORD="your_database_password"
        # ... other variables like JWT_SECRET, STRIPE_SECRET_KEY, SMTP_USER, etc.
        ```
3.  **Build and Run Containers:**
    ```bash
    sudo docker-compose up -d --build
    ```
4.  **Run Database Migrations and Seed Data:**
    ```bash
    sudo docker-compose exec app npx prisma migrate deploy
    sudo docker-compose exec app npx prisma db seed
    ```
5.  **Access API:** The API should be running at `http://localhost:3000` (or your configured `PORT`).
6.  **Stop Containers:**
    ```bash
    sudo docker-compose down
    ```

### Option 2: Without Docker (Directly on Host)

This method requires a locally installed and running MySQL server.

1.  **Clone the Repository:** (As above)
2.  **Install Dependencies:**
    ```bash
    npm install
    ```
3.  **Configure Environment Variables:**
    *   Copy `.env.example` to `.env`.
    *   Update `.env`. `DATABASE_URL` should point to your local MySQL instance:
        ```
        DATABASE_URL="mysql://username:password@localhost:3306/event_management_dev"
        # ... other variables
        ```
4.  **Initial Project Setup (Install Dependencies & Configure Database):**
    Ensure your MySQL server is running.
    ```bash
    npm run setup:dev
    ```
    This command runs `npm install`, `prisma generate`, `prisma migrate deploy`, and `npm run db:seed`.
5.  **Start the Server:**
    ```bash
    npm run dev
    ```
    The server should be running on `http://localhost:3000` (or your configured `PORT`).

### API Documentation (Swagger)
Once the server is running (either method), access interactive API documentation at:
`http://localhost:3000/api-docs`

### Switching Environments or Pulling Updates
*   **For Docker Compose:**
    1.  `git pull ...`
    2.  `sudo docker-compose up -d --build` (if core dependencies changed)
    3.  `sudo docker-compose exec app npx prisma migrate deploy`
    4.  `sudo docker-compose exec app npx prisma db seed`
*   **For Without Docker:**
    1.  `git pull ...`
    2.  `npm install`
    3.  `npm run db:setup`

### Resetting the Database
*   **For Docker Compose (Deletes DB volume):**
    ```bash
    sudo docker-compose down -v db && sudo docker-compose up -d --build db && sudo docker-compose exec app npx prisma migrate deploy && sudo docker-compose exec app npx prisma db seed
    ```
*   **For Without Docker:**
    ```bash
    npm run db:reset
    ```

**Test Accounts (Created during seeding):**
*   Admin: `admin@example.com` / `Admin123!`
*   Organizer: `john.smith@example.com` / `Organizer123!`
*   Participant: `participant1@example.com` / `Participant123!`

*(Project follows a 4-sprint cycle, aiming for completion by end of Week 12)*
