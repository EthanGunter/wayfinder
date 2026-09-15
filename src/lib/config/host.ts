// Centralized host configuration - abstracts deployment platform specifics
// Currently using Cloudflare Workers, but designed to be portable

import { PUBLIC_SITE_URL, PUBLIC_CONVEX_URL } from '$env/static/public';
import { env } from '$env/dynamic/public';

/**
 * Deployment environment types
 * - 'development': Local dev or CI
 * - 'preview': Preview/staging deployments
 * - 'production': Production deployment
 */
export type DeploymentEnv = 'development' | 'preview' | 'production';

// Raw deployment environment (set per environment in wrangler.jsonc vars)
export const deploymentEnv: DeploymentEnv = 
  (env.PUBLIC_DEPLOYMENT_ENV as DeploymentEnv) || 'development';

// Convenient boolean helpers
export const isDev = deploymentEnv === 'development';
export const isPreview = deploymentEnv === 'preview';
export const isProd = deploymentEnv === 'production';

// Centralized URLs
export const SITE_URL = PUBLIC_SITE_URL;
export const CONVEX_URL = PUBLIC_CONVEX_URL;

// Future: Add other host-specific config here as needed
// export const CDN_URL = PUBLIC_CDN_URL;
// export const API_TIMEOUT = isProd ? 30000 : 10000;

