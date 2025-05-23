# Registration Management Workflows for Admins and Organizers

This document outlines the core workflows that Administrators (Admins) and Event Organizers will perform within the registration management module. It details the purpose of each workflow, a conceptual user interface (UI) flow, the underlying API endpoint, and its current implementation status based on the phased development plan.

## 1. Monitoring Event Registrations (Viewing the List)

*   **Who:** Event Organizer (for their own events), Admin (for any event).
*   **Goal:** Get an overview of who has registered for a specific event, their current status, and basic summary numbers.
*   **Conceptual UI Flow:**
    1.  Navigate to the specific event's management dashboard.
    2.  Access a "Registrations" or "Attendees" tab/section dedicated to that event.
    3.  A paginated list of registration summaries appears. This list typically shows:
        *   Registration ID
        *   Registration Date
        *   Primary Participant's Name
        *   Primary Participant's Email
        *   Number of Attendees under this registration
        *   Registration Status (e.g., Confirmed, Pending, Cancelled)
        *   Total Amount Paid (if applicable)
    4.  Use filters to narrow down the list (e.g., show only "CONFIRMED" registrations, or registrations that include a "VIP Ticket").
    5.  Use a search bar to find specific registrations by a participant's name or email.
*   **Underlying API & Current Status:**
    *   **API Endpoint:** `GET /api/events/:eventId/registrations`
    *   **Current Status:** Implemented (Phase 1 Backend, Phase 2 Frontend UI). The backend (service, controller, route) for fetching this summarized, filterable, and searchable data is in place, and the corresponding frontend UI component has been implemented.

## 2. Reviewing Detailed Registration Information

*   **Who:** Event Organizer (for their event), Admin (for any registration).
*   **Goal:** View comprehensive details associated with a single registration, including all attendees, their questionnaire answers, tickets purchased, and payment status.
*   **Conceptual UI Flow:**
    1.  From the list of registrations (as in Workflow 1), click on a specific registration (e.g., via a "View Details" button or link).
    2.  A detailed view opens, displaying sections for:
        *   Primary registrant's information.
        *   A list of all attendees under this registration, each with their full participant details.
        *   For each attendee, their answers to any event-specific questionnaire questions.
        *   Details of tickets purchased (e.g., ticket types, quantities, prices paid per type).
        *   Overall registration status.
        *   Basic payment information (e.g., payment intent status, amount).
*   **Underlying API & Current Status:**
    *   **API Endpoint:** `GET /api/registrations/:registrationId`
    *   **Current Status:** Backend Enhanced (Phase 1), Frontend UI Implemented (Phase 2). The endpoint has been reviewed and updated to ensure it includes comprehensive details such as all attendees, their questionnaire responses, full ticket purchase information, and payment status, and the corresponding frontend UI component has been implemented.

## 3. Updating Registration Status

*   **Who:** Event Organizer (for their event's registrations), Admin (for any registration).
*   **Goal:** Manually change the status of a registration. This could be for various reasons, such as confirming an offline payment, marking an attendee as "Checked-In" at the event, or administratively cancelling a registration.
*   **Conceptual UI Flow:**
    1.  Locate the registration either in the list view (Workflow 1) or by opening its detailed view (Workflow 2).
    2.  Select an action like "Update Status" (this might be a button or a dropdown menu option).
    3.  Choose the new desired status (e.g., `CONFIRMED`, `CANCELLED`, `CHECKED_IN` - future status) from a list of valid transitions.
    4.  Confirm the change, possibly with a note or reason if the UI supports it.
*   **Underlying API & Current Status:**
    *   **API Endpoint:** `PATCH /api/registrations/:registrationId/status`
    *   **Current Status:** Backend Implemented (Phase 3). The endpoint allows Admins and authorized Organizers to update the registration status (e.g., to CONFIRMED, CANCELLED). It includes logic for ticket stock adjustment on cancellation. Frontend UI integration is pending.

## 4. Making Minor Corrections to Attendee Information

*   **Who:** Event Organizer (for their event's registrations), Admin (for any registration).
*   **Goal:** Correct minor typos or errors in an attendee's submitted information (e.g., fixing a misspelled name). This functionality would be limited to non-critical fields to maintain data integrity.
*   **Conceptual UI Flow:**
    1.  Navigate to the detailed view of the specific registration (Workflow 2).
    2.  Identify the attendee whose information needs correction.
    3.  Select an "Edit Attendee Details" option associated with that attendee.
    4.  A form or modal appears, presenting a limited set of editable fields (e.g., first name, last name).
    5.  Make the necessary corrections and save the changes.
*   **Underlying API & Current Status:**
    *   **API Endpoint:** `PUT /api/registrations/:registrationId/attendees/:attendeeId` (or a similar granular update endpoint).
    *   **Current Status:** Planned for **Phase 3**. The exact scope of editable fields will need careful definition.

## 5. Exporting Registration Data

*   **Who:** Event Organizer (for their event), Admin (for any event, with appropriate filters).
*   **Goal:** Download registration data (e.g., full attendee lists, contact information, questionnaire responses) as a CSV (Comma Separated Values) file. This allows for offline analysis, use in third-party tools (e.g., mail merge, badge printing), or archival.
*   **Conceptual UI Flow:**
    1.  Navigate to the registration list view for a specific event (Workflow 1) or the admin's system-wide registration view (Workflow 6).
    2.  Apply any desired filters to narrow down the data to be exported (e.g., only "Confirmed" attendees, or registrations from a specific date range).
    3.  Click an "Export to CSV" or "Download Report" button.
    4.  The system generates the CSV file based on the current view/filters, and the browser initiates a download.
*   **Underlying API & Current Status:**
    *   **API Endpoints:**
        *   For Organizers: `GET /api/events/:eventId/registrations/export`
        *   For Admins: `GET /api/admin/registrations/export` (with similar filtering capabilities as the admin list view)
    *   **Current Status:** Planned for **Phase 5**.

## 6. (Admin Only) System-Wide Registration Overview

*   **Who:** Admin.
*   **Goal:** View, search, and filter registrations across *all* events in the system, providing a global perspective on registration activity.
*   **Conceptual UI Flow:**
    1.  Navigate to a dedicated "All Registrations" or "System Registrations" section within the admin panel.
    2.  A comprehensive, paginated list of registrations appears, similar in structure to the event-specific list but potentially including an "Event Name" column or filter.
    3.  Admins can use advanced filters, such as:
        *   Specific `eventId`
        *   Specific `userId` (who made the registration)
        *   `status`
        *   `ticketId`
    4.  A global search function would also be available.
*   **Underlying API & Current Status:**
    *   **API Endpoint:** `GET /api/admin/registrations` (Implemented as `GET /api/registrations/admin/all-system-summary`)
    *   **Current Status:** Implemented (Phase 1 Backend, Phase 2 Frontend UI). The backend (service, controller, route) for fetching a system-wide, filterable, and searchable list of registration summaries for administrators is in place, and the corresponding frontend UI component has been implemented.

These workflows represent the key interactions an administrator or event organizer would have with the registration management module, evolving as more features are implemented according to the development plan.
