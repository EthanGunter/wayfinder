import { createClient } from "@workos-inc/authkit-js";
import { PUBLIC_WORKOS_CLIENT_ID, PUBLIC_WORKOS_REDIRECT_URI } from "$env/static/public";

export const authkit = await createClient(
	PUBLIC_WORKOS_CLIENT_ID,
	{
		redirectUri: PUBLIC_WORKOS_REDIRECT_URI,
	}
);
