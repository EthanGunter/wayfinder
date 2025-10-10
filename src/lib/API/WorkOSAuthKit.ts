import { createClient } from "@workos-inc/authkit-js";
import { PUBLIC_WORKOS_CLIENT_ID, PUBLIC_CONVEX_API_URL } from "$env/static/public";


export const authkit = await createClient(
	PUBLIC_WORKOS_CLIENT_ID,
	{
		redirectUri: "https://pastel-frog-838.convex.site/callback/workos",
	}
);

console.log(PUBLIC_WORKOS_CLIENT_ID, PUBLIC_CONVEX_API_URL + '/callback/workos');
