import LocalAuth from "./LocalAuth";
import SupabaseAuth from "./SupabaseAuth";
import type { IAuthProvider, LocalUserProxy } from "./types"

let authProvider: IAuthProvider;
authProvider = new SupabaseAuth();
export default authProvider;

export async function getUser(): Promise<LocalUserProxy | null> {
    let fetched = await authProvider.getCurrentUser();
    let user: LocalUserProxy;
    if (fetched) {
        // TODO Create anon local user
        user = fetched as any;
        user.isSynced = true;
    } else {
        user = { id: "local-anon", displayName: "", isSynced: false }
    }
    return user;
}