import type { AppSettings } from "@/user-settings";

export type UserStatus = "active" | "deleted";
export type UserFeature =
  | 'task-sync';

// Base user interface
export interface User {
  id: string;
  display_name: string;
  avatar_url?: string;
  created_at: string;
  status: UserStatus;
  features: string[];
  setting_overrides?: AppSettings;
}

// Local user interface extends base user with local avatar and settings
export interface LocalUser extends User {
  avatar?: Blob;
}

// Utility functions for User objects
/**
 * Check if the user has a specific feature
 */
export function userHasFeature(user: User, feature: UserFeature): boolean {
  return user.features.includes(feature);
}

/**
 * Check if the user is anonymous (has a special anonymous ID)
 */
export function isAnonymous(user: User): boolean {
  return user.id === 'anonymous';
}

/**
 * Get default features for anonymous users
 */
export function getDefaultUserFeatures(): UserFeature[] {
  return [];
}