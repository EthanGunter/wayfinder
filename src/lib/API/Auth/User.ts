import type { Database, Tables } from '../supabase';

export type UserStatus = Database['public']['Enums']['user_status'];
export type UserFeatures =
  | 'task-sync';

// Base user interface
export interface User {
  id: string;
  display_name: string;
  avatar_url?: string;
  created_at: string;
  status: UserStatus;
  features: string[];
}

// Local user interface extends base user with local avatar
export interface LocalUser extends User {
  avatar?: Blob;
}

// Utility functions for User objects
/**
 * Check if the user has a specific feature
 */
export function userHasFeature(user: User, feature: UserFeatures): boolean {
  return user.features.includes(feature);
}

/**
 * Check if the user is anonymous (has a special anonymous ID)
 */
export function isAnonymous(user: User): boolean {
  return user.display_name === 'anonymous';
}

/**
 * Get default features for anonymous users
 */
export function getDefaultUserFeatures(): UserFeatures[] {
  return [];
}