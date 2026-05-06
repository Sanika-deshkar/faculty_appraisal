# Session Management & Authentication Flow

This document outlines the end-to-end process for handling user authentication and session management in the Faculty Appraisal system.

## 1. Registration Phase
- **Endpoint:** `POST /api/v1/auth/register`
- **Action:** User submits email, password, and profile details.
- **Result:** An account is created in `is_verified = false` state. A verification email is sent.
- **Reference:** [Auth_register.md](./Auth_register.md)

## 2. Verification Phase
- **Endpoint:** `GET /api/v1/auth/verify-email?token=<token>`
- **Action:** User clicks the link in their email.
- **Result:** Account is activated (`is_verified = true`). User can now log in.
- **Reference:** [Auth_verify_email.md](./Auth_verify_email.md)

## 3. Authentication (Login) Phase
- **Endpoint:** `POST /api/v1/auth/login`
- **Data:** Form-data (OAuth2 standard: `username` and `password`).
- **Result:** Returns a JWT `access_token`.
- **Frontend Action:** Store this token securely (e.g., `localStorage` or `HttpOnly` cookie if applicable).
- **Reference:** [Auth_login.md](./Auth_login.md)

## 4. Session Validation & Persistence
- **Endpoint:** `GET /api/v1/auth/session`
- **Requirement:** Header `Authorization: Bearer <token>`.
- **Usage:** Call this on App Load to verify if the stored token is still valid and to retrieve the user's roles/department.
- **Result:** User metadata (ID, Roles, Dept).
- **Reference:** [Auth_session.md](./Auth_session.md)

## 5. Using the Session
- For all subsequent API calls, include the token in the headers:
  ```http
  Authorization: Bearer <access_token>
  ```
- If any request returns `401 Unauthorized`, the session has expired or is invalid.

## 6. Role-Based Access Control (RBAC)
- The `roles` list returned in the session dictates what the user can see/do.
- **Common Roles:** `faculty`, `staff`, `hod`, `director`, `dean`, `vc`, `admin`.
- **Hierarchy Logic:** Higher roles can access subordinates' data via the same endpoints (passing the subordinate's `faculty_id`).

## 7. Logout Phase
- **Action:** Client-side only.
- **Frontend Action:** Remove the token from storage and redirect to the login page.
- **Reference:** [Auth_logout.md](./Auth_logout.md)
