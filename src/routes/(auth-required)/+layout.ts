import { invalidate } from '$app/navigation';
import authProvider from '$lib/API/Auth';
import type { LayoutLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: LayoutLoad = async ({ parent, url }) => {
    const user = await authProvider.getCurrentUser();

    if (!user) {
        // Not authenticated, redirect to login with original URL as param
        console.log("No user logged in");
        throw redirect(302, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
    }

    // If authenticated, proceed as normal
    return { user };
};