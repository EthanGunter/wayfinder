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
const resend = new Resend(components.resend);


export const createAuth = (
  ctx: GenericCtx<DataModel>,
  { optionsOnly } = { optionsOnly: false },
) => {
  return betterAuth({
    // disable logging when createAuth is called just to generate options.
    // this is not required, but there's a lot of noise in logs without it.
    logger: {
      disabled: false,
    },
    baseURL: process.env.PUBLIC_SITE_URL,
    trustedOrigins: [process.env.PUBLIC_SITE_URL!],
    database: authComponent.adapter(ctx),
    // Configure simple, non-verified email/password to get started
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      sendResetPassword: async ({ user, url }, request) => {
        await resend.sendEmail(requireActionCtx(ctx), {
          from: "",
          to: user.email,
          subject: "Reset your password",
          html: `Click here to reset your password: <a href="${url}">${url}</a>`,
        });
      },
      onPasswordReset: async ({ user }, request) => {
        console.log('Password reset successful', user);
      },
    },
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
