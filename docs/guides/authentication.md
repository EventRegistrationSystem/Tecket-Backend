# Authentication Workflow

This document outlines the authentication mechanism used in this application, focusing on user registration, login, token management, and logout processes.

## Overview

The system uses JSON Web Tokens (JWT) for authentication, employing a standard pattern with short-lived Access Tokens and long-lived Refresh Tokens.

*   **Access Token:**
    *   Sent in the `Authorization: Bearer <token>` header for requests to protected endpoints.
    *   Contains user ID and role (`userId`, `role`).
    *   Short lifespan (e.g., 1 hour) to limit the impact if compromised.
    *   Stored in frontend application memory (e.g., state management).
*   **Refresh Token:**
    *   Used solely to obtain a new Access Token when the current one expires.
    *   Sent to the client via a secure, `HttpOnly`, `SameSite=Strict` cookie. This prevents direct access via JavaScript (mitigating XSS).
    *   Longer lifespan (e.g., 7 days).
    *   Automatically handled by the browser for requests to the refresh endpoint.

## Endpoints and Flow

### 1. User Registration

*   **Endpoint:** `POST /auth/register`
*   **Request Body:** User details (email, password, firstName, lastName, phoneNo). See OpenAPI spec for schema.
*   **Validation:** Input validated against `registerSchema`.
*   **Process:**
    1.  Checks if email already exists.
    2.  Hashes the provided password using `bcrypt`.
    3.  Creates a new user record in the database with a default role (`PARTICIPANT`).
    4.  Generates a new JWT Access Token and a new JWT Refresh Token.
*   **Response:**
    *   **Status:** `201 Created`
    *   **Headers:** Sets the Refresh Token in an `HttpOnly` cookie (`refreshToken`).
    *   **Body:** JSON object containing `success: true`, and `data` with the new `user` object (excluding password) and the `accessToken`.

### 2. User Login

*   **Endpoint:** `POST /auth/login`
*   **Request Body:** User credentials (email, password). See OpenAPI spec for schema.
*   **Validation:** Input validated against `loginSchema`.
*   **Process:**
    1.  Finds the user by email.
    2.  Compares the provided password with the stored hash using `bcrypt.compare`.
    3.  If credentials are valid, generates a new JWT Access Token and a new JWT Refresh Token.
*   **Response:**
    *   **Status:** `200 OK`
    *   **Headers:** Sets the Refresh Token in an `HttpOnly` cookie (`refreshToken`), overwriting any previous one for the user.
    *   **Body:** JSON object containing `success: true`, and `data` with the `user` object (excluding password) and the `accessToken`.

### 3. Accessing Protected Resources

*   **Requirement:** A valid, non-expired Access Token.
*   **Process:**
    1.  Client includes the Access Token in the `Authorization: Bearer <token>` header of the request.
    2.  The `authenticate` middleware intercepts the request.
    3.  It verifies the token's signature and expiry using the `JWT_SECRET`.
    4.  If valid, it decodes the payload (`userId`, `role`) and attaches it to `req.user`.
    5.  If the route uses the `authorize` middleware, it checks if `req.user.role` is permitted.
    6.  If authentication/authorization passes, the request proceeds to the controller.
    7.  If the token is invalid, expired, or permissions are insufficient, a `401 Unauthorized` or `403 Forbidden` error is returned.

### 4. Refreshing the Access Token

*   **Endpoint:** `POST /auth/refresh-token`
*   **Trigger:** Typically called by the frontend when an API request fails with a `401 Unauthorized` error, indicating the Access Token has expired.
*   **Process:**
    1.  Client sends a request to this endpoint. The browser automatically includes the `refreshToken` cookie.
    2.  Backend reads the refresh token from the cookie.
    3.  It verifies the refresh token using the `REFRESH_TOKEN_SECRET`.
    4.  If valid, it finds the associated user.
    5.  Generates a *new* Access Token and a *new* Refresh Token.
*   **Response:**
    *   **Status:** `200 OK`
    *   **Headers:** Sets the *new* Refresh Token in the `HttpOnly` cookie (`refreshToken`).
    *   **Body:** JSON object containing `success: true`, and `data` with the *new* `accessToken`.
    *   **Failure:** If the refresh token is invalid or expired, returns a `401 Unauthorized` error. The user must log in again.

### 5. User Logout

*   **Endpoint:** `POST /auth/logout`
*   **Requirement:** Requires a valid Access Token (uses `authenticate` middleware).
*   **Process:**
    1.  Client sends a request including the Access Token in the `Authorization` header.
    2.  Backend verifies the Access Token.
    3.  Backend clears the `refreshToken` cookie by sending a `Set-Cookie` header with an expired date or empty value.
*   **Response:**
    *   **Status:** `200 OK`
    *   **Body:** JSON object containing `success: true` and a confirmation message.

## Frontend Considerations

The frontend plays a crucial role in managing the token lifecycle for a seamless user experience.

*   **Storing Tokens:**
    *   **Access Token:** Store the received Access Token in application memory (e.g., state management variables like React Context, Redux, Zustand). **Avoid `localStorage` or `sessionStorage`** due to XSS vulnerabilities.
    *   **Refresh Token:** No direct storage needed. The browser handles the `HttpOnly` cookie automatically.
*   **Making Authenticated Requests:**
    *   For API calls to protected backend endpoints, retrieve the Access Token from memory and include it in the `Authorization: Bearer <token>` header.
*   **Handling Access Token Expiry (Automatic Refresh Workflow):**
    *   This is the key to handling the short lifespan of the Access Token without interrupting the user.
    *   **Implement an HTTP Interceptor:** Configure your frontend HTTP client (e.g., Axios interceptors, Fetch API wrapper) to intercept outgoing requests and incoming responses.
    *   **Detect `401 Unauthorized`:** In the response interceptor, check if an API call failed with a `401` status code. This usually indicates an expired Access Token.
    *   **Request New Token:** If a `401` is detected, the interceptor should automatically (and often silently) make a `POST` request to the `/auth/refresh-token` endpoint. The browser will automatically include the `refreshToken` cookie.
    *   **Handle Refresh Response:**
        *   **Success (`200 OK`):** The backend responds with a new Access Token. Update the Access Token stored in your frontend memory.
        *   **Failure (e.g., `401`):** The Refresh Token itself is invalid or expired. The user's session is over. Clear any stored user data and Access Token, and redirect the user to the login page.
    *   **Retry Original Request:** After successfully obtaining a new Access Token, the interceptor should automatically retry the original API request (the one that failed with `401`) using the *new* Access Token.
    *   **Queueing Requests (Optional but Recommended):** If multiple API calls fail around the same time due to token expiry, the interceptor should ideally queue subsequent failed requests while the first one attempts to refresh the token. Once refreshed, retry all queued requests. This prevents multiple simultaneous calls to the refresh endpoint.
*   **Logout:**
    *   When the user initiates logout, make a `POST` request to `/auth/logout` (including the current Access Token in the `Authorization` header).
    *   The backend will clear the `refreshToken` cookie.
    *   On the frontend, clear the Access Token and any user data stored in memory.
    *   Redirect the user (e.g., to the login page).
