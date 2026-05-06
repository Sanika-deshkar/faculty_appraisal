# Verify Token & Roles (Protected Route)

**URL Path:** `/protected`

**Method:** `GET`

**Description:** A test endpoint used to verify that a JWT token is valid and to see exactly how the backend interprets the user's roles and jurisdiction (Department/School/Division).

## Request Data
- **Headers:**
    - `Authorization: Bearer <access_token>`

## Response Data
- **Success (200 OK):**
    ```json
    {
        "message": "Authentication successful",
        "user": {
            "id": "uuid-string",
            "roles": ["faculty"],
            "department": "CSE",
            "school_id": "uuid-string",
            "division": "Engineering"
        }
    }
    ```

## Error Responses
- **401 Unauthorized:** Token is missing, expired, or invalid.

## Integration Note
- Use this endpoint during development to debug why a user might be getting `403 Forbidden` on other routes. 
- It reveals the extracted `roles` and `jurisdiction` that the backend's Hierarchical Access Control (HAC) is using.
