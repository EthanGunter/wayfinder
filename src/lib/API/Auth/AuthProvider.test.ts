import { beforeEach, describe, it, test } from "vitest"
import type { IAuthAPI, IAuthAPIResponseHandler, SignInCredentials } from "./types";
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
    describe("register()", () => {
        it("should optimistically create a user locally and then call remote `register`");
        it("should successfully sync the local user with data returned from the remote `register`");
        it("should remove the local user if remote `register` fails");
        it("should not attempt a remote call if local user creation fails validation");
        it("should return an InvalidStateError if `register` is called while already logged in");
    });

    // --- Sign In ---
    describe("login()", () => {
        /* TODO SECURITY CONCERN: we might want to provide a user setting that REQUIRES online authentication before allowing access to the content in the app */
        it("should optimistically login the user if there is a local representation");
        it("should logout the current user if remote `login` fails and current user was the one optimistically logged in");
        /* END SECURITY CONCERN */
        it("should not return until the server responds if there is no local representation");
        it("should `logout` the active local user if logging in as a different, existing user");
        // TODO So we can notify the user, and offer for them to create a local account (¿they can merge accounts later?)
        it("should fail with NotFoundError if we're offline and there's no local account");
    });

    // --- Sign Out ---
    describe("logout()", () => {
        it("should call remote.logout() and cause getActiveUser() to return null");
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
        it("should cause getActiveUser() to return null if the active user was deleted");
    });

    // --- Get Current User ---
    describe("getActiveUser()", () => {
        it("should return the currently logged-in user from local state");
        it("should return an InvalidStateError if no user is currently logged in");
    });
});

describe("ILocalAuth", () => {
    describe("updateUserId()", () => {
        it("should put the old user in the local data environment, and delete the old one");
        it("should return a NotFoundError if the oldId cannot be found");
    });
    describe("getActiveUser()", () => {
        it("should retrieve the most recently logged in user");
    });
    describe("listUsers()", () => {
        it("should list all user profiles stored locally with `listUsers()`");
    });
    describe("switchUser()", () => {
        it("should switch the active user context with `switchUser(userId)`");
        it("should return an error if `switchUser(userId)` is called with a non-existent user ID");
    });
    describe("getDefaultUser()", () => {
        it("should create and return an anonymous user if there are no users");
        it("should return a user if there is only one (and they are not security protected)");
        it("should throw a InvalidStateError if there are non-anonymous users");
    });
});

// Tests for the migration flow.
describe("IMigrator", () => {
    describe("getMigrationRequirements()", () => {
        describe("should return correct requirements for a given credential type", () => {
            const email_password: SignInCredentials = { type: "email_password", email: "", password: "" } as SignInCredentials;
            test(`${email_password.type} returns ${Object.getOwnPropertyNames(email_password).join(", ")}`);
        });
        it("should return NotImplementedError for an unsupported credential type");
    });

    describe("migrate()", () => {
        it("should successfully migrate an anonymous user to a remote user");
        it("should pass the provided task provider to the remote migration service");
        it("should undo the local changes if the remote migration fails");
        it("should return InvalidStateError if trying to migrate a user that's already migrated");
    });
});

// Final edge cases and cleanup.
describe("General Edge Cases", () => {
    it("should handle the `responseHandler` functions itself failing gracefully (e.g., log a critical error)");
    it("should correctly handle being closed while a remote operation is in-flight");
});