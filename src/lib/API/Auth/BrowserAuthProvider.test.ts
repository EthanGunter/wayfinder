import 'fake-indexeddb/auto'
import { beforeAll, describe, expect, afterEach, beforeEach, it, test } from "vitest"
import BrowserAuthProvider from './BrowserAuthProvider';
import type { AuthSyncQueue, IAuth, IAuthLocalFunctions, ILocalAuth, SignInCredentials, LocalUser, User, UserData } from "./types";
import { mock, type MockProxy } from 'vitest-mock-extended'
import { type TaskSyncQueue, type ITaskAPI, type ILocalTasks, type ILocalTaskProvider, Task } from "../Tasks";
import { v4 } from "uuid";
import { dbPromise, type LocalDB } from '../localDB';
import { ArgumentError, ErrorType, NotImplementedError } from '$lib/Errors';
import { err, ok } from 'neverthrow';
import { okBatch } from '../types';

function assert(
    condition: unknown,
    message?: string
): asserts condition {
    if (!condition) {
        throw new Error(message ?? "Assertion failed");
    }
}

let localDB: LocalDB;

let localAuth: ILocalAuth;
let syncQueue: AuthSyncQueue | null;
let mockRemoteAuth: MockProxy<IAuth>;
let mockTasks: MockProxy<ILocalTasks>;
let mockTasksSyncQueue: MockProxy<TaskSyncQueue>;

let localUser1: LocalUser;
let localUser1Data: UserData;
let userCreds: SignInCredentials;
let remoteUser: User;

// TODO This doesn't test the cases where there's missing API providers
// Mock the remote IAuth and ITaskAPI for these tests.
// The provider's behavior changes drastically based on their presence and responses.
describe("IAuth", () => {
    beforeAll(async () => {
        localDB = await dbPromise;
    })

    beforeEach(async () => {
        // Auth provider initializes with a default anon user if there's not already a user
        localDB.clear('appdata');
        localDB.clear('users');
        localDB.clear('tasks');

        mockRemoteAuth = mock<IAuth>();
        mockTasks = mock<ILocalTasks>();
        mockTasksSyncQueue = mock<TaskSyncQueue>();
        let mockAuthProvider = { get: () => Promise.resolve(mockRemoteAuth) }
        let mockTaskProvider = { get: () => Promise.resolve(mockTasks), getSyncQueue: () => mockTasksSyncQueue }
        // TODO We now need a way to mock the Browser task provider, since it's no longer dependency injected
        localAuth = await BrowserAuthProvider.get(mockAuthProvider, mockTaskProvider);
        syncQueue = BrowserAuthProvider.getSyncQueue();

        localUser1Data = {
            // id: v4(),
            display_name: "User One",
            avatar_url: null,
        };
        localUser1 = { ...localUser1Data, id: v4(), last_active: new Date(), auth_provider: 'local' };

        userCreds = {
            type: "email_password",
            email: "test@example.com",
            password: "password123"
        };

        remoteUser = {
            ...localUser1Data,
            id: v4(),
        };
    });

    // --- Registration ---
    describe("getRegistrationRequirements()", () => {
        describe("returns correct requirements for a given credential type", () => {
            const email_password: SignInCredentials = { type: "email_password", email: "", password: "" } as SignInCredentials;
            test(`${email_password.type} returns ${Object.getOwnPropertyNames(email_password).join(", ")}`, async () => {
                // Arrange
                const creds: SignInCredentials = { type: "email_password", email: "", password: "" };
                const expectedReqs = [
                    { target: 0, message: "Email required" },
                    { target: 1, message: "Password required" }
                ];
                mockRemoteAuth.getRegistrationRequirements.mockReturnValueOnce(ok(expectedReqs));

                // Act
                const result = mockRemoteAuth.getRegistrationRequirements(creds);

                // Assert
                assert(result.isOk());
                expect(result.value).toEqual(expectedReqs);
            });
            it("returns NotImplementedError for an unsupported credential type", async () => {
                // Arrange
                const creds = { type: "Lies", provider: "Cake" } as any;
                mockRemoteAuth.getRegistrationRequirements.mockReturnValueOnce(err(new NotImplementedError("lies")));

                // Act
                const result = mockRemoteAuth.getRegistrationRequirements(creds);

                // Assert
                assert(result.isErr());
                expect(result.error.type).toBe(ErrorType.NotImplementedError);
            });
        });
    });

    // --- Log In ---
    // TODO local login isn't implemented yet, so it will be difficult to validate the quality of these tests until then
    describe.todo("login()", () => {
        /* TODO SECURITY CONCERN: we might want to provide a user setting that REQUIRES online authentication before allowing access to the content in the app */

        it.todo("optimistically logs in the user in if the local authentication succeeds", async () => {
            // Arrange: create a local user
            await localAuth.createUser({ user: { ...localUser1, ...remoteUser } });
            await localAuth.logout();
            mockRemoteAuth.login.mockResolvedValueOnce(ok({ ...remoteUser }));

            // Act: call login
            const loginPromise = localAuth.login({ creds: userCreds });

            // Assert: user should be set as active immediately
            const activeUser = await localAuth.getActiveUser();
            expect(activeUser).not.toBeNull();
            expect(activeUser!.id).toBe(remoteUser.id);

            // Simulate the sync queue
            await syncQueue!.process();

            // User should stay logged in
            const activeUser2 = await localAuth.getActiveUser();
            expect(activeUser2).not.toBeNull();
            expect(activeUser2!.id).toBe(remoteUser.id);
        });
        it("logs out the current user if remote `login` fails and current user was the one optimistically logged in", async () => {
            // Arrange: create a local user and optimistically login
            await localAuth.createUser({ user: { ...localUser1, ...remoteUser } });
            mockRemoteAuth.login.mockResolvedValueOnce(err(new NotImplementedError("login")));

            // Act: call login
            await localAuth.login({ creds: userCreds });

            // Simulate the sync queue (which fails and should logout)
            await syncQueue!.process();

            // Assert: user should be logged out
            const activeUser = await localAuth.getActiveUser();
            expect(activeUser).toBeNull();
        });
        /* END SECURITY CONCERN */
        it("does not return until the server responds if there is no local representation", async () => {
            // Arrange: no local user exists
            mockRemoteAuth.login.mockResolvedValueOnce(ok({ ...remoteUser }));

            // Act: call login and capture the promise
            let resolved = false;
            const loginPromise = localAuth.login({ creds: userCreds }).then(() => { resolved = true; });

            // Assert: promise should not resolve before sync queue
            await Promise.resolve(); // allow microtasks to run
            expect(resolved).toBe(false);

            // Simulate the sync queue (triggers remote call)
            await syncQueue!.process();

            // Now the promise should resolve
            await loginPromise;
            expect(resolved).toBe(true);
        });
        it("logs out the active local user if logging in as a different, existing user", async () => {
            // Arrange: create two users
            const userA = { ...localUser1, id: v4(), display_name: "UserA" };
            const userB = { ...localUser1, id: v4(), display_name: "UserB" };
            await localAuth.createUser({ user: userA });
            await localAuth.createUser({ user: userB });
            await localAuth.switchUser(userA.id);
            mockRemoteAuth.login.mockResolvedValueOnce(ok({ ...userB }));

            // Act: login as userB
            await localAuth.login({ creds: userCreds });

            // Assert: userA should be logged out, userB should be active
            const activeUser = await localAuth.getActiveUser();
            expect(activeUser).not.toBeNull();
            expect(activeUser!.id).toBe(userB.id);
        });
        // TODO So we can notify the user, and offer for them to create a local account (¿they can merge accounts later?)
        it.todo("fails with NotFoundError if we're offline and there's no local account");
    });

    // --- Sign Out ---
    describe("logout()", () => {
        it("calls remote.logout() and cause getActiveUser() to return null", async () => {
            // Arrange:
            await localAuth.createUser({ user: localUser1 });
            await localAuth.switchUser(localUser1.id);

            // Act:
            await localAuth.logout();

            // Assert: Remote.logout() to be called and Active user to be null
            expect(mockRemoteAuth.logout).toBeCalled();

            const user = await localAuth.getActiveUser();
            expect(user).toBeNull();
        });
    });

    // --- User Update ---
    describe("updateUser()", () => {
        it("optimistically updates user data locally and then call remote `updateUser`", async () => {
            // Arrange: create and register a user
            localAuth.createUser({ user: localUser1 });
            const newDisplayName = "Updated Name";
            mockRemoteAuth.updateUser.mockResolvedValueOnce(ok({ ...localUser1, display_name: newDisplayName }));

            // Act: call updateUser
            await localAuth.updateUser({ update: { id: localUser1.id, display_name: newDisplayName } });

            // Assert: local user should be updated immediately
            const userRes = await localAuth.getUser({ id: localUser1.id });
            assert(userRes.isOk());
            expect(userRes.value).toBeDefined();
            const user = userRes.value;
            expect(user.display_name).toBe(newDisplayName);

            // Simulate the remote process
            await syncQueue!.process();

            expect(mockRemoteAuth.updateUser).toHaveBeenCalledWith({ update: { id: localUser1.id, display_name: newDisplayName } });
        });
        it("reverts local data if remote `updateUser` fails", async () => {
            // Arrange: create and register a user
            await localAuth.createUser({ user: localUser1 });
            const id = localUser1.id;
            const originalDisplayName = localUser1.display_name;
            const newDisplayName = "Temp Name";
            // Simulate remote updateUser failure
            mockRemoteAuth.updateUser.mockResolvedValueOnce(err(new NotImplementedError("idk")));

            // Act: update the user
            await localAuth.updateUser({ update: { id, display_name: newDisplayName } });

            // Confirm local update
            let userRes = await localAuth.getUser({ id });
            assert(userRes.isOk());
            expect(userRes.value.display_name).toBe(newDisplayName);

            // Simulate the remote process (which fails and should revert)
            await syncQueue!.process();

            // Assert: local user should be reverted to original
            userRes = await localAuth.getUser({ id });
            assert(userRes.isOk());
            expect(userRes.value.display_name).toBe(originalDisplayName);
        });
    });

    // --- User Deletion ---
    describe("deleteUser()", () => {
        it("optimistically deletes the user locally and then call remote `deleteUser`", async () => {
            // Arrange: create and activate a user
            await localAuth.createUser({ user: localUser1 });
            await localAuth.switchUser(localUser1.id);
            mockRemoteAuth.deleteUser.mockResolvedValueOnce(ok(undefined));

            // Act: delete user
            const result = await localAuth.deleteUser({ userId: localUser1.id });

            // Assert: user should be optimistically removed locally
            const userRes = await localAuth.getUser({ id: localUser1.id });
            assert(userRes.isErr());
            expect(userRes.error.type).toBe(ErrorType.NotFoundError);

            // Act: Simulate the sync queue
            await syncQueue!.process();

            // Assert: Remote.delete() should be called
            expect(mockRemoteAuth.deleteUser).toHaveBeenCalledWith({ userId: localUser1.id });
        });
        it("restores the user locally if remote `deleteUser` fails", async () => {
            // Arrange: create and activate a user
            await localAuth.createUser({ user: localUser1 });
            await localAuth.switchUser(localUser1.id);
            mockRemoteAuth.deleteUser.mockResolvedValueOnce(err(new NotImplementedError("deleteUser")));

            // Act: delete user immediately
            await localAuth.deleteUser({ userId: localUser1.id });
            // Simulate the remote process (which fails and should revert)
            await syncQueue!.process();

            // Assert: user should be restored locally
            const userRes = await localAuth.getUser({ id: localUser1.id });
            expect(userRes.isOk()).toBe(true);
        });
        it("causes getActiveUser() to return null if the active user was deleted", async () => {
            // Arrange: create and activate a user
            await localAuth.createUser({ user: localUser1 });
            await localAuth.switchUser(localUser1.id);
            mockRemoteAuth.deleteUser.mockResolvedValueOnce(ok(undefined));

            // Act: delete user
            await localAuth.deleteUser({ userId: localUser1.id });

            // Assert: getActiveUser should return null
            const activeUser = await localAuth.getActiveUser();
            expect(activeUser).toBeNull();
        });
    });

    // --- Get Current User ---
    describe("getActiveUser()", () => {
        it("returns the currently logged-in user from local state", async () => {
            // Arrange: create and activate a user
            await localAuth.createUser({ user: localUser1 });
            await localAuth.switchUser(localUser1.id);

            // Act
            const user = await localAuth.getActiveUser();

            // Assert
            expect(user).not.toBeNull();
            expect(user!.id).toBe(localUser1.id);
        });
        it("returns a null if no user is currently logged in", async () => {
            // Arrange: ensure no users logged in
            await localAuth.logout();

            // Act
            const user = await localAuth.getActiveUser();

            // Assert
            expect(user).toBeNull();
        });
    });

    // This is only grouped here because it needs the remote auth/tasks setup to run properly
    describe("migrate()", () => {
        it("returns an InvalidStateError if the user is already synced", async () => {
            // Call register
            const result = await localAuth.register({ creds: userCreds, userData: { ...localUser1, last_synced: new Date() } });

            assert(result.isErr());
            expect(result.error.type).toBe(ErrorType.InvalidState);
        });

        it("Call remotes `register`", async () => {
            // Simulate remote registration
            mockRemoteAuth.getRegistrationRequirements.mockReturnValueOnce(ok([]));
            mockRemoteAuth.register.mockResolvedValueOnce(ok({ ...remoteUser }));
            mockTasks.changeOwnership.mockResolvedValueOnce(okBatch([]));

            // Call register
            await localAuth.register({ creds: userCreds, userData: localUser1 });

            expect(mockRemoteAuth.register).toHaveBeenCalledWith({ creds: userCreds, userData: localUser1 });
        });
        it("Successfully syncs the local user with data returned from the remote `register`", async () => {
            // Arrange: mock remote register to return a different user object
            const updatedRemoteUser = { ...remoteUser, id: v4(), display_name: "Remote User" };
            mockRemoteAuth.getRegistrationRequirements.mockReturnValueOnce(ok([]));
            mockRemoteAuth.register.mockResolvedValueOnce(ok({ ...updatedRemoteUser }));
            mockTasks.changeOwnership.mockResolvedValueOnce(okBatch([]));
            // Act: call register
            await localAuth.register({ creds: userCreds, userData: localUser1 });

            // Simulate the sync queue
            await syncQueue!.process();

            // Assert: the local user should now match the remote user data
            const activeUser = await localAuth.getActiveUser();
            assert(activeUser !== null);
            expect(activeUser.id).toBe(updatedRemoteUser.id);
            expect(activeUser.display_name).toBe("Remote User");
        });
        it("Does not attempt a remote call if local user creation fails validation", async () => {
            // Arrange: provide invalid user (e.g., missing display_name)
            const invalidUser = { ...localUser1, display_name: undefined };
            mockRemoteAuth.getRegistrationRequirements.mockReturnValueOnce(err(new NotImplementedError("")));

            // Act: call register and expect error
            const result = await localAuth.register({ creds: userCreds, userData: invalidUser });
            assert(result.isErr());

            // Assert: remote register should not be called
            expect(mockRemoteAuth.register).not.toHaveBeenCalled();
        });
        it("returns an error state if remote `register` fails", async () => {
            // Arrange: provide invalid user (e.g., missing display_name)
            const invalidUser = { ...localUser1, display_name: undefined };
            mockRemoteAuth.getRegistrationRequirements.mockReturnValueOnce(ok([]));
            mockRemoteAuth.register.mockResolvedValueOnce(err(new ArgumentError(invalidUser, "Simulated failure")));

            // Act: call register and expect error
            const result = await localAuth.register({ creds: userCreds, userData: invalidUser });

            // Assert: remote register should be called and return an error for the UI to respond to
            expect(mockRemoteAuth.register).toHaveBeenCalled();
            assert(result.isErr());
        });
        it("updates all local tasks with the owner's new id and queue them to be created on the server", async () => {
            // Arrange: create a local user and some tasks owned by that user
            const oldUserId = localUser1.id;
            const newRemoteUser = { ...remoteUser, id: v4(), display_name: "Migrated User" };
            const localTasks = [
                { id: v4(), userId: oldUserId, title: "Task 1" },
                { id: v4(), userId: oldUserId, title: "Task 2" }
            ];
            // Mock changeOwnership to return updated tasks
            mockTasks.changeOwnership.mockResolvedValueOnce(okBatch(localTasks.map(t => new Task({ ...t, user_id: newRemoteUser.id }))));
            mockRemoteAuth.getRegistrationRequirements.mockReturnValueOnce(ok([]));
            mockRemoteAuth.register.mockResolvedValueOnce(ok({ ...newRemoteUser }));

            // Act: call register
            await localAuth.register({ creds: userCreds, userData: localUser1 });
            await syncQueue!.process();

            // Assert: changeOwnership should be called with correct IDs
            expect(mockTasks.changeOwnership).toHaveBeenCalledWith({ oldUserID: oldUserId, newUserID: newRemoteUser.id });
            // Optionally, check that the local tasks are now owned by the new user (if local state is updated)
            // This depends on the implementation of extractBatchAndLogErrors and local task update logic
        });
        it("returns an InvalidStateError if `register` is called while already logged in", async () => {
            // Arrange: create and switch to a user (simulate logged in)
            await localAuth.createUser({ user: localUser1 });
            await localAuth.switchUser(localUser1.id);
            // Simulate already synced user
            const alreadySyncedUser = { ...localUser1, last_synced: new Date() };

            // Act: call register
            const result = await localAuth.register({ creds: userCreds, userData: alreadySyncedUser });

            // Assert: should return InvalidStateError
            assert(result.isErr());
            expect(result.error.type).toBe(ErrorType.InvalidState);
        });
    });

    // });


    describe("ILocalAuth", () => {
        let localDB: LocalDB;

        let localAuth: IAuthLocalFunctions;
        let user1: LocalUser;
        let user2: LocalUser;

        beforeAll(async () => {
            localDB = await dbPromise;
        })

        const beforeEachLocalAuth = async () => {
            localAuth = await BrowserAuthProvider.get();

            // Auth provider initializes with a default anon user if there's not already a user
            localDB.clear('appdata');
            localDB.clear('users');
            localDB.clear('tasks');

            user1 = { id: v4(), display_name: "User One", last_active: new Date(), auth_provider: 'local' };
            user2 = { id: v4(), display_name: "User Two", last_active: new Date(), auth_provider: 'local' };
        };
        beforeEach(beforeEachLocalAuth);

        describe("getActiveUser()", () => {

            it("retrieves the active logged in user", async () => {
                await localAuth.createUser({ user: user1 });
                await localAuth.createUser({ user: user2 });

                // Switch to user2
                await localAuth.switchUser(user2.id);

                // getActiveUser should return user2
                const activeUser = await localAuth.getActiveUser();
                assert(activeUser !== null);
                expect(activeUser.id).toBe(user2.id);
            });
            it("returns null if no user is currently active", async () => {
                // Make sure the db has no active user
                const users = await localAuth.listUsers();
                expect(users.length).toBe(0);

                const activeId = await localDB.get('appdata', 'active-user');
                expect(activeId).toBeUndefined();

                const activeUser = await localAuth.getActiveUser();
                expect(activeUser).toBeNull();
            });
        });
        describe("listUsers()", () => {

            it("lists all user profiles stored locally with `listUsers()`", async () => {
                // Add two users
                await localAuth.createUser({ user: user1 });
                await localAuth.createUser({ user: user2 });

                const users = await localAuth.listUsers();

                expect(users.length).toBe(2);

                const ids = users.map(u => u.id);
                expect(ids).toContain(user1.id);
                expect(ids).toContain(user2.id);
            });
        });
        describe("switchUser()", () => {

            it("switches the active user with `switchUser(userId)`", async () => {
                await localAuth.createUser({ user: user1 });
                await localAuth.createUser({ user: user2 });

                // Switch to user1
                let result = await localAuth.switchUser(user1.id);
                assert(result.isOk());

                let activeUser = await localAuth.getActiveUser();
                assert(activeUser !== null);
                expect(activeUser.id).toBe(user1.id);

                // Switch to user2
                result = await localAuth.switchUser(user2.id);
                assert(result.isOk());

                activeUser = await localAuth.getActiveUser();
                assert(activeUser !== null);
                expect(activeUser.id).toBe(user2.id);
            });
            it("returns an error if `switchUser(userId)` is called with a non-existent user ID", async () => {
                const fakeId = v4();
                const result = await localAuth.switchUser(fakeId);
                assert(result.isErr());
                expect(result.error.type).toBe(ErrorType.NotFoundError);
            });
        });
        describe("getDefaultUser()", () => {

            it("creates and return an anonymous user if there are no users", async () => {
                const result = await localAuth.getDefaultUser();
                assert(result.isOk());
                const anon = result.value;
                expect(anon.display_name).toBeUndefined();
                expect(anon.auth_provider).toBe('local');
            });
            it("returns InvalidStateError if there are non-anonymous users", async () => {
                // Add two users
                await localAuth.createUser({ user: user1 });
                await localAuth.createUser({ user: user2 });
                const result = await localAuth.getDefaultUser();
                assert(result.isErr());
                expect(result.error.type).toBe(ErrorType.InvalidState);
            });
            it("returns a user if there is only one (and they are not security protected)", async () => {
                await localAuth.createUser({ user: user1 });
                const result = await localAuth.getDefaultUser();
                assert(result.isOk());
                expect(result.value.id).toBe(user1.id);
            });
            // TODO I don't know what security protected means specifically in order to implement this
            it.todo("returns InvalidStateError if the default user is security protected");
        });
    });


    // Final edge cases and cleanup.
    describe("General Edge Cases", () => {
        it.todo("handles the `responseHandler` functions itself failing gracefully (e.g., log a critical error)");
        it.todo("correctly handles being closed while a remote operation is in-flight");
    });
});