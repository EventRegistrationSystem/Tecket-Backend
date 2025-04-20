# Project Summary: Event Registration System Backend

**Last Updated:** 13/04/2025

## 1. Project Purpose and Core Functionalities

**Purpose:**
To provide a robust backend API for managing events, registrations, tickets, and associated questionnaires. The system enables event organizers to create and manage events (both free and paid) and allows participants (registered users or guests) to browse, register, and complete event-specific questionnaires. Secure payment processing is included for paid events.

**Core Functionalities:**
*   **User Management:** Authentication (JWT-based), authorization (Role-Based Access Control: PARTICIPANT, ORGANIZER, ADMIN), profile management, password management.
*   **Event Management:** Full CRUD operations, status management (draft, published, cancelled, completed), support for free/paid events, advanced filtering/search, role-based visibility.
*   **Ticket Management:** Creation/management of ticket types per event, pricing, availability, sales periods, validation against sold quantities.
*   **Registration System:** Supports both registered users and guest participants, linking participants to events.
*   **Questionnaire Management:** Custom questions per event, response collection from participants during registration.
*   **Payment Processing:** Secure handling of payments for paid event tickets.
*   **Reporting & Analytics:** Data collection to support future reporting for organizers/admins.

## 2. Technology Stack

*   **Language:** TypeScript
*   **Runtime:** Node.js
*   **Framework:** Express.js
*   **Database:** MySQL
*   **ORM:** Prisma
*   **Authentication:** JWT (JSON Web Tokens) with Refresh Tokens (stored in HTTP-only cookies)
*   **Validation:** Joi (Schema validation, likely used in middleware or controllers)
*   **Testing:** Jest with Supertest

## 3. Architecture and Component Structure

**Architecture:**
Layered Architecture:
1.  **Routes (`src/routes/`):** Define API endpoints, apply middleware (authentication, validation).
2.  **Controllers (`src/controllers/`):** Handle HTTP request/response cycle, orchestrate service calls.
3.  **Services (`src/services/`):** Encapsulate core business logic, interact with the data layer.
4.  **Data Layer (Prisma - `prisma/schema.prisma`):** Defines database models and handles database interactions.

**Key Database Entities (`prisma/schema.prisma`):**
*   `User`: Authenticated users (organizers, admins, participants with accounts).
*   `ParticipantProfile`: Stores profile info for *all* participants (guests or registered users). Linked to `User` if applicable.
*   `Event`: Event details, including `isFree` flag.
*   `Ticket`: Ticket types for paid events (linked to `Event`).
*   `Question`: Custom questions (linked to `Event`).
*   `Registration`: Links `ParticipantProfile` to `Event`.
*   `Response`: Participant answers to `Question` (linked to `Registration` and `Question`).
*   `Purchase`: Records ticket purchases for paid events (linked to `Registration` and `Ticket`).
*   `Payment`: Records payment details (linked to `Purchase`).

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
│   ├── __tests__/      # Unit and integration tests
│   ├── app.ts          # Express application setup
│   └── server.ts       # Server entry point
├── .env.example        # Environment variable template
├── jest.config.ts      # Jest configuration
├── package.json
└── tsconfig.json
```

## 4. Implemented Features (as of Sprint 2, Week 4)

*   **Authentication:** User registration, login, JWT generation/validation, refresh tokens, role-based access control middleware (`src/middlewares/authMiddlewares.ts`), password updates.
*   **User Profile:** Fetching and updating user profiles (`src/controllers/userController.ts`, `src/services/userServices.ts`).
*   **Event Management:** Full CRUD, status transitions, free/paid event distinction (`isFree` flag), role-based visibility and filtering (`src/controllers/eventController.ts`, `src/services/eventServices.ts`).
*   **Ticket Management:** CRUD for ticket types associated with events, pricing, availability checks, sales period handling, validation (`src/controllers/ticketController.ts`, `src/services/ticketServices.ts`).
*   **Database:** Schema defined (`prisma/schema.prisma`), migrations applied (`prisma/migrations/`), seeding script (`prisma/seed.ts`). Includes `ParticipantProfile` for guest support.
*   **Basic Setup:** Project structure, dependencies, TypeScript config, Jest setup (`src/__tests__/setup.ts`).

## 5. Known Issues, Limitations & Technical Debt

*   **Validation Gaps:** Some edge cases in input validation might not be covered. Complex inter-field validation needs review.
*   **Image Uploads:** No functionality for handling image uploads (e.g., event cover images).
*   **Error Handling:** Needs standardization across all controllers/services for consistency. (`src/utils/errors.ts` exists but may need broader application).
*   **Testing:** Unit test coverage for service methods needs improvement. Integration tests for complex flows (like full registration) are planned but not yet implemented.
*   **Transaction Management:** Complex operations involving multiple database writes could benefit from more robust transaction handling (currently relies on Prisma's transaction capabilities).
*   **Logging:** Minimal logging implemented; needs enhancement for better debugging and monitoring.
*   **Documentation:** API documentation (e.g., Swagger via `src/config/swagger.ts`) is planned but potentially incomplete. Inline code documentation could be improved.

## 6. Immediate Next Steps & Future Development Plan

**Current Focus (Sprint 2: Week 5-6):**
*   **Week 5:**
    *   Complete Ticket module integration (linking purchases to registrations).
    *   Implement Registration system (`src/controllers/registrationController.ts`, `src/services/registrationServices.ts`) for free/paid events, handling both guests (`ParticipantProfile`) and registered users (`User`).
    *   Develop Questionnaire (`Question`) and Response handling.
    *   Implement Participant Profile management endpoints.
    *   Generate/improve API documentation (Swagger).
*   **Week 6:**
    *   Write integration tests for the full registration flow (including free/paid variations and questionnaires).
    *   Refine error handling consistency.
    *   Improve API documentation.

**Future Development Plan (Sprints 3-4: Weeks 7-12):**
*   **Sprint 3 (Weeks 7-9):**
    *   Payment Processing: Integrate payment gateway, implement verification and refunds.
    *   Email Notifications: For registrations, event updates, etc.
    *   Reporting System: Basic reports for organizers (attendance, sales).
*   **Sprint 4 (Weeks 10-12):**
    *   Advanced Reporting: Sales/revenue analytics, participant demographics.
    *   Frontend Integration: Build Admin dashboard, Event management UI, Registration flows.

## 7. Critical Design Decisions & Tradeoffs

*   **Participant Profile Separation:** Created `ParticipantProfile` distinct from `User`.
    *   *Rationale:* Supports guest registration, flexible data collection.
    *   *Tradeoff:* Increased data model complexity.
*   **Explicit `isFree` Flag:** Added `isFree` boolean to `Event` model.
    *   *Rationale:* Clearer business logic, simpler reporting queries.
    *   *Tradeoff:* Slight data redundancy with ticket information.
*   **Transaction-Based Operations:** Using Prisma transactions for multi-entity operations.
    *   *Rationale:* Ensures data consistency and integrity.
    *   *Tradeoff:* Potential minor performance impact vs. stronger data guarantees.
*   **Multi-Level Validation:** Validation at route middleware, service layer, and database constraints.
    *   *Rationale:* Defense-in-depth against invalid data.
    *   *Tradeoff:* Some potential duplication of logic, but provides clearer errors at appropriate levels.
*   **JWT Authentication:** Using JWT with refresh tokens stored in HTTP-only cookies.
    *   *Rationale:* Balances security, usability, and statelessness.
    *   *Tradeoff:* Requires managing token refresh lifecycle.

## 8. Environment Setup

**Development Setup:**
1.  Clone the repository.
2.  Run `npm install` to install dependencies.
3.  Configure environment variables in a `.env` file (copy from `.env.example`). Key variables include database connection string and JWT secrets.
4.  Run `npm run db:setup` to apply database migrations and seed initial data.
5.  Start the development server using `npm run dev`.

**Test Accounts (Created during seeding):**
*   Admin: `admin@example.com` / `Admin123!`
*   Organizer: `john.smith@example.com` / `Organizer123!`
*   Participant: `participant1@example.com` / `Participant123!`

*(Project follows a 4-sprint cycle, aiming for completion by end of Week 12)*
