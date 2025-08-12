import type { Database, Tables } from '../supabase';

export type UserStatus = Database['public']['Enums']['user_status'];
export type UserFeatures =
  | 'task-sync';

export class User {
  public readonly id: string;
  public readonly display_name: string;
  public readonly avatar_url?: string;
  public readonly created_at: string;
  public readonly status: UserStatus;
  public readonly features: string[];

  constructor(userData: Tables<'users'>) {
    this.id = userData.id;
    this.display_name = userData.display_name;
    this.avatar_url = userData.avatar_url;
    this.created_at = new Date(userData.created_at).toISOString();
    this.status = userData.status || 'active';
    this.features = userData.features || [];
  }

  /**
   * Check if the user has a specific feature
   */
  hasFeature(feature: UserFeatures): boolean {
    return this.features.includes(feature);
  }

  /**
   * Check if the user has any of the specified features
   */
  hasAnyFeature(features: UserFeatures[]): boolean {
    return features.some(feature => this.hasFeature(feature));
  }

  /**
   * Check if the user has all of the specified features
   */
  hasAllFeatures(features: UserFeatures[]): boolean {
    return features.every(feature => this.hasFeature(feature));
  }

  /**
   * Check if the user is active
   */
  isActive(): boolean {
    return this.status === 'active';
  }

  /**
   * Check if the user is deleted
   */
  isDeleted(): boolean {
    return this.status === 'deleted';
  }

  /**
   * Check if the user is anonymous (has a special anonymous ID)
   */
  isAnonymous(): boolean {
    return this.display_name === 'anonymous';
  }

  /**
   * Create a User instance from raw data
   */
  static fromRaw(userData: Tables<'users'>): User {
    return new User(userData);
  }

  /**
   * Get default features for anonymous users
   */
  static getDefaultFeatures(): UserFeatures[] {
    return [];
  }
}

/** Provides cached and local-only data for users */
export class LocalUser extends User {
  public readonly avatar?: Blob;

  constructor(userData: Tables<'users'>, avatar?: Blob) {
    super(userData);
    this.avatar = avatar;
  }

  /**
   * Create a LocalUser instance from raw data
   */
  static fromRawWithLocal(userData: Tables<'users'>, avatar?: Blob): LocalUser {
    return new LocalUser(userData, avatar);
  }

  /**
   * Create a LocalUser from an existing User instance
   */
  static fromUser(user: User, avatar?: Blob): LocalUser {
    return new LocalUser({
      id: user.id,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      created_at: user.created_at,
      status: user.status,
      features: user.features,
    }, avatar);
  }
}
