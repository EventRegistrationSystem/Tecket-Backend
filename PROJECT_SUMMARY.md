# Project Summary: Event Registration System Backend

**Last Updated:** 22/04/2025

## 1. Project Purpose and Core Functionalities

**Purpose:**
To provide a robust backend API for managing events, registrations, tickets, and associated questionnaires. The system enables event organizers to create and manage events (both free and paid) and allows participants (registered users or guests) to browse, register, and complete event-specific questionnaires. Secure payment processing is planned for paid events.

**Core Functionalities:**
*   **User Management:** Authentication (JWT-based), authorization (Role-Based Access Control: PARTICIPANT, ORGANIZER, ADMIN), profile management (get/update), password management.
*   **Event Management:** Full CRUD operations, status management (draft, published, cancelled, completed), support for free/paid events, advanced filtering/search, role-based visibility, dynamic question updates.
*   **Ticket Management:** Creation/management of ticket types per event, pricing, availability checks, sales periods, validation against sold quantities, ownership authorization checks.
*   **Registration System:** Supports both registered users and guest participants, linking participants to events. Handles conditional status (`PENDING` for paid, `CONFIRMED` for free). Basic registration cancellation implemented.
*   **Questionnaire Management:** Custom questions per event, response collection from participants during registration.
*   **Payment Processing:** (Planned) Secure handling of payments for paid event tickets.
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
*   `Response`: Participant answers to `EventQuestions` (linked to `Registration`).
*   `Purchase`: Records ticket purchases for paid events (linked to `Registration` and `Ticket`).
*   `Payment`: (Planned) Records payment details (linked to `Purchase`).

**Directory Structure:**
Standard structure for a Node.js/Express/TypeScript project:
```
.
├── prisma/             # Prisma schema, migrations, seeding
├── src/
│   ├── config/         # App configuration (DB, Swagger)
│   ├── controllers/    # Request handlers
│   ├── services/       # Business logic
│   ├── middlewares/    # Express middleware (auth, validation)
│   ├── routes/         # API route definitions
│   ├── types/          # TypeScript type definitions
│   ├── utils/          # Utility functions (e.g., error handling)
│   ├── validation/     # Joi validation schemas
│   ├── __tests__/      # Unit tests (Jest)
│   ├── app.ts          # Express application setup
│   └── server.ts       # Server entry point
├── summaries/          # Contains markdown summaries of work done
├── .env.example        # Environment variable template
├── jest.config.ts      # Jest configuration
├── package.json
└── tsconfig.json
```
*(Added `summaries/` directory)*

## 4. Implemented Features (as of Sprint 3, Week 2)

*   **Authentication:** User registration, login, JWT generation/validation, refresh tokens, role-based access control middleware (`src/middlewares/authMiddlewares.ts`).
*   **User Profile:** Fetching, updating user profiles, and password updates implemented and unit tested (`src/controllers/userController.ts`, `src/services/userServices.ts`, `src/__tests__/unit/userService.test.ts`).
*   **Event Management:** Full CRUD, status transitions, free/paid event distinction (`isFree` flag), role-based visibility and filtering. Refined logic for updating associated questions (`src/controllers/eventController.ts`, `src/services/eventServices.ts`). **Enhanced unit test coverage** (`src/__tests__/unit/eventService.test.ts`).
*   **Ticket Management:** CRUD for ticket types associated with events, pricing, availability checks, sales period handling, validation. **Routes refactored** for consistency (`/events/:eventId/tickets/:ticketId`). **Ownership authorization added** to service layer (`src/controllers/ticketController.ts`, `src/services/ticketServices.ts`). Good unit test coverage (`src/__tests__/unit/ticketService.test.ts`).
*   **Registration System:** Creation implemented for guests/users, handling conditional status (`PENDING`/`CONFIRMED`). Retrieval with authorization implemented. **Basic cancellation implemented** (`PATCH /registrations/:registrationId`) allowing owner/admin to cancel, including decrementing ticket count for paid events. Unit tested (`src/controllers/registrationController.ts`, `src/services/registrationServices.ts`, `src/__tests__/unit/registrationService.test.ts`).
*   **Database:** Schema defined (`prisma/schema.prisma`), migrations applied (`prisma/migrations/`), seeding script (`prisma/seed.ts`).
*   **Basic Setup:** Project structure, dependencies, TypeScript config, Jest setup (`src/__tests__/setup.ts`) including test DB cleanup logic.
*   **API Documentation:** Basic Swagger setup (`src/config/swagger.ts`) exists, needs population/refinement. Route comments updated for tickets.
*   **Custom Errors:** Added `AuthorizationError` and `NotFoundError` to `src/utils/errors.ts`.

## 5. Known Issues, Limitations & Technical Debt

*   **Registration Features:** Full registration *updates* not implemented. Cancellation logic does not yet include *refund processing* for paid events.
*   **Validation Gaps:** Registration validation schema still needs review against service logic edge cases. Other minor validation gaps might exist.
*   **Admin Features:** Admin user management endpoints are defined in routes but not implemented (deferred).
*   **Integration Testing:** No integration tests currently exist.
*   **Error Handling:** Could be standardized further across all services/controllers.
*   **Logging:** Minimal logging implemented.
*   **Image Uploads:** No functionality for handling image uploads.
*   **Notifications:** No email or other notification system implemented.
*   **Participant Service:** Minimal implementation (`findOrCreateParticipant` only). Lacks dedicated get/update methods.

## 6. Immediate Next Steps & Future Development Plan

**Current Focus (End of Sprint 3 / Start of Sprint 4):**
*   **Review Registration Validation:** Align validation schema (`src/validation/registrationValidation.ts`) with service logic (`src/services/registrationServices.ts`). (High Priority)

**Future Development Plan (Prioritized based on existing Frontend):**
1.  **Payment Processing:** Integrate payment gateway, implement verification (webhooks), link to `Purchase`, update `Registration` status. (Very High Priority)
2.  **Admin User Management:** Implement deferred admin endpoints for user management needed by admin dashboard. (High Priority)
3.  **Email Notifications:** Implement email sending for key user flows (registration, cancellation, password reset). (High Priority)
4.  **Full Registration Updates/Cancellation (Refunds):** Enhance cancellation with refund logic. Decide on/implement registration updates if needed. (Medium Priority)
5.  **Integration Testing:** Add API-level tests for key user flows. (Medium Priority - Ongoing)
6.  **Deployment:** Plan and begin setup on Render (Web Service, DB, Env Vars, Migrations). (Medium Priority - Ongoing)
7.  **Reporting System (Basic):** Implement basic organizer reports if required by admin dashboard, otherwise potentially defer. (Low/Medium Priority)
8.  **Refine API & Support Frontend:** Address any specific data needs or endpoint adjustments identified during frontend refinement. (Ongoing)
9.  **Advanced Features:** Advanced reporting, image uploads, etc. (Lower Priority)

## 7. Critical Design Decisions & Tradeoffs

*   **Participant Model:** Using a single `Participant` model linked optionally to `User` supports guest registration.
*   **Explicit `isFree` Flag:** Added `isFree` boolean to `Event` model for clarity.
*   **Conditional Registration Status:** Using `PENDING` for paid events until payment is implemented.
*   **Transaction-Based Operations:** Using Prisma transactions for multi-entity operations (event creation, registration, event update, registration cancellation).
*   **Multi-Level Validation:** Validation at route middleware (Joi), service layer (business rules), and database constraints.
*   **JWT Authentication:** Using JWT with refresh tokens stored in HTTP-only cookies.
*   **Ownership Authorization:** Implemented primarily in the service layer by passing `userId` and checking against resource owner IDs (e.g., `event.organiserId`).

## 8. Environment Setup

**Development Setup:**
1.  Clone the repository.
2.  Run `npm install` to install dependencies.
3.  Configure environment variables in a `.env` file (copy from `.env.example`). Key variables include database connection string and JWT secrets.
4.  Run `npm run db:setup` (or equivalent like `npx prisma migrate dev --name init && npx prisma db seed`) to apply database migrations and seed initial data.
5.  Start the development server using `npm run dev`.

**Test Accounts (Created during seeding):**
*   Admin: `admin@example.com` / `Admin123!`
*   Organizer: `john.smith@example.com` / `Organizer123!`
*   Participant: `participant1@example.com` / `Participant123!`

*(Project follows a 4-sprint cycle, aiming for completion by end of Week 12)*
