import type { IAuthProvider, SignInCredentials, SignOutOptions, SignUpDetails, UnsubscribeFn, User } from "./types";

export default class LocalAuth implements IAuthProvider {
    getCurrentUser(): Promise<User | null> {
        return Promise.resolve(null);
    }
    signIn(credentials: SignInCredentials): Promise<void> {
        throw new Error("Method not implemented.");
    }
    signUp(details: SignUpDetails): Promise<void> {
        throw new Error("Method not implemented.");
    }
    signOut(opt: SignOutOptions): Promise<void> {
        throw new Error("Method not implemented.");
    }
    onAuthStateChanged(callback: any): UnsubscribeFn {
        return () => { };
        // throw new Error("Method not implemented.");
    }

}