import { beforeEach, describe, it } from "vitest"
import type { IAuthAPI, IAuthAPIResponseHandler } from "./types";
import { mock, type MockProxy } from 'vitest-mock-extended'
import type { ITaskAPI, ITaskReverter } from "../Tasks";
import type { SyncQueue } from "../SyncQueue";

// Mock the remote IAuthAPI and ITaskAPI for these tests.
// The provider's behavior changes drastically based on their presence and responses.
describe("IAuthCore", () => {
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

    // --- Sign Up ---
    describe("signUp()", () => {
        it("should optimistically create a user locally and then call remote `signUp`");
        it("should successfully sync the local user with data returned from the remote `signUp`");
        it("should remove the local user if remote `signUp` fails");
        it("should not attempt a remote call if local user creation fails validation");
        it("should return an InvalidStateError if `signUp` is called while already signed in");
    });

    // --- Sign In ---
    describe("signIn()", () => {
        /* TODO SECURITY CONCERN: we might want to provide a user setting that REQUIRES online authentication before allowing access to the content in the app */
        it("should optimistically sign in the user if there is a local representation");
        it("should signOut the current user if remote `signIn` fails and current user was the one optimistically signed in");
        /* END SECURITY CONCERN */
        it("should not return until the server responds if there is no local representation");
        // TODO So we can notify the user, and offer for them to create a local account (¿they can sync later?)
        it("should fail with NotFoundError if we're offline and there's no local account");
        it("should `signOut` the active local user if signing in as a different, existing user");
    });

    // --- Sign Out ---
    describe("signOut()", () => {
        it("should optimistically clear the local user session and then call remote `signOut`");
    });

    // --- User Update ---
    describe("updateUser()", () => {
        it("should optimistically update user data locally and then call remote `updateUser`");
        it("should handle updating the user's ID locally if the remote returns a new ID");
        it("should revert local data if remote `updateUser` fails");
    });

    // --- User Deletion ---
    describe("deleteUser()", () => {
        it("should optimistically delete the user locally and then call remote `deleteUser`");
        it("should restore the user locally if remote `deleteUser` fails");
    });

    // --- Get Current User ---
    describe("getCurrentUser()", () => {
        it("should return the currently signed-in user from local state");
        it("should return an InvalidStateError if no user is currently signed in");
    });
});

describe("ILocalAuth", () => {
    describe("createUser()", () => {

    });
    describe("getMostRecentUser()", () => {
        it("should retrieve the most recently active user with `getMostRecentUser()`");
    });
    describe("updateUser()", () => {

    });
    describe("listUsers()", () => {
        it("should list all user profiles stored locally with `listUsers()`");
    });
    describe("switchUser()", () => {
        it("should switch the active user context with `switchUser(userId)`");
        it("should return an error if `switchUser(userId)` is called with a non-existent user ID");
    });
    describe("activateNewAnonymousUser()", () => {
        it("should create a new anonymous user with `activateNewAnonymousUser()` if none exists");
        it("should return the existing anonymous user if `activateNewAnonymousUser()` is called again");
    });
    describe("getAnonymousUser()", () => {
        it("should retrieve the anonymous user with `getAnonymousUser()`");
    });
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