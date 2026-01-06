// Centralized host configuration - abstracts deployment platform specifics
// Currently using Vercel, but designed to be portable

import { PUBLIC_SITE_URL, PUBLIC_CONVEX_URL } from '$env/static/public';
import { env } from '$env/dynamic/public';

/**
 * Deployment environment types
 * - 'development': Local dev or CI
 * - 'preview': Preview/staging deployments
 * - 'production': Production deployment
 */
export type DeploymentEnv = 'development' | 'preview' | 'production';

// Raw deployment environment (maps to Vercel's VERCEL_ENV)
export const deploymentEnv: DeploymentEnv = 
  (env.PUBLIC_DEPLOYMENT_ENV as DeploymentEnv) || 'development';

// Convenient boolean helpers
export const isDev = deploymentEnv === 'development';
export const isPreview = deploymentEnv === 'preview';
export const isProd = deploymentEnv === 'production';

// Centralized URLs
export const SITE_URL = PUBLIC_SITE_URL;
export const CONVEX_URL = PUBLIC_CONVEX_URL;

