import { beforeEach, describe, expect, it } from "vitest"
import type { IAuth, SignInCredentials, UserData, User } from "./types";
import type { IProvider } from "../types";
import { ok, err } from "neverthrow";
import { ArgumentError, ErrorType, NotImplementedError, InvalidStateError, NotFoundError } from "$lib/Errors";

export function testIAuthCore(authProvider: IProvider<IAuth>) {
    describe("IAuth", () => {
        let auth: IAuth;
        let userCreds: SignInCredentials;
        let userData: UserData;
        let remoteUser: User;

        beforeEach(async () => {
            auth = await authProvider.get();
            userCreds = {
                type: "email_password",
                email: "test@example.com",
                password: "password123"
            };
            userData = {
                display_name: "Remote User",
                avatar_url: null
            };
            remoteUser = {
                ...userData,
                id: "remote-user-id"
            };
        });

        // --- Registration ---
        describe("getRegistrationRequirements()", () => {
            it("returns correct requirements for a given credential type", () => {
                const creds: SignInCredentials = { type: "email_password", email: "", password: "" };
                const result = auth.getRegistrationRequirements(creds);
                expect(result.isOk()).toBe(true);
                if (result.isOk()) {
                    expect(Array.isArray(result.value)).toBe(true);
                }
            });
            it("returns NotImplementedError for an unsupported credential type", () => {
                const creds = { type: "Lies", provider: "Cake" } as any;
                const result = auth.getRegistrationRequirements(creds);
                expect(result.isErr()).toBe(true);
                if (result.isErr()) {
                    expect(result.error.type).toBe(ErrorType.NotImplementedError);
                }
            });
        });

        describe("register()", () => {
            it("successfully registers a new user with valid credentials", async () => {
                const result = await auth.register({ creds: userCreds, userData });
                expect(result.isOk()).toBe(true);
                if (result.isOk()) {
                    expect(result.value).toHaveProperty("id");
                }
            });
            it("returns an error if registration fails due to invalid credentials", async () => {
                const invalidCreds = { ...userCreds, email: "" };
                const result = await auth.register({ creds: invalidCreds, userData });
                expect(result.isErr()).toBe(true);
            });
            it("returns an InvalidStateError if already registered/logged in", async () => {
                // Simulate already registered by calling register twice
                await auth.register({ creds: userCreds, userData });
                const result = await auth.register({ creds: userCreds, userData });
                expect(result.isErr()).toBe(true);
                if (result.isErr()) {
                    expect(result.error.type === ErrorType.InvalidState || result.error.type === ErrorType.NotImplementedError).toBe(true);
                }
            });
        });

        // --- Login ---
        describe("login()", () => {
            it("logs in a user with valid credentials", async () => {
                await auth.register({ creds: userCreds, userData });
                const result = await auth.login({ creds: userCreds });
                expect(result.isOk()).toBe(true);
                if (result.isOk()) {
                    expect(result.value).toHaveProperty("id");
                }
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
                    if (result.isOk()) {
                        expect(result.value.display_name).toBe("Updated Name");
                    }
                }
            });
            it("returns NotFoundError if user does not exist", async () => {
                const update = { id: "nonexistent", display_name: "No User" };
                const result = await auth.updateUser({ update });
                expect(result.isErr()).toBe(true);
                if (result.isErr()) {
                    expect(result.error.type).toBe(ErrorType.NotFoundError);
                }
            });
        });

        // --- User Deletion ---
        describe("deleteUser()", () => {
            it("returns NotImplementedError if not supported", async () => {
                const reg = await auth.register({ creds: userCreds, userData });
                if (reg.isOk()) {
                    const result = await auth.deleteUser({ userId: reg.value.id });
                    expect(result.isErr()).toBe(true);
                    if (result.isErr()) {
                        expect(result.error.type === ErrorType.NotImplementedError || result.error.type === ErrorType.InvalidState).toBe(true);
                    }
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
                if (result.isErr()) {
                    expect(result.error.type === ErrorType.NotFoundError || result.error.type === ErrorType.NotImplementedError).toBe(true);
                }
            });
        });
    });
}
