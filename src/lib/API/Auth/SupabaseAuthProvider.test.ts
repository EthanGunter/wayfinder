import { vi } from "vitest";
import { testIAuthCore } from "./IAuth.shared.test";
import SupabaseAuthProvider from "./SupabaseAuthProvider";

vi.mock('', () => ({
    createClient: (supabaseUrl: string,
        supabaseKey: string,
        options?: any
    ) => {
        console.log("Mocking supabase client", supabaseUrl, supabaseKey, options);
        return {

        }
    }
}));


testIAuthCore(SupabaseAuthProvider);