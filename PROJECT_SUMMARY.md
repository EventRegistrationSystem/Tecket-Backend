# Project Summary: Event Registration System Backend

**Last Updated:** 21/04/2025

## 1. Project Purpose and Core Functionalities

**Purpose:**
To provide a robust backend API for managing events, registrations, tickets, and associated questionnaires. The system enables event organizers to create and manage events (both free and paid) and allows participants (registered users or guests) to browse, register, and complete event-specific questionnaires. Secure payment processing is planned for paid events.

**Core Functionalities:**
*   **User Management:** Authentication (JWT-based), authorization (Role-Based Access Control: PARTICIPANT, ORGANIZER, ADMIN), profile management (get/update), password management.
*   **Event Management:** Full CRUD operations, status management (draft, published, cancelled, completed), support for free/paid events, advanced filtering/search, role-based visibility, dynamic question updates.
*   **Ticket Management:** Creation/management of ticket types per event, pricing, availability checks, sales periods, validation against sold quantities.
*   **Registration System:** Supports both registered users and guest participants, linking participants to events. Handles conditional status (`PENDING` for paid, `CONFIRMED` for free).
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
*   `Participant`: Stores profile info for *all* participants (guests or registered users). Linked to `User` if applicable. (Note: Renamed from ParticipantProfile for clarity based on schema).
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
├── .env.example        # Environment variable template
├── jest.config.ts      # Jest configuration
├── package.json
└── tsconfig.json
```

## 4. Implemented Features (as of Sprint 3, Week 1)

*   **Authentication:** User registration, login, JWT generation/validation, refresh tokens, role-based access control middleware (`src/middlewares/authMiddlewares.ts`).
*   **User Profile:** Fetching, updating user profiles, and password updates implemented and unit tested (`src/controllers/userController.ts`, `src/services/userServices.ts`, `src/__tests__/unit/userService.test.ts`).
*   **Event Management:** Full CRUD, status transitions, free/paid event distinction (`isFree` flag), role-based visibility and filtering. Refined logic for updating associated questions (`src/controllers/eventController.ts`, `src/services/eventServices.ts`). Basic unit tests exist.
*   **Ticket Management:** CRUD for ticket types associated with events, pricing, availability checks, sales period handling, validation (`src/controllers/ticketController.ts`, `src/services/ticketServices.ts`). Good unit test coverage.
*   **Registration System:** Creation implemented for guests/users, handling conditional status (`PENDING`/`CONFIRMED`). Retrieval with authorization implemented. Unit tested (`src/controllers/registrationController.ts`, `src/services/registrationServices.ts`, `src/__tests__/unit/registrationService.test.ts`).
*   **Database:** Schema defined (`prisma/schema.prisma`), migrations applied (`prisma/migrations/`), seeding script (`prisma/seed.ts`).
*   **Basic Setup:** Project structure, dependencies, TypeScript config, Jest setup (`src/__tests__/setup.ts`) including test DB cleanup logic.
*   **API Documentation:** Basic Swagger setup (`src/config/swagger.ts`) exists, needs population/refinement.

## 5. Known Issues, Limitations & Technical Debt

*   **Event Service Testing:** Unit test coverage needs enhancement, especially for `updateEvent` (ticket/question logic), `getAllEvents` filtering, and `getEventById`/`getEventWithDetails`.
*   **Registration Features:** Cancellation and update functionality not yet implemented. Payment processing integration is pending.
*   **Ticket Routes:** Need review to ensure all service functions are exposed correctly with proper authorization.
*   **Validation Gaps:** Some edge cases in input validation might not be covered. Registration validation schema needs review against service logic.
*   **Admin Features:** Admin user management endpoints are defined in routes but not implemented (deferred).
*   **Integration Testing:** No integration tests currently exist.
*   **Error Handling:** Basic error handling exists, but could be standardized further.
*   **Logging:** Minimal logging implemented.
*   **Image Uploads:** No functionality for handling image uploads.
*   **Notifications:** No email or other notification system implemented.

## 6. Immediate Next Steps & Future Development Plan

**Current Focus (Sprint 3):**
*   **Enhance Event Service Test Coverage:** Add tests for `updateEvent` question/ticket logic, `getEventById`/`getEventWithDetails`, `getAllEvents` filtering.
*   **Review Ticket Routes:** Ensure endpoints match service capabilities and have correct authorization.
*   **Review Registration Validation:** Align validation schema with service logic.
*   **Implement Basic Registration Cancellation:** Add route, controller, service logic (status change, ticket quantity adjustment), and unit tests.
*   **(If time permits / Deployment Unblocked):** Begin deployment setup on Render (Web Service, DB, Env Vars, Migrations).

**Future Development Plan (Post-Sprint 3 / Post-Initial Testing):**
*   **Payment Processing:** Integrate payment gateway, implement verification and refunds. Link to Registration status/Purchase.
*   **Registration Updates/Cancellation:** Implement full cancellation (with refund logic) and potentially registration updates.
*   **Email Notifications:** For registrations, event updates, password resets, etc.
*   **Admin User Management:** Implement deferred admin endpoints.
*   **Reporting System:** Basic reports for organizers (attendance, sales).
*   **Integration Testing:** Add tests for key user flows.
*   **Advanced Features:** Advanced reporting, image uploads, etc.
*   **Frontend Integration:** Support frontend development efforts.

## 7. Critical Design Decisions & Tradeoffs

*   **Participant Model:** Using a single `Participant` model linked optionally to `User` supports guest registration.
*   **Explicit `isFree` Flag:** Added `isFree` boolean to `Event` model for clarity.
*   **Conditional Registration Status:** Using `PENDING` for paid events until payment is implemented.
*   **Transaction-Based Operations:** Using Prisma transactions for multi-entity operations (event creation, registration, event update).
*   **Multi-Level Validation:** Validation at route middleware, service layer, and database constraints.
*   **JWT Authentication:** Using JWT with refresh tokens stored in HTTP-only cookies.

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
