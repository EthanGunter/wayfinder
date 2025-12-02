# Register Component Tests

These tests should be implemented using a testing library compatible with Svelte 5.

## Test Cases

1.  **Successful Registration**
    *   **Setup**: Mock `authAPI.getRegistrationRequirements` to return `ok([])`. Mock `authAPI.register` to return `ok()`.
    *   **Action**: Fill Display Name, Email, Password, Confirm Password. Click "Create account".
    *   **Expectation**: `authAPI.register` called with correct data. Redirects to `/planner`.

2.  **Registration - Existing Account (Correct Password -> Auto-Login)**
    *   **Setup**: Mock `authAPI.register` to return `ok()` (simulating the provider handling the auto-login logic internally, or successful registration if the provider handles it transparently).
    *   *Note*: Since the logic "User exists -> Login" is inside `ConvexAuthProvider.ts`, the component just sees a success `ok()` or failure.
    *   *Integration Test Variant*: If testing integration with `ConvexAuthProvider`, ensure that if `signUp` fails with "User exists" and `signIn` succeeds, the `register` call returns `ok()`.

3.  **Registration - Existing Account (Wrong Password)**
    *   **Setup**: Mock `authAPI.register` to return `err(new ArgumentError("Account already exists and password does not match"))`.
    *   **Action**: Fill email `existing@example.com` with wrong password. Click "Create account".
    *   **Expectation**: Error message "Account already exists and password does not match" is displayed.

4.  **Validation - Password Mismatch**
    *   **Action**: Fill Password `secret` and Confirm Password `mismatch`.
    *   **Expectation**: Error "Passwords do not match" displayed. `authAPI.register` NOT called.

5.  **Validation - Missing Fields**
    *   **Action**: Leave Display Name empty.
    *   **Expectation**: Error "Display name is required" displayed.

6.  **Pre-filling**
    *   **Setup**: Mount component with `initialEmail` and `initialPassword` props.
    *   **Expectation**: Input fields for email and password are pre-filled with provided values.

