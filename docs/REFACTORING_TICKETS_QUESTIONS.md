# Refactoring Summary: Ticket and Question Management

**Date:** 2025-05-18 (Updated for EventService.updateEvent reversion)

This document outlines considerations and recommended actions for refactoring the management of Tickets and Event-Specific Questions within the Event Registration System, covering both backend and frontend aspects.

## I. Ticket Management

### A. Current Backend Design (`Capstone-Backend`)

*   **Dedicated Routes:** `src/routes/ticketRoutes.ts` defines granular RESTful endpoints for ticket operations, all scoped under `/events/:eventId/tickets`. This includes GET (list, specific), POST (create), PUT (update), DELETE, and a GET for availability.
*   **Dedicated Controller:** `src/controllers/ticketController.ts` handles requests from `ticketRoutes.ts` and delegates logic to `TicketService`. It correctly parses IDs and passes authenticated user info.
*   **Dedicated Service:** `src/services/ticketServices.ts` contains robust business logic:
    *   Verifies event existence and organizer ownership for CUD operations.
    *   Validates ticket data (sales dates, price, quantity).
    *   Prevents deletion of tickets with sales (`quantitySold > 0`).
    *   Provides comprehensive availability checks.
*   **Event Service Interaction (`src/services/eventServices.ts`):**
    *   `EventService.createEvent`: Accepts an array of ticket definitions in `CreateEventDTO` and creates initial `Ticket` records transactionally with the event.
    *   `EventService.updateEvent`: If a `tickets` array is in the payload, it currently implements a "delete all unsold tickets and then create new ones from the payload" strategy.

### B. Backend Recommendations for Ticket Management

1.  **Endorse Dedicated Ticket API:**
    *   **Action:** Continue to use and rely on the dedicated endpoints in `ticketRoutes.ts` (e.g., `POST /events/:eventId/tickets`, `PUT /events/:eventId/tickets/:ticketId`, `DELETE /events/:eventId/tickets/:ticketId`) for all ticket creation (after initial event setup), updates, and deletions.
    *   **Rationale:** This provides clear, atomic, and RESTful operations for managing ticket types.

2.  **Refine `EventService.updateEvent` Behavior for Tickets (Monolithic Sync Re-implemented):**
    *   **Status: COMPLETED (2025-05-18).**
    *   **Action:** `EventService.updateEvent` (called by `PUT /api/events/:id`) has been refactored to again handle monolithic synchronization of the entire `tickets` collection for an event.
    *   It achieves this by performing comparison logic (identifying tickets to add, update, or delete) and then orchestrating calls to the respective `TicketService` methods (e.g., `createTicket`, `updateTicket`, `deleteTicket`).
    *   `TicketService` methods were made transaction-aware (accepting an optional Prisma transaction client `tx`) to ensure atomicity when called from `EventService.updateEvent`'s transaction.
    *   **Rationale for Reversion:** To simplify frontend logic for event updates by allowing a full state replacement for tickets via the main event update endpoint, while still leveraging the business logic and security (like not deleting sold tickets) encapsulated in `TicketService`.

3.  **No Changes Needed for `EventService.createEvent` for Tickets:**
    *   The current approach of allowing initial ticket definitions within the `CreateEventDTO` for `POST /events` is convenient and acceptable for initial setup.

### C. Frontend Recommendations for Ticket Management (`Capstone-Frontend`)

1.  **Standardize `src/api/ticketServices.js`:**
    *   **Action (if `atickets.js` exists):** Rename `src/api/atickets.js` to `src/api/ticketServices.js`.
    *   **Action:** Ensure this file uses the central `httpClient` (from `src/api/httpClient.js`) for all API calls.
    *   **Action:** Implement functions that map directly to the backend `ticketRoutes.ts` endpoints:
        *   `fetchTicketsForEvent(eventId)` (for `GET /events/:eventId/tickets`)
        *   `getTicketDetails(eventId, ticketId)` (for `GET /events/:eventId/tickets/:ticketId`)
        *   `createTicketForEvent(eventId, ticketData)` (for `POST /events/:eventId/tickets`)
        *   `updateTicketForEvent(eventId, ticketId, ticketData)` (for `PUT /events/:eventId/tickets/:ticketId`)
        *   `deleteTicketForEvent(eventId, ticketId)` (for `DELETE /events/:eventId/tickets/:ticketId`)
        *   `checkTicketAvailability(eventId, ticketId)` (for `GET /events/:eventId/tickets/:ticketId/availability`)
    *   These functions should handle request/response data appropriately, relying on `httpClient` for token management and common error handling.

2.  **UI for Ticket Management:**
    *   **Action:** Implement UI (e.g., a "Tickets" tab within an event's admin/edit view) that uses the functions from `ticketServices.js` to allow organizers to list, add, edit, and delete ticket types for their event.

## II. Question Management (Event-Specific Questionnaires)

### A. Current Backend Design (`Capstone-Backend`)

*   **Database Schema:**
    *   `Question` table: Stores global question definitions (text, type).
    *   `EventQuestions` table: Join table linking a global `Question` to an `Event`, storing event-specific properties like `isRequired` and `displayOrder`. Responses are linked to `EventQuestions.id`. This is a good, normalized design.
*   **`EventService.createEvent`:**
    *   Accepts a `questions` array in `CreateEventDTO`.
    *   For each question in the payload, it **creates a new global `Question` record** (defaulting type to 'TEXT') and then creates an `EventQuestions` link. It does not currently attempt to find/reuse existing global `Question` records by text during initial event creation.
*   **`EventService.updateEvent`:**
    *   Accepts a `questions` array in its payload.
    *   Performs a sophisticated synchronization:
        *   For incoming questions, it tries to find an existing global `Question` by text. If not found, it creates a new global `Question`.
        *   It then updates or creates the `EventQuestions` link (for `isRequired`, `displayOrder`).
        *   It deletes `EventQuestions` links not present in the payload, but **only if those questions have no participant responses** (excellent safeguard).
*   **Dedicated Question Routes/Controller:** Currently, there are no dedicated routes (e.g., `/events/:eventId/questions/*`) or a dedicated `QuestionController` or `EventQuestionController`. All management of event-question links happens via the `questions` array in the main event create/update payloads processed by `EventService`.

### B. Backend Recommendations for Question Management

1.  **Align `EventService.createEvent` with `updateEvent` for Question Handling:**
    *   **Status: COMPLETED (2025-05-17).** `EventService.createEvent` was modified to first attempt to find an existing global `Question` by its `questionText` before creating a new one.
    *   **Rationale:** Promotes reusability of global questions, reduces data duplication in the `Question` table, and makes behavior consistent with `EventService.updateEvent`.

2.  **Implement Dedicated API Endpoints for Granular Question Management (Recommended for Flexibility):**
    *   **Status: COMPLETED (2025-05-17).**
        *   DTOs created in `src/types/questionTypes.ts`.
        *   `EventQuestionService.ts` created with methods for CRUD operations on event-question links, including organizer verification and safeguards.
        *   `EventQuestionController.ts` created to handle HTTP requests.
        *   `eventQuestionRoutes.ts` created and mounted under `/events/:eventId/questions` in `eventRoutes.ts`.
    *   **Rationale for Dedicated Components:**
        *   **Clear Separation of Concerns:** `EventController/Service` focuses on the `Event` entity. `EventQuestionController/Service` focuses on managing the `EventQuestions` links and their interaction with global `Question` entities.
        *   **Adherence to Single Responsibility Principle (SRP).**
        *   **Scalability & Maintainability:** Easier to expand or modify question-linking logic if it's in dedicated components.
        *   **Consistency:** Aligns with the pattern used for `Ticket` management (dedicated controller/service).
    *   **Implemented Endpoints & Logic:**
        *   **Routes (in `eventQuestionRoutes.ts`, mounted under `/events/:eventId/questions`):**
            *   `GET /`: List all questions linked to the event (`EventQuestionController.getEventQuestions`).
            *   `POST /`: Add/link a question to the event (`EventQuestionController.addQuestionToEvent`).
                *   Payload: `AddEventQuestionLinkDTO` (`{ questionId?: number, questionText?: string, questionType?: QuestionType, category?: string, validationRules?: Json, isRequired: boolean, displayOrder: number }`).
                *   Service logic: Finds/creates global `Question`, then creates `EventQuestions` link.
            *   `PUT /:eventQuestionId`: Update properties of an `EventQuestions` link (`EventQuestionController.updateEventQuestionLink`). Payload: `UpdateEventQuestionLinkDTO` (`{ isRequired?: boolean, displayOrder?: number }`).
            *   `DELETE /:eventQuestionId`: Remove/unlink a question from an event (`EventQuestionController.deleteEventQuestionLink`). Maintains safeguard against deleting if responses exist.
    *   **Rationale for Granular API:**
        *   Provides a more RESTful API.
        *   Enables a more flexible frontend UI for individual question management post-event creation.
        *   Decouples detailed question management from the main event update logic.

3.  **Refine `EventService.updateEvent` for Questions (Monolithic Sync Re-implemented):**
    *   **Status: COMPLETED (2025-05-18).**
    *   **Action:** Similar to tickets, `EventService.updateEvent` has been refactored to handle monolithic synchronization of the `questions` collection (i.e., `EventQuestions` links) for an event.
    *   It performs comparison logic and orchestrates calls to the respective `EventQuestionService` methods (e.g., `addQuestionToEvent`, `updateEventQuestionLink`, `deleteEventQuestionLink`).
    *   `EventQuestionService` methods were made transaction-aware (accepting `tx`).
    *   **Rationale for Reversion:** To simplify frontend logic for event updates by allowing full state replacement for question links via the main event update endpoint, while leveraging `EventQuestionService` for its specialized logic (like find-or-create global questions and respecting rules about responses).

4.  **Global Question Bank Management (Optional Future Enhancement):**
    *   **Consideration:** If admins/organizers need a dedicated UI/API to manage the global `Question` table directly (e.g., `GET /questions`, `POST /questions` to add to bank, `PUT /questions/:id` to edit global question text/type – with care if already used), this would be a separate feature. The "find or create" logic in `EventQuestionService` (when linking) would still apply.

5.  **Add Joi Validation for New Question DTOs:**
    *   **Status: COMPLETED (2025-05-17).** Joi validation schemas were created in `src/validation/eventQuestionValidation.ts` for `AddEventQuestionLinkDTO` and `UpdateEventQuestionLinkDTO`. These schemas were applied as middleware in `src/routes/eventQuestionRoutes.ts` to validate request bodies for the new granular question management endpoints.
    *   **Rationale:** Ensures data integrity and provides clear error messages for invalid input to these new APIs.

### C. Frontend Recommendations for Question Management (`Capstone-Frontend`)

1.  **Standardize `src/api/questionServices.js`:**
    *   **Status:** File created and uses `httpClient`.
    *   **Action (To Do):** Implement/update functions in `questionServices.js` to map to the new dedicated backend endpoints:
        *   `fetchEventQuestions(eventId)` (maps to `GET /events/:eventId/questions`).
        *   `addQuestionToEvent(eventId, questionData)` (maps to `POST /events/:eventId/questions`).
        *   `updateEventQuestionLink(eventId, eventQuestionId, linkData)` (maps to `PUT /events/:eventId/questions/:eventQuestionId`).
        *   `deleteEventQuestionLink(eventId, eventQuestionId)` (maps to `DELETE /events/:eventId/questions/:eventQuestionId`).
        *   (Optional) `fetchAllGlobalQuestions()` if a UI for picking from a global bank is desired (requires backend `GET /questions` endpoint).

2.  **UI for Question Management:**
    *   **Action (To Do):** Implement UI (e.g., a "Questions" tab within an event's admin/edit view) that uses the functions from `questionServices.js`.
    *   Allow organizers to:
        *   View currently linked questions with their `isRequired` status and `displayOrder`.
        *   Add new questions (either by typing new text or selecting from a global bank if implemented).
        *   Edit the `isRequired` and `displayOrder` for each linked question.
        *   Remove questions from the event (respecting backend rules about existing responses).
        *   Reorder questions.

## III. General Code Cleanup (Frontend) - In Progress

1.  **Delete Old Service Files:**
    *   **COMPLETED (2025-05-17):** `src/api/aquestions.js` (functionality moved to `src/api/questionServices.js` and standardized with `httpClient`).
    *   **COMPLETED (2025-05-17):** `src/api/atickets.js` (functionality moved to `src/api/ticketServices.js` and standardized with `httpClient`).
    *   **COMPLETED (2025-05-17):** `src/api/auser.js` (functionality merged into `src/api/userServices.js` and standardized with `httpClient`).
    *   **COMPLETED (2025-05-17):** `src/api/authRefresh.js` (functionality superseded by interceptors in `src/api/httpClient.js`).
    *   **Status:** All identified old/redundant API service files related to the initial `fetch`/`authFetch` pattern have been cleaned up.

## IV. Impact of Dedicated Ticket/Question Services on Event Management Endpoints (Backend)

The introduction and consistent use of dedicated services/endpoints for Tickets and (recommended) Questions will refine the behavior and responsibilities of the main Event management endpoints:

1.  **`POST /events` (Create Event):**
    *   **Current Behavior:** Accepts initial `tickets` and `questions` arrays in `CreateEventDTO`. `EventService.createEvent` handles their creation.
    *   **Impact/Change:** This core behavior can remain for user convenience during initial event setup. Internally, `EventService.createEvent` might eventually call methods from a dedicated `TicketService` or `EventQuestionService` if that logic is further refactored out of `EventService`, but the endpoint's contract with the client can stay similar for creation.
    *   **Recommendation (Status: COMPLETED for question handling alignment in `createEvent`, PENDING for full impact assessment after UI changes):** `EventService.createEvent` now aligns with the "find or create" global question logic. The `questions` array in `CreateEventDTO` for `POST /events` is still useful for initial setup.

2.  **`PUT /events/:id` (Update Event):**
    *   **Current Behavior (after strategic reversion - 2025-05-18):** This endpoint, via `EventService.updateEvent`, now handles updates to core event details AND performs monolithic synchronization of associated `tickets` and `EventQuestions` links.
    *   It achieves this by orchestrating calls to transaction-aware methods in `TicketService` and `EventQuestionService`.
    *   **Impact:** Provides a single endpoint for comprehensive event updates if desired by the frontend, while still allowing granular APIs for tickets and questions to be used independently.
    *   **Recommendation:** Frontend can choose to send full `tickets` and `questions` arrays to `PUT /events/:id` for a full sync, or use granular endpoints for specific changes. Backend Joi validation for `PUT /events/:id` should allow optional `tickets` and `questions` arrays.

## V. Admin Privilege Standardization (Backend) (Date: 2025-05-17)

To ensure ADMIN users have appropriate privileges across modules:

1.  **Standardized Ownership Checks with ADMIN Bypass:**
    *   **Status: COMPLETED.**
    *   **Services Updated:**
        *   `EventService.ts`: Methods `updateEvent`, `updateEventStatus`, `deleteEvent` now accept `requestingUserId` and `requestingUserRole`. They use a helper method (`verifyAdminOrEventOrganizer`) to check if the user is an ADMIN (bypassing ownership) or the event organizer. The `getEventWithDetails` method also correctly handles ADMIN visibility for events of any status.
        *   `TicketService.ts`: Methods `createTicket`, `updateTicket`, `deleteTicket` now accept `userId` and `userRole`. Authorization checks within these methods correctly bypass ownership for ADMIN users.
        *   `EventQuestionService.ts`: Methods `addQuestionToEvent`, `updateEventQuestionLink`, `deleteEventQuestionLink` now accept `userId` and `userRole`. They use a helper method (`verifyAdminOrEventOrganizer`) to ensure ADMINs can manage question links for any event.
    *   **Controllers Updated:**
        *   `EventController.ts`, `TicketController.ts`, `EventQuestionController.ts` were updated to extract `userId` and `userRole` from `req.user` and pass them to the respective service methods. Redundant ownership checks in controllers were removed.
    *   **Routes Verified:**
        *   `eventRoutes.ts`, `ticketRoutes.ts`, `eventQuestionRoutes.ts` correctly apply `authenticate` and `authorize('ORGANIZER', 'ADMIN')` middleware to CUD operations, ensuring only permitted roles can access these actions.
    *   **Rationale:** This provides a consistent and secure way for ADMIN users to manage all aspects of events, tickets, and question links, while ORGANIZERs are still correctly restricted to their own resources.

This detailed plan should guide the refactoring efforts for both ticket and question management, leading to a more robust, maintainable, and user-friendly system.
