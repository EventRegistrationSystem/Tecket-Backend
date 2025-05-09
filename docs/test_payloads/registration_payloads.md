# Registration API Test Payloads

This file contains example request bodies for testing the `POST /api/registrations` endpoint.

**Note:**
*   Replace placeholder IDs (like `eventId`, `ticketId`, `userId`, `eventQuestionId`) with actual IDs from your seeded database.
*   The number of objects in the `participants` array should match the total quantity of tickets.
*   Ensure participant emails are unique if they are intended to create new distinct participant records.

---

## Scenario 1: Registered User - Single Attendee, Single Ticket Type

**Description:** `participant1@example.com` (assuming `userId: 3`) registers themselves for 'Annual Music Festival' (`eventId: 1`) and buys one 'General Admission' ticket (`ticketId: 1`).

**Endpoint:** `POST /api/registrations`
**Headers:**
*   `Content-Type: application/json`
*   `Authorization: Bearer <YOUR_JWT_ACCESS_TOKEN>` (Required for registered user)

**Request Body:**
```json
{
  "eventId": 1, // Replace with actual eventId
  "tickets": [
    {
      "ticketId": 1, // Replace with actual ticketId for General Admission
      "quantity": 1
    }
  ],
  "participants": [
    {
      "email": "participant1@example.com", // Email of the registered user
      "firstName": "Participant",
      "lastName": "1",
      "phoneNumber": "0400000001",
      "responses": [
        {
          "eventQuestionId": 1, // Replace with actual eventQuestionId for T-shirt
          "responseText": "L"
        },
        {
          "eventQuestionId": 2, // Replace with actual eventQuestionId for Dietary
          "responseText": "None"
        }
      ]
    }
  ]
}
```
**Expected Outcome (for paid event):**
*   HTTP 201 Created.
*   Response includes `registrationId`.
*   `Registration` status is `PENDING`.
*   `Purchase` record created, linked to the registration.
*   `PurchaseItem` record created for the GA ticket.
*   `Attendee` record created linking the registration and the participant profile associated with `participant1@example.com`.
*   `Response` records created for this attendee.
*   No `paymentToken` should be returned in the response for a registration associated with a `userId`.

---

## Scenario 2: Guest User - Single Attendee, Single Ticket Type

**Description:** A guest registers for 'Annual Music Festival' (`eventId: 1`) and buys one 'VIP' ticket (`ticketId: 2`).

**Endpoint:** `POST /api/registrations`
**Headers:**
*   `Content-Type: application/json`

**Request Body:**
```json
{
  "eventId": 1, // Replace with actual eventId
  "tickets": [
    {
      "ticketId": 2, // Replace with actual ticketId for VIP
      "quantity": 1
    }
  ],
  "participants": [
    {
      "email": "guest1.test@example.com", // Unique email for the guest
      "firstName": "Guest",
      "lastName": "One",
      "phoneNumber": "0411111111",
      "responses": [
        {
          "eventQuestionId": 1, // Replace with actual eventQuestionId for T-shirt
          "responseText": "M"
        },
        {
          "eventQuestionId": 2, // Replace with actual eventQuestionId for Dietary
          "responseText": "Vegetarian"
        }
      ]
    }
  ]
}
```
**Expected Outcome (for paid event):**
*   HTTP 201 Created.
*   Response includes `registrationId` and a `paymentToken`.
*   `Registration` status is `PENDING`, `userId` is null.
*   `Participant` record created for `guest1.test@example.com`.
*   `Purchase` record created, linked to the registration, with `paymentToken` (hashed) and `paymentTokenExpiry` populated.
*   `PurchaseItem` record created for the VIP ticket.
*   `Attendee` record created linking the registration and the new guest participant.
*   `Response` records created for this attendee.

---

## Scenario 3: Registered User - Multiple Attendees, Mixed Ticket Types

**Description:** `participant2@example.com` (assuming `userId: 4`) registers themselves and a guest ('Friend One') for 'Annual Music Festival' (`eventId: 1`). They buy one 'General Admission' ticket (`ticketId: 1`) for themselves and one 'VIP' ticket (`ticketId: 2`) for their friend.

**Endpoint:** `POST /api/registrations`
**Headers:**
*   `Content-Type: application/json`
*   `Authorization: Bearer <YOUR_JWT_ACCESS_TOKEN>` (Required for registered user)

**Request Body:**
```json
{
  "eventId": 1, // Replace with actual eventId
  // "userId" is no longer sent in the body; it's derived from the JWT
  "tickets": [
    {
      "ticketId": 1, // GA ticket
      "quantity": 1
    },
    {
      "ticketId": 2, // VIP ticket
      "quantity": 1
    }
  ],
  "participants": [
    { // Details for participant2@example.com (GA ticket)
      "email": "participant2@example.com",
      "firstName": "Participant",
      "lastName": "2",
      "phoneNumber": "0400000002",
      "responses": [
        { "eventQuestionId": 1, "responseText": "XL" },
        { "eventQuestionId": 2, "responseText": "None" }
      ]
    },
    { // Details for Friend One (VIP ticket)
      "email": "friend.one@example.com", // Guest email
      "firstName": "Friend",
      "lastName": "One",
      "phoneNumber": "0422222222",
      "responses": [
        { "eventQuestionId": 1, "responseText": "S" },
        { "eventQuestionId": 2, "responseText": "Vegan" }
      ]
    }
  ]
}
```
**Expected Outcome (for paid event):**
*   HTTP 201 Created.
*   Response includes `registrationId`.
*   `Registration` status is `PENDING`, linked to `userId: 4`.
*   `Purchase` record created.
*   Two `PurchaseItem` records created (one for GA, one for VIP).
*   Two `Attendee` records created:
    *   One for `participant2@example.com`.
    *   One for `friend.one@example.com` (a new or existing participant profile for this email).
*   `Response` records created for each attendee.
*   No `paymentToken` in the response.

---

## Scenario 4: Guest User - Multiple Attendees, Single Ticket Type

**Description:** A guest registers themselves and another guest ('Guest Two') for 'Annual Music Festival' (`eventId: 1`). They buy two 'General Admission' tickets (`ticketId: 1`).

**Endpoint:** `POST /api/registrations`
**Headers:**
*   `Content-Type: application/json`

**Request Body:**
```json
{
  "eventId": 1, // Replace with actual eventId
  // "userId" is omitted
  "tickets": [
    {
      "ticketId": 1, // GA ticket
      "quantity": 2
    }
  ],
  "participants": [
    { // Details for the primary guest making the registration
      "email": "main.guest2@example.com",
      "firstName": "MainGuest",
      "lastName": "Two",
      "phoneNumber": "0433333333",
      "responses": [
        { "eventQuestionId": 1, "responseText": "M" },
        { "eventQuestionId": 2, "responseText": "None" }
      ]
    },
    { // Details for the second guest attendee
      "email": "other.guest2@example.com",
      "firstName": "OtherGuest",
      "lastName": "Two",
      "phoneNumber": "0444444444",
      "responses": [
        { "eventQuestionId": 1, "responseText": "L" },
        { "eventQuestionId": 2, "responseText": "Gluten-Free" }
      ]
    }
  ]
}
```
**Expected Outcome (for paid event):**
*   HTTP 201 Created.
*   Response includes `registrationId` and a `paymentToken`.
*   `Registration` status is `PENDING`, `userId` is null.
*   `Purchase` record created with `paymentToken`.
*   One `PurchaseItem` record for 2 GA tickets.
*   Two `Attendee` records created for `main.guest2@example.com` and `other.guest2@example.com`.
*   `Response` records created for each attendee.
