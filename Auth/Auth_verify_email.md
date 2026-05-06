# Verify Email Address

**URL Path:** `/api/v1/auth/verify-email`

**Method:** `GET`

**Description:** Activates a user account. This endpoint is called when a user clicks the "Verify Email Address" link sent to their inbox after registration.

## Request Data
- **Query Parameters:**
    - `token` (str): The unique verification token generated during registration.

## Response Data
- **Success (200 OK):**
    - `message`: "Email verified successfully. You can now log in."

## Error Responses
- **400 Bad Request:** Invalid or expired verification token.

## Integration Note
- Once verification is successful, the frontend should redirect the user to the Login page with a success message.
