# User Registration (Local Auth)

**URL Path:** `/api/v1/auth/register`

**Method:** `POST`

**Description:** Registers a new user in the local database. This is only available when `USE_LOCAL_AUTH` is enabled in the backend.

## Request Data
- **Type:** `application/json`
- **Body (JSON):**
    - `email` (str): Unique email address.
    - `password` (str): Plain text password.
    - `name` (str): Full name.
    - `department` (str): Assigned department.
    - `role` (str, optional): Role (faculty, staff, hod, etc. Default: faculty).

## Response Data
- **Success (201 Created):**
    - `message` (str): "User registered. Please check your email to verify your account."

## Integration Flow
1. User submits registration form.
2. Frontend shows a "Check your email" screen.
3. User verifies via email link.
4. User returns to login page to sign in.

## Access Control
- **Public:** No token required.
