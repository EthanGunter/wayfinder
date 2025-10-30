```mermaid
flowchart TD
    A[App Start / Route Change] --> B{Has valid session for active account?}
    B -- Yes --> C[Render Protected App Route]
    C -->|User switches account| D[Open Switch User]
    C -->|User logs out| E[Invalidate Session]
    C -->|Token expires / revoked| F[Session Revoked Handler]

    B -- No --> G[Auth Shell (Root Gate)]
    G --> H{Known accounts on device?}
    H -- None --> I[Login / Register Choice]
    H -- Some --> J[Switch User View (List of Known Accounts)]

    I --> K[Login View]
    I --> L[Register View]

    J --> M{Select Account}
    M --> N[Attempt Silent Session Restore]
    N --> O{Restore OK?}
    O -- Yes --> C
    O -- No --> P[Reauthenticate for Selected Account]

    K --> Q{Login Success?}
    Q -- Yes --> R[Set Active Account + Persist Known Account]
    R --> S[Redirect to Intended Route or Home]
    Q -- No --> K

    L --> T{Registration Success?}
    T -- Yes --> R
    T -- No --> L

    P --> U{Reauth Success?}
    U -- Yes --> C
    U -- No --> J

    E --> V[Clear Active Session]
    V --> W[Show Auth Shell with Switch User]
    F --> W
```