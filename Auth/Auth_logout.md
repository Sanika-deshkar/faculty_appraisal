# User Logout

**Method:** Client-side Action

**Description:** Terminates the user's active session. Since the backend uses stateless JWT authentication, "logging out" is primarily a frontend responsibility.

## Implementation Steps
1. **Clear Token:** Remove the `access_token` from local storage (e.g., `localStorage.removeItem('token')`).
2. **Clear State:** Reset any global user state in the frontend application (e.g., Redux, Vuex, or React Context).
3. **Redirect:** Redirect the user to the Login page.

## Backend Note
- There is no specific `/logout` endpoint on the backend because the server does not store session state. 
- The backend will treat the user as logged out as soon as the client stops sending the valid `Authorization` header.

## Best Practices
- If you are using cookies to store the token, ensure the cookie is cleared or expired.
- For maximum security, the frontend should immediately wipe any sensitive user data from memory upon logout.
