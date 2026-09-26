import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { requireActionCtx } from "@convex-dev/better-auth/utils";
import { Resend } from "@convex-dev/resend";
import { multiSession } from "better-auth/plugins";
import { components } from "./_generated/api";
import { type DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { betterAuth } from "better-auth";


// The component client has methods needed for integrating Convex with Better Auth,
// as well as helper methods for general use.
export const authComponent = createClient<DataModel>(components.betterAuth);
const resend = new Resend(components.resend, {
  testMode: process.env.NODE_ENV !== 'production'
});


export const createAuth = (
  ctx: GenericCtx<DataModel>,
) => {
  return betterAuth({
    // disable logging when createAuth is called just to generate options.
    // this is not required, but there's a lot of noise in logs without it.
    logger: {
      disabled: false,
    },
    // Note: Convex backend uses process.env directly (not our host config)
    // This maps to host.SITE_URL on the frontend
    baseURL: process.env.PUBLIC_SITE_URL,
    trustedOrigins: [
      process.env.PUBLIC_SITE_URL!,
      // Optional comma-separated extras, e.g. the upstream origin a dev preview proxy rewrites requests to
      ...(process.env.AUTH_EXTRA_TRUSTED_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean) ?? []),
    ],
    database: authComponent.adapter(ctx),
    // Configure simple, non-verified email/password to get started
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      sendResetPassword: async ({ user, url }) => {
        // Extract token from Better Auth's generated URL
        // URL format: {baseURL}/api/auth/reset-password/{token}?callbackURL=...
        const urlPath = new URL(url).pathname;
        const token = urlPath.split('/').pop();

        // Build direct frontend URL
        const resetUrl = new URL("reset-password", process.env.PUBLIC_SITE_URL!);
        resetUrl.searchParams.set("token", token!);

        await resend.sendEmail(requireActionCtx(ctx), {
          from: "Wayfinder Support <support@wayfinder.ethangunter.com>",
          to: user.email,
          subject: "Reset your password",
          html: `<a href="${resetUrl}">Click here to reset your password</a>`,
        });
      },
      onPasswordReset: async ({ user }) => {
        console.log('Password reset successful', user);
      },
    },
    user: { deleteUser: { enabled: true } },
    // Register social providers used by the client
    // TODO:TEMP social auth disabled until we figure out why Vercel blocks it...
    /* socialProviders: {
      github: {
        clientId: process.env.AUTH_GITHUB_CLIENT_ID!,
        clientSecret: process.env.AUTH_GITHUB_SECRET!,
      },
    }, */
    plugins: [
      // The Convex plugin is required for Convex compatibility
      convex(),
      multiSession(),
    ],
  });
};

// Example function for getting the current user
// Feel free to edit, omit, etc.
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return authComponent.getAuthUser(ctx);
  },
});
