# Flow
On first open (or when no local user exists) the app creates a local anonymous user so people can use the app immediately. From that anonymous state the user can:
- Continue as guest (Act as if logged in, and use anon account in place)
- Register (create a new account and attach local data to that account).
- Login to an existing account (behavior differs depending on whether the anonymous account has local data).
## States & available actions
- Initial: No local user → create anonymous user (anon).
  - Available actions: Continue as guest, Register, Login.

- Continue as guest
  - Effect: provides a user id for local tasks to be associated with temporarily.
  - Later: user may still Register or Login from settings.

- Register (while using anon)
  - Effect: create server account, migrate/attach local anon items to new account, delete anon record/token.
  - UX: confirm success and show items now belong to the account.
  - Failure: keep local anon data and show retry/backup options.

- Login (existing account)
  - If anon has zero local items:
    - Effect: silently discard anon and sign in to account.
  - If anon has local items:
    - Present decision modal with three explicit choices:
      1. Merge local items into the account (recommended) — upload/migrate items to the signed-in account, dedupe if needed, then delete anon.
      2. Discard local items and sign in — delete local anon data (with backup/confirmation) and sign in.
      3. Create a new account to preserve these items — route to registration to attach them to a newly created account.
  - If user logs into a different account than expected: treat like any login with local items — present same choices.
## TL;DR:
If anon has *no* local items: logging in / registering simply replaces the anon session. 
If anon *has* local items: the user must choose Merge (attach items to the signed-in account), Discard (delete local items), or Create account (preserve items by registering). Always back up before destructive actions.
```mermaid 
flowchart TD
  Start([App open: no local user]) --> CreateAnon[Create anonymous user]
  CreateAnon --> Register[Register]
  CreateAnon --> Login[Login]

  Migrate[Migrate local items to new account]
  Register --> Migrate
  Migrate --> DeleteAnonReg[Delete anon, sign in as new user]
  DeleteAnonReg --> SignedIn

  Login --> SignedIn

  Login --> |If Local Data| Modal[Show modal: Merge / Discard / Create account]
  Modal --> |Merge| Migrate
  Modal --> |Discard| Discard[Discard local items and sign in]
  Modal --> |Create New| CreateAccount[Create seperate account to keep items]
  
  CreateAccount --> CreateLogin[Store new account and login as requested]
  CreateLogin --> SignedIn

  Discard --> ConfirmDiscard[Are you sure??]
  ConfirmDiscard --> SignedIn
  ```

# Things to track
## Concurrent users
How many active sessions are under the *same* user account. Theoretically, with realtime updates, multiple people could use the same account for collaboration. Not necessarily a bad thing, but it *could* get out of hand