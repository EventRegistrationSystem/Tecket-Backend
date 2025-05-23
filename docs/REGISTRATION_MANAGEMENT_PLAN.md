# Registration Management Feature Plan

**Date:** 2025-05-19

## 1. Introduction and Goal

**Goal:** To provide Administrators and Event Organizers with the necessary tools to view, manage, and export registration information for events. This feature aims to give insights into event attendance, participant details, and questionnaire responses.

## 2. User Roles and Permissions

*   **Administrator (ADMIN):**
    *   Can view and manage registrations for **all** events in the system.
    *   Can perform all available actions on registrations (e.g., view details, update status, limited edits, cancel, export).
*   **Event Organizer (ORGANIZER):**
    *   Can view and manage registrations **only for events they own**.
    *   Can perform all available actions on registrations for their events.
*   **Participant (PARTICIPANT):**
    *   This feature is not directly for participants, but they can view their own registration details through their user profile (existing functionality to be potentially enhanced by data from this module).

## 3. Backend API Design (`Capstone-Backend`)

This will likely involve enhancements to `RegistrationService`, `RegistrationController`, and `registrationRoutes`.

### 3.1. API Endpoints

1.  **List Registrations for an Event (Organizer View / Admin Filtered View):**
    *   **Endpoint:** `GET /api/events/:eventId/registrations`
    *   **Permissions:** ORGANIZER (must own `eventId`), ADMIN.
    *   **Query Parameters:**
        *   `page` (integer, default 1)
        *   `limit` (integer, default 10)
        *   `search` (string, searches primary registrant name/email, attendee names/email)
        *   `status` (enum: `CONFIRMED`, `PENDING`, `CANCELLED`)
        *   `ticketId` (integer, filter by registrations containing a specific ticket type)
    *   **Response:** Paginated list of registration summaries. Each summary should include:
        *   `registrationId`
        *   `registrationDate`
        *   `primaryParticipantName` (or `User` name if linked)
        *   `primaryParticipantEmail`
        *   `numberOfAttendees`
        *   `registrationStatus`
        *   `totalAmountPaid` (if applicable, basic info)

2.  **List All Registrations (Admin Super View):**
    *   **Endpoint:** `GET /api/admin/registrations` (New or adapt existing `/api/registrations` if it can be secured for ADMIN only for this broad view)
    *   **Permissions:** ADMIN only.
    *   **Query Parameters:**
        *   `page`, `limit`, `search`, `status`, `ticketId` (as above)
        *   `eventId` (integer, filter by a specific event)
        *   `userId` (integer, filter by registrations made by a specific user)
        *   `participantId` (integer, filter by registrations involving a specific participant)
    *   **Response:** Paginated list of registration summaries (similar to above, but may include event name).

3.  **Get Detailed Registration Information:**
    *   **Endpoint:** `GET /api/registrations/:registrationId`
    *   **Permissions:** ADMIN, ORGANIZER (for their event's registrations), PARTICIPANT (for their own registration).
        *   *Note: Current `GET /api/registrations/:id` might already serve this but needs to ensure all necessary data is included and authorization is robust.*
    *   **Response:** Full registration details:
        *   Event details (ID, name, date).
        *   Primary `Participant` details.
        *   `Registration` details (ID, date, status, total amount).
        *   List of `Attendee`s associated with the registration:
            *   `Attendee` ID.
            *   Linked `Participant` details (name, email, etc.).
            *   List of `Response`s for this attendee (question text, answer).
        *   List of `PurchaseItem`s (ticket type name, quantity, price paid per type).
        *   `Payment` status/details (basic info, as full payment features are postponed).

4.  **Update Registration Status (Admin/Organizer):**
    *   **Endpoint:** `PATCH /api/registrations/:registrationId/status`
    *   **Permissions:** ADMIN, ORGANIZER (for their event's registrations).
    *   **Request Body DTO (`UpdateRegistrationStatusDTO`):**
        ```json
        {
          "status": "CONFIRMED" // or "CANCELLED", "CHECKED_IN" (if check-in is added)
        }
        ```
    *   **Service Logic:**
        *   Verify permissions.
        *   Validate new status and allowed transitions.
        *   Update registration status.
        *   If changing to `CANCELLED`, re-evaluate if `TicketService.decrementTicketSoldCount` logic needs to be invoked here or if it's only for user-initiated cancellations. (User-initiated cancellation already exists, this might be for admin overrides).
    *   **Response:** Updated registration details.

5.  **Update Limited Registration/Participant Details (Admin/Organizer - Scope Carefully):**
    *   **Endpoint:** `PUT /api/registrations/:registrationId/attendees/:attendeeId` (or a more general `PUT /api/registrations/:registrationId`)
    *   **Permissions:** ADMIN, ORGANIZER (for their event's registrations).
    *   **Request Body DTO (`UpdateAttendeeDetailsDTO`):**
        ```json
        {
          // Only allow very specific fields to be editable, e.g., correcting typos
          "firstName": "NewFirstName",
          "lastName": "NewLastName",
          // "email": "new.email@example.com" // Email changes can be complex, consider implications
        }
        ```
    *   **Service Logic:**
        *   Verify permissions.
        *   Validate which fields can be updated.
        *   Update the `Participant` record linked to the `Attendee`.
    *   **Response:** Updated attendee/participant details or full registration.
    *   **Note:** This needs careful consideration to avoid data integrity issues. Editing responses might be out of scope.

6.  **Export Registration Data (Admin/Organizer):**
    *   **Endpoint:** `GET /api/events/:eventId/registrations/export` (for Organizers)
    *   **Endpoint:** `GET /api/admin/registrations/export` (for Admins, with same filters as admin list view)
    *   **Permissions:** ORGANIZER (for their event), ADMIN.
    *   **Query Parameters:** Same as the corresponding list view to filter the data to be exported.
    *   **Response:** CSV file download (`Content-Type: text/csv`).
    *   **Service Logic:** Fetch filtered registration data (including all relevant attendee and response details), format as CSV.

### 3.2. Service Layer (`RegistrationService.ts`) Enhancements

*   Implement new methods corresponding to the endpoints above.
*   Ensure all methods have robust authorization checks:
    *   ADMINs can access/manage any registration.
    *   ORGANIZERs can only access/manage registrations for events they own.
*   Queries must efficiently fetch related data (Events, Participants, Attendees, Responses, Tickets via PurchaseItems). Use Prisma `include` and `select` effectively.
*   Handle pagination and filtering logic.

### 3.3. Database Considerations
*   Existing schema (`Registration`, `Attendee`, `Response`, `Purchase`, `PurchaseItem`, `Participant`, `Event`, `Ticket`) should largely support these read operations.
*   Ensure indexes are present on fields used for filtering/searching (e.g., `eventId`, `status` on `Registration`, `email` on `Participant`).

## 4. Frontend UI/UX Design (`Capstone-Frontend`)

### 4.1. Views and Components

1.  **Admin/Organizer Registration List View:**
    *   Accessible from Admin Dashboard or Organizer's Event Management page.
    *   Displays a table or list of registrations (paginated).
    *   Columns: Registration ID, Date, Primary Registrant, #Attendees, Status, Event Name (for Admin view).
    *   Filtering options: by event (for Admin), by status, by search term.
    *   Action per row: "View Details" button/link.
    *   Bulk actions (optional): Export selected.
    *   "Export All (Filtered)" button.

2.  **Registration Detail View:**
    *   Displays all information from `GET /api/registrations/:registrationId`.
    *   Clear sections for:
        *   Event Info
        *   Primary Registrant Info
        *   Attendee(s) Info (loop through attendees)
            *   Participant details for each attendee.
            *   Questionnaire responses for each attendee.
        *   Ticket(s) Purchased (types, quantities).
        *   Payment Status (basic).
        *   Registration Status.
    *   Action buttons:
        *   "Update Status" (modal/dropdown).
        *   "Edit Attendee Details" (modal, for limited fields).
        *   "Cancel Registration" (if applicable, with confirmation).
        *   "Export This Registration" (PDF/CSV).

### 4.2. API Service (`src/api/registrationServices.js`)
*   Add new functions to call the backend endpoints defined in section 3.1.
*   Handle request/response data.

### 4.3. State Management (Pinia)
*   May need a new store or enhance existing ones (`userStore`, `eventStore`?) to manage state for registration lists and details if complex interactions are needed, or manage state locally within components.

## 5. Implementation Steps (Phased Approach)

**Phase 1: Backend Read APIs**
1.  Implement `GET /api/events/:eventId/registrations` (Service, Controller, Route). **(Backend DONE)**
2.  Implement `GET /api/admin/registrations` (Service, Controller, Route). **(Backend DONE - Implemented as `GET /api/registrations/admin/all-system-summary`)**
3.  Enhance `GET /api/registrations/:registrationId` to ensure all required details (attendees, responses, tickets) are included. **(Backend DONE)**
4.  Thoroughly test with ADMIN and ORGANIZER roles. (Responsibility of development/QA team)

**Phase 2: Frontend Read UI**
1.  Implement Registration List View for Admins/Organizers. **(COMPLETED)**
2.  Implement Registration Detail View. **(COMPLETED)**
3.  Integrate with backend APIs from Phase 1. **(COMPLETED)**

**Phase 3: Backend Update/Action APIs**
1.  Implement `PATCH /api/registrations/:registrationId/status`. **(Backend DONE)**
2.  Define scope and implement `PUT /api/registrations/:registrationId/attendees/:attendeeId` (or similar for limited edits).
3.  Thoroughly test.

**Phase 4: Frontend Update/Action UI**
1.  Add "Update Status" functionality to the Detail View.
2.  Add "Edit Attendee Details" functionality (if implemented).
3.  Integrate with backend APIs from Phase 3.

**Phase 5: Export Functionality**
1.  Implement backend `GET .../export` endpoints to generate CSV.
2.  Add "Export" buttons to the frontend List View.

## 6. Considerations & Open Questions

*   **Scope of Editable Fields:** What specific participant/registration details should be editable by Admins/Organizers? Editing financial details or ticket types post-registration is generally not advisable. Focus on correcting minor typos.
*   **Audit Logging:** For actions like status changes or detail edits made by admins/organizers, consider adding an audit log trail.
*   **Check-in Functionality:** Is simple status change (`CHECKED_IN`) sufficient, or is a more dedicated check-in interface/flow needed (potentially with QR codes, etc.)? (Likely future enhancement).
*   **Performance:** For events with many registrations, ensure database queries for lists and exports are optimized.
*   **Data Privacy:** Ensure only authorized roles can see sensitive participant data.

This plan provides a comprehensive roadmap for the Registration Management feature.
