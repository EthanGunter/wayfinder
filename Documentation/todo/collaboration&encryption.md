# Collaboration & Encryption Architecture Guide

This document outlines a phased approach to implementing collaboration features and end-to-end encryption. Start with Stage 1 under each system, ship it, then iterate.

---

## Collaboration System

### Stage 1: Basic Sharing & Rules

#### Core Concepts

**Rule:** An access control definition attached to a node. Rules cascade to all descendants until overridden.

**Rule Storage:**
- Add `ruleId` column to nodes table (plaintext foreign key)
- Create `access_rules` table with composite key `(ruleId, userId)` or `(ruleId, role)`
- Each node points to exactly one rule; descendants inherit it

**Permission Levels:** `read`, `write`, `admin` (can grant access to others)

#### User Stories

**Average Joe creates a project:**
1. Joe creates node with `type: 'project'`
2. System auto-creates rule `joe-project-123` with `joe` as admin
3. Project node stores `ruleId: "joe-project-123"`
4. All child tasks inherit this rule automatically

**Joe shares project with Carrol:**
1. Joe clicks "Share" → enters Carrol's email
2. System finds Carrol's userId
3. Adds row to `access_rules`: `(ruleId: "joe-project-123", userId: "carrol-456", permission: "write")`
4. Carrol receives notification
5. Carrol can now query nodes with that ruleId

**Carrol tries to access a node:**
1. Carrol requests node `task-789`
2. Server checks: does Carrol have any rule in `access_rules` matching `task-789.ruleId`?
3. If yes → return node; if no → reject

**Joe revokes Carrol's access:**
1. Joe removes Carrol's row from `access_rules`
2. Immediate effect: Carrol's next query returns nothing
3. No data reprocessing needed at this stage

#### Implementation Notes

- Keep `parents`, `children`, `status`, `dueDate`, `todaysTask` plaintext for indexing
- Tree walking only needed when *setting* rules, not reading them
- Rule inheritance is logical, not duplicated data
- Query optimization: index on `(userId, ruleId)` for fast permission checks

---

### Stage 2: Collaboration Spaces

When Joe shares with Carrol, auto-create a "collaboration space" (a lightweight group):

**User Story:**
- Joe shares Project A with Carrol → creates Space S
- Joe later shares Project B with Carrol → adds to Space S
- Both projects use Space S's rule
- Carrol can add Dave to Space S → Dave gets access to both projects

**Benefits:**
- One rule for multiple projects
- Members can grant access to other members (solves "Alice offline" problem)
- Natural UX: "Who's in this project?" shows member list

**Tables to add:**
- `collaboration_spaces`: `(spaceId, name, ownerId)`
- `space_members`: `(spaceId, userId, permission)`
- `space_rules`: `(spaceId, ruleId)` (links space to its access rule)

---

### Stage 3: Role-Based Access (Enterprise)

Instead of granting access per-user, grant per-role:

**User Story:**
- Create role "support-team" with members [Alice, Bob, Carol]
- Share project with role "support-team" → all members get access
- Add Dave to role → wrap project key once for Dave
- Remove Carol from role → rotate role key, re-wrap for remaining members

**Tables to add:**
- `roles`: `(roleId, name, orgId)`
- `role_members`: `(roleId, userId)`
- `role_keys`: `(roleId, userId, wrappedRoleKey)`

**Tradeoff:** More complex but reduces key churn for large teams.

---

## Encryption System

### Stage 1: Project-Level Encryption (Opt-In)

#### Core Concepts

**Encryption is per-project, not per-node.** All nodes in a project share one encryption key.

**Key Hierarchy:**
- **Project Key (PK):** Symmetric key (XChaCha20-Poly1305) that encrypts `title` and `content`
- **Wrapped PK:** PK encrypted with each authorized user's public key
- **User Key Pair:** Each user has a public/private key pair (generated on first encryption enable)

**Why store `encryptedPrivateKey` in the DB?**
- The user's private key is encrypted with a key derived from their password (or OAuth session)
- Storing it lets users access their key from any device after logging in
- **Without this:** Users would need to manually transfer keys between devices (copy-paste, QR codes) - terrible UX
- The server never sees the *raw* private key, only the encrypted version

#### User Stories

**Joe enables encryption on his project:**
1. Joe clicks "Enable Encryption" on project
2. Client generates PK
3. Client fetches Joe's private key (decrypted with his password/session)
4. Client wraps PK with Joe's public key → creates `wrappedPK`
5. Client uploads:
 - `nodes` table: `encryption: { enabled: true, keyVersion: 1 }`
 - `project_keys` table: `(projectId, userId: "joe", wrappedPK: "...", keyVersion: 1)`
6. Client re-encrypts all existing `title` and `content` fields with PK
7. From now on, all mutations encrypt data before sending

**Joe shares encrypted project with Carrol:**
1. Joe clicks "Share" → enters Carrol's email
2. System finds Carrol's public key (she must have enabled encryption first)
3. Joe's client fetches PK (by decrypting his wrappedPK)
4. Joe's client wraps PK with Carrol's public key
5. Uploads to `project_keys`: `(projectId, userId: "carrol", wrappedPK: "...", keyVersion: 1)`
6. Carrol receives notification
7. Carrol can now decrypt PK and read data

**Carrol accesses an encrypted node:**
1. Carrol queries node `task-789`
2. Server returns node with `encryption: { enabled: true, keyVersion: 1 }`
3. Carrol's client fetches `wrappedPK` for that project and her userId
4. Carrol's client decrypts wrappedPK using her private key → gets PK
5. Carrol's client decrypts `title` and `content` using PK
6. Renders decrypted data

**Joe revokes Carrol's access (simple version):**
1. Joe removes Carrol's row from `access_rules`
2. Carrol can no longer query nodes (server rejects)
3. **No key rotation** - Carrol could theoretically decrypt old data if she saved it
4. **Tradeoff:** Accept this risk for simplicity

**Joe revokes Carrol's access (maximum security version):**
1. Joe removes Carrol's row from `access_rules`
2. Joe's client generates new PK'
3. Joe's client re-encrypts all project data with PK'
4. Joe's client wraps PK' for all remaining members (including himself)
5. Updates `project_keys` with new wrappedPKs, increments `keyVersion: 2`
6. Old PK is now useless
7. **Tradeoff:** High server load, slow operation, potential for failure mid-rotation

#### Implementation Notes

**Tables to add:**
- `user_keys`: `(userId, publicKey, encryptedPrivateKey)`
- `project_keys`: `(projectId, userId, wrappedPK, keyVersion)`

**Key Management:**
- Private keys encrypted with password-derived key (PBKDF2/Argon2id)
- For OAuth: private key encrypted with session-derived key, stored in IndexedDB
- Recovery phrase generated on first enable; required for new devices

**Performance:**
- Fetch PK once per session, cache in memory
- Decrypt node data on-demand, cache in memory
- Keep indexes on plaintext fields (`status`, `dueDate`) for server-side filtering

---

### Stage 2: Advanced Encryption Features

**Key Versioning & Lazy Rotation:**
- Store `keyVersion` on each node
- When rotating PK after revocation, only re-encrypt nodes when they're next modified
- Old versions remain decryptable with old PK (stored in `project_keys` with version number)
- Prevents massive batch operations

**Multiple Key Authorities:**
- Any member can wrap PK for new members (not just owner)
- Solves "Alice offline, Bob wants to add Carrol" problem

---

### Security Tradeoff Summary

| Feature | Simple (Stage 1) | Maximum Security (Stage 2) |
|---------|------------------|----------------------------|
| Revocation | Delete ACL row only | Rotate PK, re-encrypt all data |
| Key Authority | Any member can grant | Only owner can grant (or majority vote) |
| Group Management | Per-project sharing | Dedicated collaboration spaces |
| Performance | Fast, simple | Slow, complex background jobs |
| Threat Protection | Malicious admin can't read data | Malicious admin *and* ex-members can't read new data |

---

### OAuth & Key Stability Clarification

**Key generation happens once, not per login:**

1. **First login:** OAuth succeeds → client generates master key → encrypts with session token → stores in IndexedDB
2. **Subsequent logins:** OAuth succeeds → derive key from token → decrypt master key from IndexedDB → use it
3. **New device:** OAuth succeeds → IndexedDB empty → prompt for recovery phrase → regenerate master key

**IndexedDB vs localStorage:** IndexedDB can store crypto keys as non-extractable objects, making them harder to steal via XSS. localStorage is just a string, easily accessed by any script.

---

## Getting Started Checklist

### Collaboration Checklist (Build First)

- [ ] Add `ruleId` column to nodes table
- [ ] Create `access_rules` table
- [ ] Implement rule inheritance logic (set on parent, cascade to children)
- [ ] Add sharing UI (email/username input)
- [ ] Add permission checks to all queries
- [ ] Test: Joe shares with Carrol, Carrol can access, Joe revokes, Carrol loses access
- [ ] Add collaboration spaces (Stage 2)

### Encryption Checklist (Build Later)

- [ ] Generate user key pairs on first encryption enable
- [ ] Add `encryption` column to nodes table
- [ ] Create `project_keys` table
- [ ] Implement client-side encryption/decryption for title/content
- [ ] Add recovery phrase UI
- [ ] Add "Enable Encryption" toggle to projects
- [ ] Test: Joe enables encryption, shares with Carrol, both can decrypt, revocation works
- [ ] Implement key rotation (optional, for maximum security)

**Start with the collaboration checklist.** Ship it. Then decide if the encryption checklist is worth the complexity for your users.