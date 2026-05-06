# Get Current Session

**URL Path:** `/api/v1/auth/session`

**Method:** `GET`

**Description:** Returns details about the currently authenticated user. Used by the frontend to verify if a session is still active and to retrieve user roles/permissions.

## Request Data
- **Headers:**
    - `Authorization: Bearer <access_token>`

## Response Data
- **Success (200 OK):**
    - `id` (UUID): User's unique ID.
    - `roles` (List[str]): List of assigned roles.
    - `department` (str): User's department.
    - `school_id` (UUID): ID of the assigned school.

## Error Responses
- **401 Unauthorized:** Token is missing, expired, or invalid.

## Integration Note
- Unlike Supabase, this local API is **stateless**. The backend does not remember "sessions" in memory.
- If this endpoint returns 401, the frontend **MUST** clear the token from its local storage and redirect to the login page.

## Detailed Guide
For the complete authentication and session lifecycle, see [Auth_Session_Flow.md](./Auth_Session_Flow.md).

