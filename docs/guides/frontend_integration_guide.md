# Backend API Integration Guide for Frontend Developers

**Last Updated:** 23/05/2025

## 1. Introduction & Overview

**Purpose:** This guide is intended to assist frontend developers in integrating with the Event Registration System's backend API. It provides explanations of core workflows, endpoint usage, data structures, and important considerations, complementing the detailed API specifications available via SwaggerUI.

**Application Overview:** The backend supports an event registration platform where organizers can create and manage events (free and paid), and participants (both registered users and guests) can discover events, register for them, answer event-specific questions, and handle payments for paid events via Stripe.

**API Base URL (Local Development):** `http://localhost:3000/api` 
*(Note: Replace `3000` if your local server runs on a different port. Staging/Production URLs to be added when available.)*

**SwaggerUI Documentation:** [Link to your SwaggerUI - e.g., `http://localhost:3000/api-docs`] *(Please update this link)*

## 2. Getting Started & General Concepts

### 2.1. Authentication

The backend uses JWT (JSON Web Tokens) for authenticating registered users.

*   **Login Endpoint:** `POST /api/auth/login`
    *   **Purpose:** Authenticate an existing user.
    *   **Request Body:**
        ```json
        {
          "email": "user@example.com", // string, required, valid email
          "password": "yourpassword"   // string, required
        }
        ```
    *   **Success Response (200 OK):**
        ```json
        {
          "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...", // string, JWT Access Token
          "user": { // UserSummary object
            "id": 1,
            "email": "user@example.com",
            "firstName": "John",
            "lastName": "Doe",
            "role": "PARTICIPANT" // Enum: PARTICIPANT, ORGANIZER, ADMIN
          }
        }
        ```
        A refresh token is also set as an HTTP-only cookie by the backend to handle token refreshes transparently.
    *   **Frontend Action:** Store the `accessToken` securely (e.g., in memory, localStorage/sessionStorage with appropriate security considerations). Store the `user` object for displaying user information and managing UI based on role. For subsequent requests to protected endpoints, include the `accessToken` in the `Authorization` header: `Authorization: Bearer <accessToken>`.

*   **User Registration (Account Creation):** `POST /api/auth/register`
    *   **Purpose:** Create a new user account.
    *   **Request Body:**
        ```json
        {
          "email": "newuser@example.com",    // string, required, unique, valid email
          "password": "password123",       // string, required, (min length/complexity rules may apply)
          "firstName": "New",              // string, required
          "lastName": "User"               // string, required
        }
        ```
    *   **Success Response (201 Created):** User object (excluding password).
        ```json
        {
          "id": 2,
          "email": "newuser@example.com",
          "firstName": "New",
          "lastName": "User",
          "role": "PARTICIPANT",
          "createdAt": "YYYY-MM-DDTHH:mm:ss.sssZ",
          "updatedAt": "YYYY-MM-DDTHH:mm:ss.sssZ"
        }
        ```

*   **Optional Authentication on Certain Routes:**
    *   Routes like `POST /api/registrations` and `POST /api/payments/create-intent` use `optionalAuthenticate` middleware.
    *   If an `Authorization: Bearer <token>` header is provided and the token is valid, `req.user` is populated on the backend, and the action is treated as an authenticated user's action (e.g., `userId` is automatically associated).
    *   If no token is provided, the request is treated as a guest action.

### 2.2. Error Handling

*   **Common HTTP Status Codes & Scenarios:**
    *   `200 OK`: Standard success for GET, PUT, PATCH.
    *   `201 Created`: Resource successfully created (typically for POST).
    *   `204 No Content`: Successful request with no response body (e.g., for some DELETE operations).
    *   `400 Bad Request`: Client-side error. Often due to validation failures (missing fields, invalid formats). The response body will usually contain a `message` and potentially a `details` array with specific validation errors.
        *   *Example:* `{ "message": "Validation failed: eventId is required", "details": [{ "field": "eventId", "message": "eventId is required" }] }`
    *   `401 Unauthorized`: Authentication token is missing, invalid, or expired. User needs to log in or refresh their session.
    *   `403 Forbidden`: User is authenticated but does not have the necessary permissions/role for the requested action or resource.
    *   `404 Not Found`: The requested resource (e.g., an event with a specific ID) does not exist.
    *   `409 Conflict`: The request could not be completed due to a conflict with the current state of the resource (e.g., trying to cancel an already cancelled registration, unique constraint violation).
    *   `500 Internal Server Error`: An unexpected error occurred on the server.
*   **Frontend Action:** Handle these status codes appropriately. Display user-friendly messages based on the error. For 401/403, consider redirecting to login or showing permission errors.

### 2.3. Pagination (for GET list endpoints)

*   **Query Parameters:** `page` (default: 1), `limit` (default: 10).
*   **Response Structure:**
    ```json
    {
      "message": "Items retrieved successfully",
      "data": [ /* array of resource items */ ],
      "pagination": {
        "totalCount": 120, // Total number of items matching the query
        "totalPages": 12,  // totalCount / limit
        "currentPage": 1,  // Current page number
        "limit": 10        // Items per page
      }
    }
    ```
*   **Frontend Action:** Use pagination controls to allow users to navigate through list results.

### 2.4. Date Formatting
All dates/timestamps returned by the API are in ISO 8601 format (e.g., `2025-05-10T13:30:00.000Z`). Ensure consistent parsing and display on the frontend.

## 3. Core Modules & Endpoints

### 3.1. Event Management (Focus: Viewing Events)

This section details how users (guests, participants, organizers) can fetch and view event information.

*   **List Events (Public View & Organizer's View):** `GET /api/events`
    *   **Purpose:** Retrieves a paginated list of events.
        *   For **guests or general logged-in participants**, this typically shows `PUBLISHED` events.
        *   For **authenticated `ORGANIZER`s**, this endpoint can be used to view all their own events (across different statuses) by using the `myEvents=true` query parameter.
    *   **Authentication:** `optionalAuthenticate` is used.
        *   If no token is provided (guest) or user is `PARTICIPANT`: Shows publicly available (`PUBLISHED`) events.
        *   If an `ORGANIZER` is authenticated and sends `myEvents=true`: Shows events owned by that organizer. Can also filter by `status`.
    *   **Query Parameters for Filtering & Pagination (Public/General):**
        *   `search=<string>`: Filters events by name or description.
        *   `eventType=<MUSICAL|SPORTS|SOCIAL|VOLUNTEERING>`
        *   `isFree=<true|false>`
        *   `location=<string>`
        *   `startDate=<YYYY-MM-DD>`
        *   `endDate=<YYYY-MM-DD>`
        *   `page=<number>`, `limit=<number>`
    *   **Query Parameters for Organizers (when `Authorization` header is present):**
        *   `myEvents=true`: **Required** for an organizer to see their own events across all statuses.
        *   `status=<DRAFT|PUBLISHED|CANCELLED|COMPLETED>`: Used in conjunction with `myEvents=true` to filter by status.
        *   Other public filters (`search`, `eventType`, etc.) can also be combined.
    *   **Success Response (200 OK):**
        ```json
        // Example structure (refer to Swagger for exact fields)
        {
          "message": "Events retrieved successfully",
          "data": { // Note: Your Swagger shows response as { success: boolean, data: { events: [], pagination: {} } }
            "events": [ 
              {
                "id": 1,
                "name": "Annual Music Festival",
                "status": "PUBLISHED", // Or DRAFT, CANCELLED if organizer viewing myEvents
                // ... other event summary fields
              }
            ],
            "pagination": { /* ... pagination object ... */ }
          }
        }
        ```
    *   **Frontend Action:**
        *   For public view: Display published events with filters.
        *   For organizer dashboard: If user is an `ORGANIZER`, provide an option/view to list "My Events". When this view is active, the frontend should make the `GET /api/events` call with the `Authorization` header and the `myEvents=true` query parameter. Allow further filtering by `status`, etc.

*   **Get Single Event Details:** `GET /api/events/:id` (Note: path parameter is `:id` as per your routes)
    *   **Purpose:** Retrieves comprehensive details for a specific event, including available tickets and registration questions.
    *   **Authentication:** Optional. Publicly accessible.
    *   **Path Parameter:** `:id` (number) - The ID of the event.
    *   **Success Response (200 OK):**
        ```json
        {
          "id": 1,
          "name": "Annual Music Festival",
          "description": "A great music festival with multiple stages...",
          "location": "Melbourne Showgrounds",
          "capacity": 5000,
          "eventType": "MUSICAL",
          "isFree": false,
          "startDateTime": "2025-07-20T10:00:00.000Z",
          "endDateTime": "2025-07-22T23:00:00.000Z",
          "status": "PUBLISHED",
          "organiser": { "id": 10, "firstName": "John", "lastName": "Smith", "email": "john.smith@example.com" },
          "tickets": [ // Array of available ticket types for this event
            {
              "id": 101,
              "name": "General Admission",
              "price": "50.00", // String representation of Decimal
              "quantityTotal": 1000,
              "quantitySold": 123,
              "salesStart": "2025-06-01T00:00:00.000Z",
              "salesEnd": "2025-07-19T23:59:59.000Z",
              "status": "ACTIVE"
            },
            {
              "id": 102,
              "name": "VIP Pass",
              "price": "150.00",
              "quantityTotal": 200,
              "quantitySold": 30,
              // ...
            }
          ],
          "eventQuestions": [ // Array of questions for this event's registration form
            {
              "id": 1, // This is the EventQuestion ID (eqId)
              "questionId": 201, // Actual Question ID
              "isRequired": true,
              "displayOrder": 1,
              "question": { // The actual question details
                "id": 201,
                "questionText": "What is your T-shirt size?",
                "questionType": "MULTIPLE_CHOICE", // Enum: TEXT, MULTIPLE_CHOICE, etc.
                "category": "Apparel",
                "validationRules": { "options": ["S", "M", "L", "XL"] } // Example
              }
            },
            {
              "id": 2,
              "questionId": 202,
              "isRequired": false,
              "displayOrder": 2,
              "question": {
                "id": 202,
                "questionText": "Any dietary restrictions?",
                "questionType": "TEXT"
              }
            }
          ],
          "_count": { "registrations": 123 }
        }
        ```
    *   **Frontend Action:** Display detailed event information. If the user proceeds to register, use the `tickets` array to show ticket options and the `eventQuestions` array to dynamically build the registration questionnaire. The `eventQuestions[n].id` is the `eventQuestionId` needed when submitting responses.

### 3.2. Registration Workflow

This flow allows users (guests or logged-in) to register for an event.

*   **Step 1: User Selects Event & Tickets, Provides Participant Info (Frontend UI)**
    *   Frontend has the `eventId`.
    *   User selects tickets: `Array<{ ticketId: number, quantity: number }>`. For free events, this array should be empty.
    *   User provides details for each participant (total number of participants must match total ticket quantity for paid events). Each participant object is a `ParticipantInput`:
        ```json
        // ParticipantInput Structure
        {
          "email": "string",         // required, valid email
          "firstName": "string",     // required
          "lastName": "string",      // required
          "phoneNumber": "string?",  // optional
          "dateOfBirth": "string?",  // optional, ISO Date string e.g., "1990-01-15" or "1990-01-15T00:00:00.000Z"
          "address": "string?",      // optional
          "city": "string?",         // optional
          "state": "string?",        // optional
          "zipCode": "string?",      // optional
          "country": "string?",      // optional
          "responses": [             // required array, even if empty
            {
              "eventQuestionId": "number", // ID of the EventQuestion (from GET /api/events/:eventId)
              "responseText": "string"   // User's answer
            }
            // ... more responses for this participant
          ]
        }
        ```

*   **Step 2: Backend Call - Create Registration (`POST /api/registrations`)**
    *   **Endpoint:** `POST /api/registrations`
    *   **Headers:**
        *   `Content-Type: application/json`
        *   For **logged-in user registrations**: `Authorization: Bearer <JWT_ACCESS_TOKEN>` (Backend derives `userId`).
        *   For **guest registrations**: No `Authorization` header.
    *   **Request Body (`CreateRegistrationDto`):**
        ```json
        // Example for a paid event, logged-in user registering self + one guest
        {
          "eventId": 1, 
          "tickets": [
            { "ticketId": 101, "quantity": 1 }, // Ticket for self
            { "ticketId": 102, "quantity": 1 }  // Ticket for guest
          ],
          "participants": [
            { 
              "email": "loggedinuser@example.com", "firstName": "LoggedUser", "lastName": "Name", 
              "responses": [{ "eventQuestionId": 1, "responseText": "M" }] 
            },
            { 
              "email": "guestfriend@example.com", "firstName": "Guest", "lastName": "Friend", 
              "responses": [{ "eventQuestionId": 1, "responseText": "L" }] 
            }
          ]
        }
        ```
        *Refer to `docs/test_payloads/registration_payloads.md` for more examples.*
    *   **Success Response (201 Created - `CreateRegistrationResponse`):**
        ```json
        {
          "message": "Registration pending payment", // or "Registration confirmed" for free events
          "registrationId": 123,
          "paymentToken": "d76491ea-30d8-41ec-8cf9-d610ea41cab0" // ONLY for guest registration for a PAID event
        }
        ```
    *   **Frontend Action:**
        *   If `message` is "Registration confirmed" (free event), registration is complete. Navigate to a success page or update UI.
        *   If `message` is "Registration pending payment", store `registrationId`. If `paymentToken` is present (guest flow), store it securely (e.g., in-memory for the current session, or session storage if appropriate care is taken) for the next step. Proceed to Payment Intent Creation. Handle potential errors (400, 404) by displaying messages to the user.

### 3.3. Payment Workflow (for Paid Events)

This follows a `PENDING` registration for a paid event.

*   **Step 1: Backend Call - Create Payment Intent (`POST /api/payments/create-intent`)**
    *   **Purpose:** To obtain a `clientSecret` from Stripe, which is needed to initialize Stripe Elements on the frontend for payment.
    *   **Endpoint:** `POST /api/payments/create-intent`
    *   **Headers:**
        *   `Content-Type: application/json`
        *   For **logged-in user's payment**: `Authorization: Bearer <JWT_ACCESS_TOKEN>`
        *   For **guest's payment**: No `Authorization` header (relies on `paymentToken` in body).
    *   **Request Body (`CreatePaymentIntentDto`):**
        ```json
        // For logged-in user
        {
          "registrationId": 123 // From previous registration step
        }
        ```
        ```json
        // For guest user
        {
          "registrationId": 124, // From previous registration step
          "paymentToken": "d76491ea-30d8-41ec-8cf9-d610ea41cab0" // From previous registration step
        }
        ```
    *   **Success Response (200 OK or 201 Created):**
        ```json
        {
          "clientSecret": "pi_XYZ_secret_ABC", // Stripe Payment Intent Client Secret
          "paymentId": 567                   // Your internal backend Payment record ID
        }
        ```
    *   **Frontend Action:** Receive and store the `clientSecret`. This secret is sensitive and should be handled carefully. It will be used to initialize Stripe Elements for payment collection. Handle errors (400, 401, 403, 404) appropriately. For example, if a guest's `paymentToken` is expired (403), the user might need to restart the registration.

*   **Step 2: Frontend Payment Processing with Stripe.js/Elements**
    *   **Initialization:** Use your Stripe Publishable Key and the `clientSecret` to initialize Stripe Elements (e.g., the Card Element).
        ```javascript
        // Example JS on frontend
        // const stripe = Stripe('YOUR_STRIPE_PUBLISHABLE_KEY');
        // const elements = stripe.elements({ clientSecret });
        // const cardElement = elements.create('card');
        // cardElement.mount('#card-element-div');
        ```
    *   **Payment Submission:** When the user submits their payment details:
        ```javascript
        // Example JS on frontend
        // const { error, paymentIntent } = await stripe.confirmCardPayment(
        //   clientSecret, // From your backend
        //   {
        //     payment_method: {
        //       card: cardElement,
        //       billing_details: { name: 'Cardholder Name' },
        //     },
        //   }
        // );
        ```
    *   **Handle Stripe.js Response:**
        *   If `error` (e.g., `error.type === 'card_error'` or `error.type === 'validation_error'`): Display `error.message` to the user. They may need to correct their card details or try a different card.
        *   If `paymentIntent.status === 'succeeded'`: The payment was processed successfully by Stripe. The frontend can now show a tentative success message or redirect to an order confirmation/thank you page.
        *   If `paymentIntent.status === 'requires_action'` or `'requires_confirmation'`: Additional steps like 3D Secure might be needed. Stripe.js often handles these automatically if configured.
    *   **Frontend Dev Note:** While `paymentIntent.status === 'succeeded'` from `confirmCardPayment` is a strong indicator, the final confirmation of order fulfillment should rely on backend status updates driven by webhooks.

*   **Step 3: Backend Webhook Handling (Information for Frontend Context)**
    *   **Purpose:** Stripe sends asynchronous notifications (webhooks) to your backend (`POST /api/payments/webhook/stripe`) about payment events. This is how your backend reliably updates the order/registration status.
    *   **Events Handled by Backend:** `payment_intent.succeeded`, `payment_intent.payment_failed`.
    *   **Backend Actions:**
        *   On `payment_intent.succeeded`: `Registration.status` -> `CONFIRMED`, `Payment.status` -> `COMPLETED`.
        *   On `payment_intent.payment_failed`: `Payment.status` -> `FAILED`.
    *   **How Frontend Gets Final Confirmed Status (Post-Stripe.js interaction):**
        1.  **Polling:** After `stripe.confirmCardPayment` indicates success (or a pending state), the frontend can poll a backend endpoint (e.g., `GET /api/registrations/:registrationId`) periodically to check if `Registration.status` has changed to `CONFIRMED`.
        2.  **Redirect with Server-Side Check:** Redirect to a success/order page. This page, when loaded, makes a backend call to get the definitive registration/payment status.
        3.  **WebSockets (Advanced):** If implemented, the backend could push a real-time status update to the connected frontend client. (Specify if not implemented).
        *Frontend Dev Note: Do not consider the registration fully complete and fulfilled based *only* on the Stripe.js `confirmCardPayment` success. Always ensure the user is directed to a state where the backend-confirmed status is eventually checked and displayed.*

### 3.4. Event Management (Organizer & Admin Actions)

This section details endpoints primarily used by users with `ORGANIZER` or `ADMIN` roles to create and manage events. All endpoints here require authentication and appropriate authorization.

*   **Create New Event:** `POST /api/events`
    *   **Purpose:** Allows an authenticated `ORGANIZER` (or `ADMIN`) to create a new event.
    *   **Authentication:** Required (`ORGANIZER` or `ADMIN` role - your route shows `authenticate` which implies any authenticated user, then `EventController.createEvent` would need to assign `organiserId` from `req.user.userId`. Confirm if specific role authorization is needed at route or handled in service).
    *   *Frontend Dev Note: The `createEventSchema` is used for validation. Ensure the request body matches this schema.*
    *   **Request Body (`CreateEventDto` - refer to Swagger/types for full structure):**
        ```json
        {
          "name": "My Awesome Conference",
          "description": "A conference about awesome things.",
          "location": "Virtual or Physical Location",
          "capacity": 200,
          "eventType": "CONFERENCE", // Or other valid EventType enum
          "isFree": false,
          "startDateTime": "2025-10-01T09:00:00.000Z",
          "endDateTime": "2025-10-02T17:00:00.000Z",
          "tickets": [ // Required if isFree is false
            {
              "name": "Early Bird",
              "price": "75.00",
              "quantityTotal": 50,
              "salesStart": "2025-06-01T00:00:00.000Z",
              "salesEnd": "2025-07-31T23:59:59.000Z"
            },
            {
              "name": "Standard",
              "price": "100.00",
              "quantityTotal": 150,
              "salesStart": "2025-08-01T00:00:00.000Z",
              "salesEnd": "2025-09-30T23:59:59.000Z"
            }
          ],
          "questions": [ // Optional array of questions for the event
            {
              "questionText": "What is your company size?",
              "questionType": "MULTIPLE_CHOICE", // Default is TEXT
              "isRequired": false,
              "displayOrder": 1,
              "validationRules": { "options": ["1-10", "11-50", "51-200", "200+"] }
            },
            {
              "questionText": "Any special requests?",
              "isRequired": false,
              "displayOrder": 2
            }
          ]
        }
        ```
    *   **Success Response (201 Created):** The newly created event object, including generated IDs for the event, tickets, and questions.
    *   **Frontend Action:** Typically redirect to the event's management page or update the organizer's list of events.

*   **Update Existing Event:** `PUT /api/events/:eventId`
    *   **Purpose:** Allows the event organizer (or admin) to update details of an existing event.
    *   **Authentication:** Required (`ORGANIZER` or `ADMIN` role).
    *   **Path Parameter:** `:id` (number) - The ID of the event.
    *   **Request Body (`UpdateEventDto` / `CreateEventRequest` from Swagger - partial updates allowed, send only fields to change):**
        ```json
        {
          "description": "An updated description for this awesome conference.",
          "capacity": 250
          // Can also include updates to tickets and questions arrays.
          // Handling updates to tickets/questions might involve sending the full desired state
          // or specific instructions for add/update/delete (backend logic dependent).
        }
        ```
        *Frontend Dev Note: Clarify with backend/Swagger how updates to nested arrays like `tickets` and `questions` are handled (e.g., full replacement vs. partial patch).*
    *   **Success Response (200 OK):** The updated event object.
    *   **Frontend Action:** Refresh event details display.

*   **Delete Event:** `DELETE /api/events/:id`
    *   **Purpose:** Allows the event organizer (or admin) to delete an event.
    *   **Authentication:** Required (`ORGANIZER` or `ADMIN` role).
    *   **Path Parameter:** `:id` (number) - The ID of the event.
    *   **Success Response (204 No Content or 200 OK with message):**
    *   **Frontend Action:** Remove event from lists, confirm deletion.
    *   **Note:** Deletion might be restricted if the event has existing registrations (backend should enforce this).

*   **Update Event Status:** `PATCH /api/events/:id/status`
    *   **Purpose:** Allows the organizer/admin to change the event's status (e.g., from `DRAFT` to `PUBLISHED`, or to `CANCELLED`).
    *   **Authentication:** Required (`ORGANIZER` or `ADMIN` role).
    *   **Path Parameter:** `:id` (number) - The ID of the event.
    *   **Request Body:**
        ```json
        {
          "status": "PUBLISHED" // Enum: DRAFT, PUBLISHED, CANCELLED, COMPLETED
        }
        ```
    *   **Success Response (200 OK):** The event object with the updated status.
    *   **Frontend Action:** Update event status display, potentially trigger notifications or UI changes based on new status.
    *   **Note:** Backend enforces valid status transitions (e.g., cannot publish an event without tickets if paid).

### 3.5. Ticket Management (Organizer Perspective)

This section covers how authenticated `ORGANIZER`s can manage ticket types for their events. These routes are typically nested under an event. The base path for these ticket routes is `/api/events/:eventId/tickets`.

*   **Create New Ticket Type for an Event:** `POST /api/events/:eventId/tickets`
    *   **Purpose:** Allows an `ORGANIZER` to add a new ticket type (e.g., "General Admission", "VIP") to one of their events.
    *   **Authentication:** Required (`ORGANIZER` role and ownership of the event).
    *   **Path Parameter:** `:eventId` (number) - The ID of the event to which this ticket type will be added.
    *   **Request Body (`CreateTicketRequest` - from OpenAPI schema):**
        ```json
        {
          "name": "Early Bird Special",
          "description": "Limited availability early bird ticket.",
          "price": 40.00,
          "quantityTotal": 50,
          "salesStart": "2025-06-01T00:00:00Z",
          "salesEnd": "2025-06-30T23:59:59Z"
          // "status" is optional, defaults to ACTIVE
        }
        ```
    *   **Success Response (201 Created - `TicketDetailResponse`):**
        ```json
        {
          "success": true,
          "data": {
            "id": 201,
            "eventId": 1,
            "name": "Early Bird Special",
            "description": "Limited availability early bird ticket.",
            "price": 40.00,
            "quantityTotal": 50,
            "quantitySold": 0,
            "salesStart": "2025-06-01T00:00:00Z",
            "salesEnd": "2025-06-30T23:59:59Z",
            "status": "ACTIVE",
            "createdAt": "YYYY-MM-DDTHH:mm:ss.sssZ",
            "updatedAt": "YYYY-MM-DDTHH:mm:ss.sssZ"
          }
        }
        ```
    *   **Frontend Action:** After successful creation, update the UI to display the new ticket type in the event's management interface.

*   **Update Existing Ticket Type:** `PUT /api/events/:eventId/tickets/:ticketId`
    *   **Purpose:** Allows an `ORGANIZER` to modify details of an existing ticket type for their event.
    *   **Authentication:** Required (`ORGANIZER` role and ownership of the event).
    *   **Path Parameters:**
        *   `:eventId` (number) - The ID of the event.
        *   `:ticketId` (number) - The ID of the ticket type to update.
    *   **Request Body (`UpdateTicketRequest` - from OpenAPI schema, send only fields to change):**
        ```json
        {
          "price": 45.00,
          "quantityTotal": 75,
          "status": "INACTIVE" // Example: temporarily deactivate sales
        }
        ```
    *   **Success Response (200 OK - `TicketDetailResponse`):** The updated ticket object.
    *   **Frontend Action:** Refresh the display of the ticket type with the new details.

*   **Delete Ticket Type:** `DELETE /api/events/:eventId/tickets/:ticketId`
    *   **Purpose:** Allows an `ORGANIZER` to delete a ticket type from their event.
    *   **Authentication:** Required (`ORGANIZER` role and ownership of the event).
    *   **Path Parameters:**
        *   `:eventId` (number) - The ID of the event.
        *   `:ticketId` (number) - The ID of the ticket type to delete.
    *   **Success Response (200 OK with message or 204 No Content):**
        ```json
        {
          "success": true,
          "message": "Ticket deleted successfully"
        }
        ```
    *   **Frontend Action:** Remove the ticket type from the event's management UI.
    *   **Note:** The backend may prevent deletion if tickets of this type have already been sold (`quantitySold > 0`). The frontend should handle potential 400 Bad Request errors in such cases.

---

## 4. Key Data Structures (DTOs) Summary

This section provides a summary of important Data Transfer Objects (DTOs) used in API requests and responses. For complete details, always refer to the Swagger documentation or the backend type definition files (`src/types/`).

*   **`UserLoginDto` (Request for `POST /api/auth/login`):**
    *   `email: string`
    *   `password: string`

*   **`UserRegistrationDto` (Request for `POST /api/auth/register`):**
    *   `email: string`
    *   `password: string`
    *   `firstName: string`
    *   `lastName: string`

*   **`UserResponseDto` (Typical user object in responses):**
    *   `id: number`
    *   `email: string`
    *   `firstName: string`
    *   `lastName: string`
    *   `role: string (PARTICIPANT | ORGANIZER | ADMIN)`
    *   `createdAt: string (ISO Date)`
    *   `updatedAt: string (ISO Date)`

*   **`CreateEventDto` (Request for `POST /api/events`):**
    *   `name: string`
    *   `description: string`
    *   `location: string`
    *   `capacity: number`
    *   `eventType: string (Enum: SPORTS, MUSICAL, SOCIAL, VOLUNTEERING)`
    *   `isFree: boolean`
    *   `startDateTime: string (ISO Date)`
    *   `endDateTime: string (ISO Date)`
    *   `tickets?: Array<TicketInputDto>` (Required if `isFree` is false)
        *   `TicketInputDto`: `{ name: string, price: string (Decimal), quantityTotal: number, salesStart?: string (ISO Date), salesEnd?: string (ISO Date) }`
    *   `questions?: Array<QuestionInputDto>`
        *   `QuestionInputDto`: `{ questionText: string, questionType?: string (Enum), isRequired?: boolean, displayOrder: number, validationRules?: object }`

*   **`UpdateEventDto` (Request for `PUT /api/events/:eventId`):**
    *   Contains optional fields from `CreateEventDto`. Structure for updating `tickets` and `questions` should be confirmed (full replacement or partial patch).

*   **`EventResponseDto` / `EventSummaryDto` (Typical event object in responses):**
    *   `id: number`
    *   `name: string`
    *   `description?: string`
    *   `location: string`
    *   `capacity: number`
    *   `eventType: string`
    *   `isFree: boolean`
    *   `startDateTime: string (ISO Date)`
    *   `endDateTime: string (ISO Date)`
    *   `status: string (Enum: DRAFT, PUBLISHED, CANCELLED, COMPLETED)`
    *   `organiser: UserSummaryDto`
    *   `tickets?: TicketResponseDto[]` (Typically in full event details)
    *   `eventQuestions?: EventQuestionResponseDto[]` (Typically in full event details)
    *   `_count?: { registrations: number }`

*   **`CreateRegistrationDto` (Request for `POST /api/registrations`):**
    *   `eventId: number`
    *   `tickets: Array<{ ticketId: number, quantity: number }>` (Empty array `[]` for free events)
    *   `participants: Array<ParticipantInputDto>`
        *   `ParticipantInputDto`: `{ email: string, firstName: string, lastName: string, phoneNumber?: string, dateOfBirth?: string (ISO Date), ..., responses: Array<{ eventQuestionId: number, responseText: string }> }`

*   **`CreateRegistrationResponse` (Response from `POST /api/registrations`):**
    *   `message: string`
    *   `registrationId: number`
    *   `paymentToken?: string` (For guest registrations for paid events)

*   **`CreatePaymentIntentDto` (Request for `POST /api/payments/create-intent`):**
    *   `registrationId: number`
    *   `paymentToken?: string` (For guest payments)

*   **`CreatePaymentIntentResponse` (Response from `POST /api/payments/create-intent`):**
    *   `clientSecret: string`
    *   `paymentId: number`

*(This is not an exhaustive list. Other DTOs for specific responses like individual ticket details, participant details, etc., can be found in Swagger or `src/types/`.)*

---

## 4.4. Admin Registration Management Views (Implemented)

The following frontend views have been implemented to integrate with the completed backend read APIs for registration management:

*   **Event-Specific Registration List View:**
    *   **Component:** `src/views/admin/Registration/EventRegistrationListView.vue`
    *   **Purpose:** Displays a paginated, filterable, and searchable list of registrations for a specific event.
    *   **Backend API:** `GET /api/events/:eventId/registrations` (See section 3.6.1)
    *   **Route:** `/admin/events/:eventId/registrations` (Name: `AdminEventRegistrationList`)

*   **System-Wide Registration List View (Admin Only):**
    *   **Component:** `src/views/admin/Registration/SystemRegistrationListView.vue`
    *   **Purpose:** Displays a paginated, filterable, and searchable list of all registrations across the system.
    *   **Backend API:** `GET /api/registrations/admin/all-system-summary` (See section 3.6.2)
    *   **Route:** `/admin/registrations` (Name: `AdminSystemRegistrationList`)

*   **Detailed Registration Information View:**
    *   **Component:** `src/views/admin/Registration/RegistrationDetailsView.vue`
    *   **Purpose:** Displays comprehensive details for a single registration, including attendees, responses, and purchase information.
    *   **Backend API:** `GET /api/registrations/:registrationId` (See section 3.6.3)
    *   **Route:** `/admin/registrations/:registrationId` (Name: `AdminRegistrationDetail`)

These views are integrated into the Admin Layout and accessible via the defined routes and links from other admin pages (e.g., Event List, Admin Sidebar).

---

### 3.6. Registration Management (Admin/Organizer Views - Read APIs)

This section details the backend APIs implemented as part of Phase 1 for viewing and querying registration data, primarily for Administrator and Event Organizer roles.

*   **1. List Registrations for a Specific Event:** `GET /api/events/:eventId/registrations`
    *   **Purpose:** Allows an authenticated `ORGANIZER` (for events they own) or an `ADMIN` to retrieve a paginated list of registration summaries for a specific event.
    *   **Authentication:** Required. The backend service layer enforces that the user is either an Admin or the Organizer of the specified event.
    *   **Path Parameter:**
        *   `:eventId` (number): The ID of the event for which to list registrations.
    *   **Query Parameters:**
        *   `page=<number>` (optional, default: 1): For pagination.
        *   `limit=<number>` (optional, default: 10): For pagination.
        *   `search=<string>` (optional): Searches across primary registrant's and attendees' names and emails.
        *   `status=<CONFIRMED|PENDING|CANCELLED>` (optional): Filters by registration status.
        *   `ticketId=<number>` (optional): Filters by registrations that include a specific ticket type.
    *   **Success Response (200 OK):**
        ```json
        {
          "message": "Registrations for event X retrieved successfully",
          "data": [
            {
              "registrationId": 1,
              "registrationDate": "2025-05-20T10:00:00.000Z",
              "primaryParticipantName": "John Doe",
              "primaryParticipantEmail": "john.doe@example.com",
              "numberOfAttendees": 2,
              "registrationStatus": "CONFIRMED",
              "totalAmountPaid": 100.00 
            }
            // ... more registration summaries
          ],
          "pagination": {
            "page": 1,
            "limit": 10,
            "totalCount": 25,
            "totalPages": 3
          }
        }
        ```
    *   **Frontend Action:** Used in the event management dashboard to display a list of registrations for an event. Implement UI controls for pagination, search, and filtering based on the available query parameters.

*   **2. List All Registrations System-Wide (Admin View):** `GET /api/registrations/admin/all-system-summary`
    *   **Purpose:** Allows an authenticated `ADMIN` to retrieve a paginated list of all registration summaries across all events in the system.
    *   **Authentication:** Required (`ADMIN` role only).
    *   **Path Note:** While the conceptual API path might be `/api/admin/registrations`, due to routing structure, this is implemented at `/api/registrations/admin/all-system-summary`.
    *   **Query Parameters:**
        *   `page=<number>` (optional, default: 1)
        *   `limit=<number>` (optional, default: 10)
        *   `search=<string>` (optional): Searches across primary registrant's and attendees' names and emails.
        *   `status=<CONFIRMED|PENDING|CANCELLED>` (optional): Filters by registration status.
        *   `ticketId=<number>` (optional): Filters by registrations including a specific ticket.
        *   `eventId=<number>` (optional): Filters for registrations of a specific event.
        *   `userId=<number>` (optional): Filters for registrations created by a specific user.
        *   `participantId=<number>` (optional): Filters for registrations where the specified participant is the primary registrant.
    *   **Success Response (200 OK):**
        ```json
        {
          "message": "All registrations retrieved successfully for admin view",
          "data": [
            {
              "registrationId": 1,
              "registrationDate": "2025-05-20T10:00:00.000Z",
              "eventName": "Annual Music Festival", // Included for admin view
              "primaryParticipantName": "John Doe",
              "primaryParticipantEmail": "john.doe@example.com",
              "numberOfAttendees": 2,
              "registrationStatus": "CONFIRMED",
              "totalAmountPaid": 100.00
            }
            // ... more registration summaries
          ],
          "pagination": { /* ... pagination object ... */ }
        }
        ```
    *   **Frontend Action:** Used in the admin dashboard for a global view of registrations. Implement UI controls for all available filters and pagination.

*   **3. Get Detailed Registration Information (Enhanced):** `GET /api/registrations/:registrationId`
    *   **Purpose:** Allows an authenticated user (`ADMIN`, `ORGANIZER` of the event, or the `PARTICIPANT` who owns the registration) to retrieve comprehensive details for a single registration.
    *   **Authentication:** Required.
    *   **Path Parameter:**
        *   `:registrationId` (number): The ID of the registration to retrieve.
    *   **Success Response (200 OK):** A detailed registration object.
        ```json
        // Example structure (key fields, refer to Swagger/types for full details)
        {
          "message": "Registration retrieved successfully",
          "data": {
            "id": 123, // Registration ID
            "status": "CONFIRMED",
            "created_at": "2025-05-20T10:00:00.000Z",
            "participant": { /* ... full primary participant details ... */ },
            "event": {
              "id": 1,
              "name": "Annual Music Festival",
              "startDateTime": "2025-07-20T10:00:00.000Z",
              // ... other event summary fields
            },
            "attendees": [
              {
                "id": 1, // Attendee ID
                "participant": { /* ... full participant details for this attendee ... */ },
                "responses": [
                  {
                    "id": 10, // Response ID
                    "responseText": "M",
                    "eventQuestion": {
                      "id": 1, // EventQuestion link ID
                      "question": {
                        "id": 201,
                        "questionText": "What is your T-shirt size?",
                        "questionType": "MULTIPLE_CHOICE"
                      }
                    }
                  }
                  // ... other responses for this attendee
                ]
              }
              // ... other attendees
            ],
            "purchase": {
              "id": 78,
              "totalPrice": "150.00",
              "items": [
                {
                  "id": 90, // PurchaseItem ID
                  "quantity": 1,
                  "unitPrice": "50.00", // Price at time of purchase
                  "ticket": { "id": 101, "name": "General Admission" }
                },
                {
                  "id": 91,
                  "quantity": 1,
                  "unitPrice": "100.00",
                  "ticket": { "id": 102, "name": "VIP Early Bird" }
                }
              ],
              "payment": { /* ... payment details if available ... */ }
            }
          }
        }
        ```
    *   **Frontend Action:** Used to display a detailed view of a specific registration. This view would typically be accessed by clicking on an item from one of the list views (from API 1 or 2).

*   **4. Update Registration Status:** `PATCH /api/registrations/:registrationId/status`
    *   **Purpose:** Allows an authenticated `ADMIN` or `ORGANIZER` (for events they own) to update the status of a specific registration.
    *   **Authentication:** Required (`ADMIN` or `ORGANIZER` role).
    *   **Path Parameter:**
        *   `:registrationId` (number): The ID of the registration to update.
    *   **Request Body (`UpdateRegistrationStatusDto`):**
        ```json
        {
          "status": "CONFIRMED" // Or "CANCELLED", etc. Must be a valid RegistrationStatus enum value.
        }
        ```
    *   **Success Response (200 OK):** The full updated registration details (similar to the response from `GET /api/registrations/:registrationId`).
        ```json
        {
          "message": "Registration status updated successfully",
          "data": {
            // ... full registration details with the new status ...
            "id": 123,
            "status": "CONFIRMED", 
            // ... other fields as in GET /api/registrations/:registrationId
          }
        }
        ```
    *   **Error Responses:**
        *   `400 Bad Request`: If the `registrationId` is invalid, the `status` in the body is invalid, or the status transition is not allowed (e.g., trying to update a `CANCELLED` registration).
        *   `401 Unauthorized`: If the user is not authenticated.
        *   `403 Forbidden`: If the authenticated user is not an Admin and not the Organizer of the event associated with the registration.
        *   `404 Not Found`: If the registration with the given `registrationId` does not exist.
    *   **Frontend Action:** Typically triggered from an admin/organizer registration detail view. After a successful update, refresh the displayed registration details to reflect the new status.

*(Next sections could include: User Profile Management, Ticket Management (by Organizers), other Registration Management update/action APIs, Workflow Diagrams, etc.)*
