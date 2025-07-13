import SupabaseAuth from "./SupabaseAuth";
import type { IAuthProvider, LocalUserProxy } from "./types"

let _provider: IAuthProvider | null = null;
let remote = () => {
    if (!_provider) {
        _provider = new SupabaseAuth();
    }
    return _provider;
}

export async function getUser(): Promise<LocalUserProxy|null> {
    let fetched = await remote().getCurrentUser();
    let user: LocalUserProxy;
    if (fetched) {
        // TODO Create anon local user
        user = fetched as any;
        user.isSynced = true;
    } else {
        user = { id: "local-anon", displayName: "", isSynced: false }
        return null;
    }
    return user;
}