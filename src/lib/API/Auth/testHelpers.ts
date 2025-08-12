import { v4 } from 'uuid';
import { type User, type LocalUser } from './User';
import type { Tables } from '../supabase';

/**
 * Test helper to create a valid UserData object
 */
export function createTestUser(overrides: Partial<Tables<'users'>> = {}): Tables<'users'> {
    return {
        id: v4(),
        display_name: "Test User",
        avatar_url: undefined,
        created_at: new Date().toISOString(),
        status: 'active' as const,
        features: [],
        ...overrides
    };
}



/**
 * Test helper to create an anonymous user
 */
export function createAnonymousUser(): LocalUser {
    const userData = createTestUser({
        display_name: 'anonymous',
        features: [],
    });
    return userData;
}
