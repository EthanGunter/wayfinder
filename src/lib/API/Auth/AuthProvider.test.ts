import { beforeEach, describe, it } from "vitest"
import type { IAuthAPI, IAuthAPIResponseHandler } from "./types";
import { mock, type MockProxy } from 'vitest-mock-extended'
import type { ITaskAPI, ITaskReverter } from "../Tasks";
import type { SyncQueue } from "../SyncQueue";

describe("Unit", () => {
    // Mock the remote IAuthAPI and ITaskAPI for these tests.
    // The provider's behavior changes drastically based on their presence and responses.
    describe("Online", () => {
        let mockAuth: MockProxy<IAuthAPI>;
        let mockAuthQueue: MockProxy<SyncQueue<IAuthAPI, IAuthAPIResponseHandler>>;
        let mockTasks: MockProxy<ITaskAPI>;
        let mockTaskQueue: MockProxy<SyncQueue<ITaskAPI, ITaskReverter>>;
        
        beforeEach(() => {
            mockAuth = mock<IAuthAPI>();
            mockAuthQueue = mock<SyncQueue<IAuthAPI, IAuthAPIResponseHandler>>();
            mockTasks = mock<ITaskAPI>();
            mockTaskQueue = mock<SyncQueue<ITaskAPI, ITaskReverter>>();
        })

    })

    describe("Delayed Connection (offline)", () => {
        describe("IAuthCore", () => {
            // --- Sign Up ---
            describe("signUp()", () => {
                it("should optimistically create a user locally and then call remote `signUp`");
                it("should successfully sync the local user with data returned from the remote `signUp`");
                it("should call `undoSignUp` and remove the local user if remote `signUp` fails");
                it("should not attempt a remote call if local user creation fails validation");
                it("should return an error if `signUp` is called while already signed in");
            });

            // --- Sign In ---
            describe("signIn()", () => {
                // Note: signIn is less "optimistic" as it requires remote validation to succeed.
                it("should call remote `signIn` and update local state upon success");
                it("should not change local auth state if remote `signIn` fails due to bad credentials");
                it("should fail immediately if called while offline, as it requires remote validation");
                it("should switch the active local user if signing in as a different, existing user");
            });

            // --- Sign Out ---
            describe("signOut()", () => {
                it("should clear the local user session optimistically and then call remote `signOut`");
                it("should still clear the local user session even if the remote `signOut` fails (e.g., offline)");
                // This is a key edge case: if the server says "no, you can't sign out", do we log the user back in locally?
                // Based on your logic, the "undo" should be called.
                it("should call `undoSignOut` and restore the local session if the remote `signOut` fails for a critical reason");
            });

            // --- User Update ---
            describe("updateUser()", () => {
                it("should optimistically update user data locally and then call remote `updateUser`");
                it("should call `undoUpdateUser` and revert local data if remote `updateUser` fails");
                it("should handle updating the user's ID locally if the remote returns a new ID");
            });

            // --- User Deletion ---
            describe("deleteUser()", () => {
                it("should optimistically delete the user locally and then call remote `deleteUser`");
                it("should call `undoDeleteUser` and restore the user locally if remote `deleteUser` fails");
            });

            // --- Get Current User ---
            describe("getCurrentUser()", () => {
                it("should return the currently signed-in user from local state");
                it("should return an InvalidStateError if no user is currently signed in");
            });
        });
    })

    describe("Failed Connection", () => {

    })
});

describe("IAuthCore", () => {
    // --- Sign Up ---
    describe("signUp()", () => {
        it("should optimistically create a user locally and then call remote `signUp`");
        it("should successfully sync the local user with data returned from the remote `signUp`");
        it("should call `undoSignUp` and remove the local user if remote `signUp` fails");
        it("should not attempt a remote call if local user creation fails validation");
        it("should return an error if `signUp` is called while already signed in");
    });

    // --- Sign In ---
    describe("signIn()", () => {
        // Note: signIn is less "optimistic" as it requires remote validation to succeed.
        it("should call remote `signIn` and update local state upon success");
        it("should not change local auth state if remote `signIn` fails due to bad credentials");
        it("should fail immediately if called while offline, as it requires remote validation");
        it("should switch the active local user if signing in as a different, existing user");
    });

    // --- Sign Out ---
    describe("signOut()", () => {
        it("should clear the local user session optimistically and then call remote `signOut`");
        it("should still clear the local user session even if the remote `signOut` fails (e.g., offline)");
        // This is a key edge case: if the server says "no, you can't sign out", do we log the user back in locally?
        // Based on your logic, the "undo" should be called.
        it("should call `undoSignOut` and restore the local session if the remote `signOut` fails for a critical reason");
    });

    // --- User Update ---
    describe("updateUser()", () => {
        it("should optimistically update user data locally and then call remote `updateUser`");
        it("should call `undoUpdateUser` and revert local data if remote `updateUser` fails");
        it("should handle updating the user's ID locally if the remote returns a new ID");
    });

    // --- User Deletion ---
    describe("deleteUser()", () => {
        it("should optimistically delete the user locally and then call remote `deleteUser`");
        it("should call `undoDeleteUser` and restore the user locally if remote `deleteUser` fails");
    });

    // --- Get Current User ---
    describe("getCurrentUser()", () => {
        it("should return the currently signed-in user from local state");
        it("should return an InvalidStateError if no user is currently signed in");
    });
});

describe("Local-Only User Management (ILocalAuthFunctions)", () => {
    it("should list all user profiles stored locally with `listUsers()`");
    it("should switch the active user context with `switchUser(userId)`");
    it("should return an error if `switchUser(userId)` is called with a non-existent user ID");
    it("should retrieve the most recently active user with `getMostRecentUser()`");
    it("should create a new anonymous user with `activateNewAnonymousUser()` if none exists");
    it("should return the existing anonymous user if `activateNewAnonymousUser()` is called again");
    it("should retrieve the anonymous user with `getAnonymousUser()`");
});

// Tests for the migration flow.
describe("Migration Flow (IMigrationAPI)", () => {
    describe("getMigrationRequirements()", () => {
        it("should return correct requirements for a given credential type");
        it("should return NotImplementedError for an unsupported credential type");
    });

    describe("migrate()", () => {
        it("should successfully migrate an anonymous user to a permanent user");
        // The remote ITaskAPI is passed here, so we need to test its usage.
        it("should pass the provided task provider to the remote migration service");
        it("should call `undoMigrate` if the remote migration fails");
        it("should return InvalidStateError if trying to migrate a non-migratable user (e.g., already signed in)");
    });
});

// Final edge cases and cleanup.
describe("General Edge Cases", () => {
    it("should handle the `undo` function itself failing gracefully (e.g., log a critical error)");
    it("should correctly handle being closed while a remote operation is in-flight");
});