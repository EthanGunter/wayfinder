/** Host configuration: deployment environment detection and URL management */
export type { DeploymentEnv } from './host';
export { deploymentEnv, isDev, isPreview, isProd, SITE_URL, CONVEX_URL } from './host';

/** User settings system with schema, types, and reactive stores */
export * from './user-settings';
