# User Login (Local Auth)

**URL Path:** `/api/v1/auth/login`

**Method:** `POST`

**Description:** Authenticates a user and returns a JWT token. This is only available when `USE_LOCAL_AUTH` is enabled in the backend.

## Request Data
- **Type:** `application/x-www-form-urlencoded` (OAuth2 standard)
- **Body (Form Data):**
    - `username` (str): The user's email.
    - `password` (str): The user's password.

## Response Data
- **Success (200 OK):**
    - `access_token` (str): The JWT token.
    - `token_type` (str): "bearer"

## Error Responses
- **401 Unauthorized:** Incorrect email or password.
- **400 Bad Request:** Local authentication not enabled.

## Notes for Frontend
- Use this token in the header: `Authorization: Bearer <access_token>` for all subsequent requests.
