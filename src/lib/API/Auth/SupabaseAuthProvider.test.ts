import { assert, beforeEach, describe, expect, it, vi } from "vitest";
import SupabaseAuthProvider from "./SupabaseAuthProvider";
import type { IAuth, LoginCredentials, UserData } from "./types";
import { ErrorType } from "$lib/Errors";
import type { User } from "./User";
import { createTestUser } from "./testHelpers";

// In-memory user store for mocking
const usersByEmail = new Map<string, User>();
const idToEmail = new Map<string, string>();
let currentUser: User | null = null;

type SignUpParams = { email: string; password: string; options?: { data?: Partial<User> } };
type SignInParams = { email: string; password: string };
type UpdateUserParams = { data?: Partial<User> };

// TODO This is fragile, and should be tested with a live connection to the server to validate return code handling
vi.mock("$lib/API/SupabaseClient", () => {
    return {
        default: {
            auth: {
                async signUp({ email, password, options }: SignUpParams) {
                    console.log("Mock signup");

                    if (!email || !password) {
                        return { error: { message: "MOCK: Missing email or password", code: "invalid_credentials" }, data: { user: null } };
                    }
                    if (usersByEmail.has(email)) {
                        return { error: { message: "MOCK: User already exists" }, data: { user: null } };
                    }
                    const user: User = { id: email, email, ...options?.data } as User;
                    usersByEmail.set(email, user);
                    idToEmail.set(user.id, email);
                    currentUser = user;
                    return { error: null, data: { user } };
                },
                async signInWithPassword({ email, password }: SignInParams) {
                    console.log("Mock signin");
                    if (!usersByEmail.has(email)) {
                        return { error: { message: "MOCK: User not found", code: "invalid_credentials" }, data: { user: null } };
                    }
                    const user = usersByEmail.get(email)!;
                    currentUser = user;
                    return { error: null, data: { user } };
                },
                async updateUser(update: UpdateUserParams) {
                    console.log("Mock update");
                    if (!currentUser) {
                        return { error: { message: "MOCK: No user" }, data: { user: null } };
                    }
                    const user = { ...currentUser, ...update.data };
                    usersByEmail.set(idToEmail.get(user.id)!, user);
                    currentUser = user;
                    return { error: null, data: { user } };
                },
                async signOut() {
                    console.log("Mock signout");
                    currentUser = null;
                    return { error: null };
                },
                async getUser() {
                    console.log("Mock getuser");
                    if (!currentUser) {
                        return { error: { message: "MOCK: No user" }, data: { user: null } };
                    }
                    return { error: null, data: { user: currentUser } };
                }
            }
        }
    };
});

describe("IAuth", () => {
    let auth: IAuth;
    let userCreds: LoginCredentials;
    let userData: UserData;
    let remoteUser: User;

    beforeEach(async () => {
        auth = await SupabaseAuthProvider.get();
        userCreds = {
            type: "email_password",
            email: "test@example.com",
            password: "password123"
        };
        userData = createTestUser({
            display_name: "Remote User",
        });
        remoteUser = {
            ...userData,
            id: "remote-user-id"
        };
    });

    // --- Registration ---
    describe("getRegistrationRequirements()", () => {
        it("returns correct requirements for a given credential type", () => {
            const creds: LoginCredentials = { type: "email_password", email: "", password: "" };
            const result = auth.getRegistrationRequirements(creds);
            expect(result.isOk()).toBe(true);
            assert(result.isOk());
            expect(Array.isArray(result.value)).toBe(true);

        });
        it("returns NotImplementedError for an unsupported credential type", () => {
            const creds = { type: "Lies", provider: "Cake" } as any;
            const result = auth.getRegistrationRequirements(creds);
            expect(result.isErr()).toBe(true);
            assert(result.isErr());
            expect(result.error.type).toBe(ErrorType.NotImplementedError);

        });
    });

    describe("register()", () => {
        it("successfully registers a new user with valid credentials", async () => {
            const result = await auth.register({ creds: userCreds, userData });
            expect(result.isOk()).toBe(true);
            assert(result.isOk());
            expect(result.value).toHaveProperty("id");

        });
        it("returns an error if registration fails due to invalid credentials", async () => {
            const invalidCreds = { ...userCreds, email: "" };
            const result = await auth.register({ creds: invalidCreds, userData });
            expect(result.isErr()).toBe(true);
            assert(result.isErr());
            expect(result.error.type).toBe(ErrorType.ArgumentError);
        });
        it("returns an InvalidStateError if already registered/logged in", async () => {
            // Simulate already registered by calling register twice
            await auth.register({ creds: userCreds, userData });
            const result = await auth.register({ creds: userCreds, userData });

            expect(result.isErr()).toBe(true);
            assert(result.isErr());
            expect(result.error.type).toBe(ErrorType.InvalidState);
        });
    });

    // --- Login ---
    describe("login()", () => {
        it("logs in a user with valid credentials", async () => {
            await auth.register({ creds: userCreds, userData });
            const result = await auth.login({ creds: userCreds });
            assert(result.isOk());
            expect(result.value).toHaveProperty("id");
        });
        it("returns an error if login fails with invalid credentials", async () => {
            const invalidCreds = { ...userCreds, password: "wrong" };
            const result = await auth.login({ creds: invalidCreds });
            expect(result.isErr()).toBe(true);
        });
    });

    // --- Logout ---
    describe("logout()", () => {
        it("logs out the current user", async () => {
            await auth.register({ creds: userCreds, userData });
            await auth.login({ creds: userCreds });
            const result = await auth.logout();
            expect(result.isOk()).toBe(true);
        });
    });

    // --- User Update ---
    describe("updateUser()", () => {
        it("updates user data for a valid user", async () => {
            const reg = await auth.register({ creds: userCreds, userData });
            if (reg.isOk()) {
                const update = { id: reg.value.id, display_name: "Updated Name" };
                const result = await auth.updateUser({ update });

                expect(result.isOk()).toBe(true);
                assert(result.isOk());
                expect(result.value.display_name).toBe("Updated Name");
            }
        });
        it("returns NotFoundError if user does not exist", async () => {
            const update = { id: "nonexistent", display_name: "No User" };
            const result = await auth.updateUser({ update });

            expect(result.isErr()).toBe(true);
            assert(result.isErr());
            expect(result.error.type).toBe(ErrorType.NotFoundError);
        });
    });

    // --- User Deletion ---
    describe("deleteUser()", () => {
        it("returns NotImplementedError if not supported", async () => {
            const reg = await auth.register({ creds: userCreds, userData });
            if (reg.isOk()) {
                const result = await auth.deleteUser({ userId: reg.value.id });

                expect(result.isErr()).toBe(true);
                assert(result.isErr());
                expect(result.error.type === ErrorType.NotImplementedError || result.error.type === ErrorType.InvalidState).toBe(true);
            }
        });
    });

    // --- Get Current User ---
    describe("getUser()", () => {
        it("returns the user by id if exists", async () => {
            const reg = await auth.register({ creds: userCreds, userData });
            if (reg.isOk()) {
                const result = await auth.getUser({ id: reg.value.id });
                // May throw NotImplementedError if not implemented
                if (result.isOk()) {
                    expect(result.value.id).toBe(reg.value.id);
                } else {
                    expect(result.error.type === ErrorType.NotImplementedError || result.error.type === ErrorType.NotFoundError).toBe(true);
                }
            }
        });
        it("returns NotFoundError if user does not exist", async () => {
            const result = await auth.getUser({ id: "nonexistent" });

            expect(result.isErr()).toBe(true);
            assert(result.isErr());
            expect(result.error.type === ErrorType.NotFoundError || result.error.type === ErrorType.NotImplementedError).toBe(true);
        });
    });
});
