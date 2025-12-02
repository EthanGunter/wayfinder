# Login Component Tests

These tests should be implemented using a testing library compatible with Svelte 5 (e.g., `@testing-library/svelte` + `vitest` with `jsdom`).

## Test Cases

1.  **Successful Login**
    *   **Setup**: Mock `authAPI.login` to return `ok()`.
    *   **Action**: Fill email, password, click "Sign in".
    *   **Expectation**: `authAPI.login` called with credentials. Redirects to `/planner` (or specified redirect).

2.  **Login Failure - Invalid Credentials**
    *   **Setup**: Mock `authAPI.login` to return `err(new ArgumentError("Invalid email or password"))`.
    *   **Action**: Fill email, password, click "Sign in".
    *   **Expectation**: Error message "Invalid email or password" is displayed. User remains on Login screen.

3.  **Login Failure - User Not Found (Auto-Switch to Register)**
    *   **Setup**: Mock `authAPI.login` to return `err(new NotFoundError("User not found"))`.
    *   **Action**: Fill email `new@example.com`, password `secret`, click "Sign in".
    *   **Expectation**: `openRegister` is called (Login component unmounts or hides, Register component mounts).
    *   **Verification**: Register component should be visible and pre-filled with `new@example.com` and `secret`.

4.  **Form Validation**
    *   **Action**: Click "Sign in" without filling fields.
    *   **Expectation**: HTML5 validation or custom error "Email and password are required" displayed. `authAPI.login` is NOT called.

5.  **Manual Switch to Register**
    *   **Action**: Click "Register" link.
    *   **Expectation**: Register component becomes visible.

