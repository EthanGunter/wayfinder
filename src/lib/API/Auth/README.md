# User Authentication and Feature System

## Overview

The new User class provides a simple way to check user permissions and features throughout the application. Every user account is now represented in the cloud with feature flags that determine what capabilities they have access to.

## User Class

The `User` class provides a clean interface for checking user features:

```typescript
import { User } from '$lib/API/Auth/User';

// Check if user has a specific feature
if (user.hasFeature('CLOUD_SYNC')) {
  // Enable cloud synchronization
}

// Check if user has any of multiple features
if (user.hasAnyFeature(['CLOUD_SYNC', 'MULTI_DEVICE'])) {
  // Enable premium features
}

// Check if user has all required features
if (user.hasAllFeatures(['CREATE_TASKS', 'EDIT_TASKS'])) {
  // Enable task management
}
```

## Available Features

### Core Features (Free)
- `CREATE_TASKS` - Create new tasks
- `EDIT_TASKS` - Edit existing tasks
- `DELETE_TASKS` - Delete tasks
- `VIEW_TASKS` - View task lists

### Premium Features
- `CLOUD_SYNC` - Synchronize data across devices
- `MULTI_DEVICE` - Use app on multiple devices
- `ADVANCED_TAGGING` - Advanced task organization
- `TASK_TEMPLATES` - Save and reuse task templates
- `EXPORT_DATA` - Export task data
- `ADVANCED_ANALYTICS` - Detailed task analytics

### Enterprise Features
- `TEAM_COLLABORATION` - Share tasks with team members
- `ADMIN_PANEL` - Administrative controls
- `API_ACCESS` - Programmatic access to data
- `CUSTOM_INTEGRATIONS` - Third-party integrations

## Usage Examples

### In Components

```svelte
<script lang="ts">
  import { User } from '$lib/API/Auth/User';
  
  export let user: User;
</script>

<!-- Show premium features only if user has access -->
{#if user.hasFeature('CLOUD_SYNC')}
  <button>Sync to Cloud</button>
{/if}

<!-- Conditional rendering based on features -->
{#if user.hasFeature('ADVANCED_TAGGING')}
  <AdvancedTaggingComponent />
{:else}
  <BasicTaggingComponent />
{/if}
```

### In Stores

```typescript
import { writable } from 'svelte/store';
import type { User } from '$lib/API/Auth/User';

export const userStore = writable<User | null>(null);

// Check features in stores
export function canUserSync(): boolean {
  const user = get(userStore);
  return user?.hasFeature('CLOUD_SYNC') ?? false;
}
```

### In API Calls

```typescript
export async function syncTasks(tasks: Task[]) {
  const user = get(userStore);
  
  if (!user?.hasFeature('CLOUD_SYNC')) {
    throw new Error('Cloud sync not available for this account');
  }
  
  // Proceed with sync
  return await remoteAPI.syncTasks(tasks);
}
```

## Migration from Old System

The old `registerUser` and `migrateRegisteredUser` methods have been replaced with a unified approach:

1. **Every user has a cloud representation** - No more local-only users
2. **Feature flags determine capabilities** - Check `user.hasFeature()` before enabling features
3. **Simplified sync logic** - The existing sync queue handles offline scenarios
4. **Clear permission boundaries** - Features are gated based on subscription status

## Database Schema

Users are stored in the `users` table with the following structure:

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status user_status DEFAULT 'active',
  features TEXT[] DEFAULT '{}'
);
```

The `features` array contains the feature flags that determine what the user can access.

## Next Steps

1. **Update existing components** to use `user.hasFeature()` checks
2. **Implement subscription management** to update user features
3. **Add feature gates** around premium functionality
4. **Test offline scenarios** with the sync queue
5. **Add user upgrade flows** for premium features

