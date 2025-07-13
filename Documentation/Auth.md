# Flow
1. User downloads / accesses the app for the first time and an anonymous user account is created on their local device
	- When a user first encounters the app, we don't want them thinking about Auth. How do you make important account decisions when you don't even know what the app is?
2. (optional) Users may create multiple local user accounts if they so desire, and as such have the option to modify their local account's info, like username, icon, and authentication method
	- Local authentication methods include: password, fingerprint, etc. (I'm not sure what's available to us yet)
3. If a user decides to pay for the sync feature of Wayfinder:
	1. They will be asked to make any necessary changes to the currently signed in local user so it's compatible with remote auth providers
	2. A remote user account will be created, and all of the local data for that user will be uploaded via the database provider
	3. Local data will be updated with the remote account's id so it's still available in the event of plan suspension, or offline state.

>[!warning]
>  In this version of Wayfinder, if the account is synced, and is offline, **the data will be read only**
>  *Remote backup requires conflict management incase a change comes in after an offline change is made to the same data.* 

# Interfaces
*Actual implementation may differ, see code for specifics*
## IAuthProvider
```ts
interface IAuthProvider {
  getCurrentUser(): Promise<User | null>;
  signIn(credentials: SignInCredentials): Promise<AuthResult>;
  signUp(details: SignUpDetails): Promise<AuthResult>;
  signOut(): Promise<void>;
  onAuthStateChanged(callback: (user: User | null) => void): UnsubscribeFn;
}
```
### Implementations
- SupabaseAuth
- LocalAuth

## IMigrationProvider
```ts
/* Provides services to handle the account migration from local to remote */
interface IMigrationProvider {
	/* Gets a list of things needed before the migratino can take place */
	getAccountIssues(): AccountIssues[]
	/* Creates the remote account and uploads all of its data */
	migrateAccount(localAccount, ITaskDataProvider): Promise<void>
}
```
### Implementations
- LocalToSupabaseMigrator

# Data Types
## User
```ts
interface User {
	id: string;
	displayName: string;
	email?: string;
}

type LocalUserProxy = User & {
	isSynced: boolean
}
```

## Sign in options
```ts
type SignInCredentials =
  | { type: 'local'; pin: string }
  | { type: 'email_password'; email: string; password: string }
  | { type: 'passwordless_email'; email: string }
  | { type: 'oauth'; provider: 'google' | 'apple' | 'github'; token?: string }
```

# Things to track
## Concurrent users
How many active sessions are under the *same* user account. Theoretically, with realtime updates, multiple people could use the same account for collaboration. Not necessarily a bad thing, but it *could* get out of hand