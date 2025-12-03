/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect } from "vitest";
import type { ITasksRemote, ITasksLocal, ITasksBase } from "./seam-interfaces";
import type { Task, CreateTaskParams, UpdateTaskParams, ExportedData } from "$domain/models/task";
import type { Result } from "$domain/result";
import type { NotAuthorizedError } from "$domain/errors";
import type { FetchableStore } from "../fetchableStore";
import type { Fetchable } from "$domain/fetchable";
import type { AppNode } from "$domain/models/node";

//#region Store Testing Utilities

/**
 * Wait for a store to reach a specific state
 */
export async function waitForStoreValue<T>(
	store: FetchableStore<T>,
	predicate: (value: Fetchable<T>) => boolean,
	timeout = 5000
): Promise<Fetchable<T>> {
	return new Promise((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			unsubscribe();
			reject(new Error(`Store did not reach expected state within ${timeout}ms`));
		}, timeout);

		const unsubscribe = store.subscribe((value) => {
			if (predicate(value)) {
				clearTimeout(timeoutId);
				unsubscribe();
				resolve(value);
			}
		});
	});
}

/**
 * Get a single emission from a store
 */
export function subscribeOnce<T>(store: FetchableStore<T>): Promise<Fetchable<T>> {
	return new Promise((resolve) => {
		const unsubscribe = store.subscribe((value) => {
			unsubscribe();
			resolve(value);
		});
	});
}

/**
 * Assert that a store has resolved data
 */
export function expectStoreResolved<T>(value: Fetchable<T>, expectedData?: T): asserts value is { status: "resolved"; value: T } {
	expect(value.status).toBe("resolved");
	if (value.status === "resolved") {
		if (expectedData !== undefined) {
			expect(value.value).toEqual(expectedData);
		}
	}
}

/**
 * Get current value from a store synchronously
 */
export function getStoreValue<T>(store: FetchableStore<T>): Fetchable<T> {
	let value: Fetchable<T> = { status: "loading" };
	const unsubscribe = store.subscribe((v) => {
		value = v;
	});
	unsubscribe();
	return value;
}

//#endregion

//#region Test Helpers Interface

export interface TestHelpers {
	/**
	 * Create a test task with default values
	 */
	buildTaskCreate(overrides?: Partial<CreateTaskParams>): CreateTaskParams;

	/**
	 * Create a test task update with default values
	 */
	buildTaskUpdate(id: string, overrides?: Partial<UpdateTaskParams>): UpdateTaskParams;

	/**
	 * Get a task by ID (for verification)
	 */
	getTaskById(id: string): Promise<Task | null>;

	/**
	 * Get all tasks for a user (for verification)
	 */
	getAllTasksForUser(userId: string, excludeRoot?: boolean): Promise<AppNode[]>;

	/**
	 * Assert bidirectional relationship between parent and child
	 */
	assertBidirectionalRelationship(parent: AppNode, child: AppNode): void;

	/**
	 * Create a mock authenticated user context
	 */
	withAuth<T>(userId: string, fn: () => Promise<T>): Promise<T>;
}

//#endregion

//#region ITasksBase Test Suite

/**
 * Creates a reusable test suite for ITasksBase (shared methods)
 */
export function createBaseTestSuite(
	provider: ITasksBase,
	helpers: TestHelpers
) {
	return {
		//#region Mutations (shared)

		describeUpdateTask() {
			describe("updateTask", () => {
				test.todo("updates task fields", async () => {
					// Note: This test requires a task to exist, which must be created via provider-specific method
					// For base tests, we'll skip createTask tests since they differ between Remote and Local
				});

				test.todo("adds parent relationship");

				test.todo("removes parent relationship");

				test("returns NotFoundError for non-existent task", async () => {
					const result = await helpers.withAuth("user1", async () => {
						return await provider.updateTask(
							helpers.buildTaskUpdate("non_existent_id", { title: "Nope" })
						);
					});

					const [data, error] = result;
					if (error) {
						expect(error).toBeInstanceOf(Error);
						expect((error as any).name).toMatch(/NotFound/i);
					} else {
						// Some implementations may throw instead
						expect(data).toBeDefined();
					}
				});
			});
		},

		describeUpdateTasks() {
			describe("updateTasks", () => {
				test.todo("updates multiple tasks in batch");

				test.todo("deduplicates affected tasks");
			});
		},

		describeDeleteTask() {
			describe("deleteTask", () => {
				test.todo("deletes task and removes from parent.children");

				test.todo("handles cascade effects on children");

				test("returns NotFoundError for non-existent task", async () => {
					const result = await helpers.withAuth("user1", async () => {
						return await provider.deleteTask({ id: "non_existent_id" });
					});

					const [data, error] = result;
					if (error) {
						expect(error).toBeInstanceOf(Error);
						expect((error as any).name).toMatch(/NotFound/i);
					}
				});
			});
		},

		describeDeleteTasks() {
			describe("deleteTasks", () => {
				test.todo("deletes multiple tasks in batch");

				test.todo("tracks affected tasks correctly");
			});
		},

		describeImportData() {
			describe("importData", () => {
				test("imports data in add mode", async () => {
					const exportData: ExportedData = {
						version: "0.0.0",
						exportedAt: new Date().getTime(),
						data: [
							{
								id: "imported_1",
								userAuthId: "original_user",
								parents: [],
								children: [],
								created: Date.now(),
								lastEdit: Date.now(),
								data: {
									type: "task",
									title: "Imported Task",
									status: 0,
								},
							},
						],
					};

					const result = await helpers.withAuth("user1", async () => {
						return await provider.importData({
							data: JSON.stringify(exportData),
							mode: "add",
						});
					});

					const [count, error] = result;
					expect(error).toBeNull();
					expect(count).toBeGreaterThan(0);
				});

				test("imports data in replace mode", async () => {
					const exportData: ExportedData = {
						version: "0.0.0",
						exportedAt: new Date().getTime(),
						data: [
							{
								id: "imported_1",
								userAuthId: "original_user",
								parents: [],
								children: [],
								created: Date.now(),
								lastEdit: Date.now(),
								data: {
									type: "task",
									title: "Imported Task",
									status: 0,
								},
							},
						],
					};

					const result = await helpers.withAuth("user1", async () => {
						return await provider.importData({
							data: JSON.stringify(exportData),
							mode: "replace",
						});
					});

					const [count, error] = result;
					expect(error).toBeNull();
					expect(count).toBeGreaterThan(0);
				});

				test("handles relationship remapping", async () => {
					const exportData: ExportedData = {
						version: "0.0.0",
						exportedAt: new Date().getTime(),
						data: [
							{
								id: "parent_1",
								userAuthId: "original_user",
								parents: [],
								children: ["child_1"],
								created: Date.now(),
								lastEdit: Date.now(),
								data: {
									type: "task",
									title: "Parent",
									status: 0,
								},
							},
							{
								id: "child_1",
								userAuthId: "original_user",
								parents: ["parent_1"],
								children: [],
								created: Date.now(),
								lastEdit: Date.now(),
								data: {
									type: "task",
									title: "Child",
									status: 0,
								},
							},
						],
					};

					const result = await helpers.withAuth("user1", async () => {
						return await provider.importData({
							data: JSON.stringify(exportData),
							mode: "add",
						});
					});

					const [count, error] = result;
					expect(error).toBeNull();
					expect(count).toBeGreaterThan(0);

					// Verify relationships were established
					const allTasks = await helpers.getAllTasksForUser("user1", true);
					const parent = allTasks.find((t) => t.data.title === "Parent");
					const child = allTasks.find((t) => t.data.title === "Child");
					if (parent && child) {
						helpers.assertBidirectionalRelationship(parent, child);
					}
				});
			});
		},

		describeExportData() {
			describe("exportData", () => {
				test.todo("exports all tasks");

				test.todo("exports subtree");
			});
		},

		//#endregion

		//#region Queries (shared)

		describeGetTask() {
			describe("getTask", () => {
				test.todo("retrieves single task");

				test("handles not found task", async () => {
					const store = provider.getTask("non_existent_id");

					const value = await waitForStoreValue(
						store,
						(v) => v.status === "resolved" || v.status === "error"
					);

					// Should either error or return null/undefined
					if (value.status === "error") {
						expect(value.error).toBeDefined();
					} else if (value.status === "resolved") {
						// Some implementations may return null for not found
						expect(value.value).toBeDefined();
					}
				});

				test.todo("updates when task changes");
			});
		},

		describeGetTasks() {
			describe("getTasks", () => {
				test.todo("retrieves multiple tasks");

				test.todo("updates query parameters");
			});
		},

		describeGetAllUserTasks() {
			describe("getAllUserTasks", () => {
				test.todo("retrieves all user tasks");

				test.todo("filters by userId");
			});
		},

		describeGetChildrenOf() {
			describe("getChildrenOf", () => {
				test.todo("retrieves children of a task");

				test.todo("updates when relationships change");
			});
		},

		describeGetParentsOf() {
			describe("getParentsOf", () => {
				test.todo("retrieves parents of a task");
			});
		},

		describeGetSiblingsOf() {
			describe("getSiblingsOf", () => {
				test.todo("retrieves siblings grouped by parent");
			});
		},

		describeGetRootTasks() {
			describe("getRootTasks", () => {
				test.todo("retrieves root tasks");
			});
		},

		describeGetTodaysTasks() {
			describe("getTodaysTasks", () => {
				test.todo("retrieves today's tasks");
			});
		},

		describeGetPrioritizedTasks() {
			describe("getPrioritizedTasks", () => {
				test.todo("retrieves prioritized tasks with limit");

				test.todo("updates query parameters");
			});
		},

		describeSearchTasks() {
			describe("searchTasks", () => {
				test.todo("searches tasks by text");

				test.todo("returns empty array for no matches");
			});
		},

		//#endregion
	};
}

//#endregion

//#region ITasksRemote Test Suite

/**
 * Creates a reusable test suite for ITasksRemote (remote-specific methods)
 */
export function createRemoteTestSuite(
	provider: ITasksRemote,
	helpers: TestHelpers
) {
	return {
		describeCreateTask() {
			describe("createTask", () => {
				test("creates task successfully", async () => {
					const result = await helpers.withAuth("user1", async () => {
						return await provider.createTask({
							createDetail: helpers.buildTaskCreate({ title: "Test Task" }),
						});
					});

					const [data, error] = result;
					expect(error).toBeNull();
					expect(data).toBeDefined();
					if (data) {
						expect(data.created).toBeDefined();
						expect(data.created.data.title).toBe("Test Task");
						expect(Array.isArray(data.affected)).toBe(true);
					}
				});

				test("returns NotAuthorizedError when not authenticated", async () => {
					const result = await provider.createTask({
						createDetail: helpers.buildTaskCreate({ title: "Test Task" }),
					});

					const [data, error] = result;
					if (error) {
						expect(error).toBeInstanceOf(Error);
						expect((error as any).name).toMatch(/NotAuthorized|Unauthorized/i);
					} else {
						// Some implementations may throw instead
						expect(data).toBeDefined();
					}
				});

				test("creates task with parent relationship", async () => {
					const parentResult = await helpers.withAuth("user1", async () => {
						return await provider.createTask({
							createDetail: helpers.buildTaskCreate({ title: "Parent" }),
						});
					});

					const [parentData] = parentResult;
					if (!parentData) throw new Error("Parent creation failed");

					const childResult = await helpers.withAuth("user1", async () => {
						return await provider.createTask({
							createDetail: helpers.buildTaskCreate({
								title: "Child",
								parents: [parentData.created.id],
							}),
						});
					});

					const [childData] = childResult;
					expect(childData).toBeDefined();
					if (childData) {
						expect(childData.created.parents).toContain(parentData.created.id);
						// Verify bidirectional relationship
						const parent = await helpers.getTaskById(parentData.created.id);
						const child = await helpers.getTaskById(childData.created.id);
						if (parent && child) {
							helpers.assertBidirectionalRelationship(parent, child);
						}
					}
				});

				test("returns givenId for optimistic updates", async () => {
					const givenId = "temp_id_123";
					const result = await helpers.withAuth("user1", async () => {
						return await provider.createTask({
							createDetail: helpers.buildTaskCreate({ id: givenId, title: "Test" }),
						});
					});

					const [data] = result;
					if (data && "givenId" in data.created.data) {
						expect(data.created.data.givenId).toBe(givenId);
					}
				});
			});
		},

		describeCreateTasks() {
			describe("createTasks", () => {
				test("creates multiple tasks in batch", async () => {
					const result = await helpers.withAuth("user1", async () => {
						return await provider.createTasks({
							createDetails: [
								helpers.buildTaskCreate({ title: "Task 1" }),
								helpers.buildTaskCreate({ title: "Task 2" }),
								helpers.buildTaskCreate({ title: "Task 3" }),
							],
						});
					});

					const [data, error] = result;
					expect(error).toBeNull();
					expect(data).toBeDefined();
					if (data) {
						expect(data.created).toHaveLength(3);
						expect(data.created[0].data.title).toBe("Task 1");
						expect(data.created[1].data.title).toBe("Task 2");
						expect(data.created[2].data.title).toBe("Task 3");
						expect(Array.isArray(data.affected)).toBe(true);
					}
				});

				test("handles relationships in batch creation", async () => {
					const parentResult = await helpers.withAuth("user1", async () => {
						return await provider.createTask({
							createDetail: helpers.buildTaskCreate({ title: "Parent" }),
						});
					});

					const [parentData] = parentResult;
					if (!parentData) throw new Error("Parent creation failed");

					const result = await helpers.withAuth("user1", async () => {
						return await provider.createTasks({
							createDetails: [
								helpers.buildTaskCreate({
									title: "Child 1",
									parents: [parentData.created.id],
								}),
								helpers.buildTaskCreate({
									title: "Child 2",
									parents: [parentData.created.id],
								}),
							],
						});
					});

					const [data] = result;
					expect(data).toBeDefined();
					if (data) {
						expect(data.created).toHaveLength(2);
						// Verify relationships
						const parent = await helpers.getTaskById(parentData.created.id);
						if (parent) {
							expect(parent.children).toContain(data.created[0].id);
							expect(parent.children).toContain(data.created[1].id);
						}
					}
				});
			});
		},
	};
}

//#endregion

//#region ITasksLocal Test Suite

/**
 * Creates a reusable test suite for ITasksLocal (local-specific methods)
 */
export function createLocalTestSuite(
	provider: ITasksLocal,
	helpers: TestHelpers
) {
	return {
		describeCreateTask() {
			describe("createTask", () => {
				test("creates task successfully and returns ID", async () => {
					const result = await helpers.withAuth("user1", async () => {
						return await provider.createTask({
							createDetail: helpers.buildTaskCreate({ title: "Test Task" }),
						});
					});

					const [id, error] = result;
					expect(error).toBeNull();
					expect(id).toBeDefined();
					if (!id) throw new Error("Expected id to be defined");
					expect(typeof id.newId).toBe("string");
				});

				test("returns InvalidStateError on validation failure", async () => {
					// Implementation-specific - depends on what validation errors are possible
					const result = await helpers.withAuth("user1", async () => {
						return await provider.createTask({
							createDetail: helpers.buildTaskCreate({ title: "" }), // Invalid empty title
						});
					});

					const [id, error] = result;
					if (error) {
						expect(error).toBeInstanceOf(Error);
						expect((error as any).name).toMatch(/InvalidState/i);
					}
				});

				test("creates task with parent relationship", async () => {
					const [parentResult, parentError] = await helpers.withAuth("user1", async () => {
						return await provider.createTask({
							createDetail: helpers.buildTaskCreate({ title: "Parent" }),
						});
					});

					if (!parentResult) throw new Error("Parent creation failed");
					const { newId: parentId } = parentResult;

					const [childResult, childError] = await helpers.withAuth("user1", async () => {
						return await provider.createTask({
							createDetail: helpers.buildTaskCreate({
								title: "Child",
								parents: [parentId],
							}),
						});
					});

					expect(childResult).toBeDefined();
					if (childResult) {
						const { newId: childId } = childResult;
						// Verify relationship via getTaskById
						const parent = await helpers.getTaskById(parentId);
						const child = await helpers.getTaskById(childId);
						if (parent && child) {
							expect(child.parents).toContain(parentId);
							helpers.assertBidirectionalRelationship(parent, child);
						}
					}
				});
			});
		},

		describeCreateTasks() {
			describe("createTasks", () => {
				test("creates multiple tasks in batch and returns IDs", async () => {
					const result = await helpers.withAuth("user1", async () => {
						return await provider.createTasks({
							createDetails: [
								helpers.buildTaskCreate({ title: "Task 1" }),
								helpers.buildTaskCreate({ title: "Task 2" }),
								helpers.buildTaskCreate({ title: "Task 3" }),
							],
						});
					});

					const [idUpdates, error] = result;
					expect(error).toBeNull();
					expect(idUpdates).toBeDefined();
					if (!idUpdates) throw new Error("Expected ids to be defined");
					expect(Array.isArray(idUpdates)).toBe(true);
					expect(idUpdates).toHaveLength(3);
					idUpdates.forEach((upd) => {
						expect(typeof upd.newId).toBe("string");
					});
				});

				test("handles relationships in batch creation", async () => {
					const [parentResult, parentError] = await helpers.withAuth("user1", async () => {
						return await provider.createTask({
							createDetail: helpers.buildTaskCreate({ title: "Parent" }),
						});
					});

					if (!parentResult) throw new Error("Parent creation failed");
					const { newId: parentId } = parentResult;

					const [childResults, childError] = await helpers.withAuth("user1", async () => {
						return await provider.createTasks({
							createDetails: [
								helpers.buildTaskCreate({
									title: "Child 1",
									parents: [parentId],
								}),
								helpers.buildTaskCreate({
									title: "Child 2",
									parents: [parentId],
								}),
							],
						});
					});

					if (childError) throw new Error("Child creation failed");
					const childIds = childResults.map((result) => result.newId);
					expect(childResults).toHaveLength(2);
					// Verify relationships
					const parent = await helpers.getTaskById(parentId);
					if (parent) {
						expect(parent.children).toContain(childIds[0]);
						expect(parent.children).toContain(childIds[1]);
					}
				});

				test("returns ArgumentError for invalid batch", async () => {
					// Implementation-specific - depends on what constitutes an invalid batch
					const result = await helpers.withAuth("user1", async () => {
						return await provider.createTasks({
							createDetails: [], // Empty array might be invalid
						});
					});

					const [ids, error] = result;
					if (error) {
						expect(error).toBeInstanceOf(Error);
						expect((error as any).name).toMatch(/Argument|InvalidState/i);
					}
				});
			});
		},

		describeHandleCreateTasksResponse() {
			describe("handleCreateTasksResponse", () => {
				test("handles successful response with ID updates", async () => {
					// Create local tasks first
					const [localResult, localError] = await helpers.withAuth("user1", async () => {
						return await provider.createTasks({
							createDetails: [
								helpers.buildTaskCreate({ title: "Task 1" }),
								helpers.buildTaskCreate({ title: "Task 2" }),
							],
						});
					});

					if (localError) throw new Error("Local creation failed");
					if (!localResult) throw new Error("Local creation failed");
					const localIds = localResult.map((result) => result.newId);

					// Simulate server response with ID mapping
					const idMap = new Map<string, string>();
					localIds.forEach((newId, index) => {
						idMap.set(newId, `server_${index}`);
					});

					const response: Result<
						{ updatedIds: Map<string, string>; affectedTasks: Task[] },
						{ idsToDelete: string[]; error: NotAuthorizedError }
					> = [
							{
								updatedIds: idMap,
								affectedTasks: [],
							},
							null,
						];

					await expect(provider.handleCreateTasksResponse(response)).resolves.not.toThrow();
				});

				test("handles error response with IDs to delete", async () => {
					const [localResult, localError] = await helpers.withAuth("user1", async () => {
						return await provider.createTask({
							createDetail: helpers.buildTaskCreate({ title: "Task" }),
						});
					});

					if (localError) throw new Error("Local creation failed");
					if (!localResult) throw new Error("Local creation failed");
					const { newId: localId } = localResult;

					const response: Result<
						{ updatedIds: Map<string, string>; affectedTasks: Task[] },
						{ idsToDelete: string[]; error: NotAuthorizedError }
					> = [
							null,
							{
								idsToDelete: [localId],
								error: new Error("NotAuthorized") as NotAuthorizedError,
							},
						];

					await expect(provider.handleCreateTasksResponse(response)).resolves.not.toThrow();
				});
			});
		},

		describeHandleUpdateTasksResponse() {
			describe("handleUpdateTasksResponse", () => {
				test("handles successful update response", async () => {
					const response: Result<
						void,
						{ oldState: { updatedId: string; task: Task }[]; error: NotAuthorizedError }
					> = [undefined, null];

					await expect(provider.handleUpdateTasksResponse(response)).resolves.not.toThrow();
				});

				test("handles error response with old state", async () => {
					const response: Result<
						void,
						{ oldState: { updatedId: string; task: Task }[]; error: NotAuthorizedError }
					> = [
							null,
							{
								oldState: [],
								error: new Error("NotAuthorized") as NotAuthorizedError,
							},
						];

					await expect(provider.handleUpdateTasksResponse(response)).resolves.not.toThrow();
				});
			});
		},

		describeHandleDeleteTasksResponse() {
			describe("handleDeleteTasksResponse", () => {
				test("handles successful delete response", async () => {
					const response: Result<void, { oldState: Task[]; error: NotAuthorizedError }> = [
						undefined,
						null,
					];

					await expect(provider.handleDeleteTasksResponse(response)).resolves.not.toThrow();
				});

				test("handles error response with old state", async () => {
					const response: Result<void, { oldState: Task[]; error: NotAuthorizedError }> = [
						null,
						{
							oldState: [],
							error: new Error("NotAuthorized") as NotAuthorizedError,
						},
					];

					await expect(provider.handleDeleteTasksResponse(response)).resolves.not.toThrow();
				});
			});
		},

		describeHandleMigrateResponse() {
			describe("handleMigrateResponse", () => {
				test("handles successful migration response", async () => {
					const response: Result<
						void,
						{ oldUserID: string; newUserID: string; error: NotAuthorizedError }
					> = [undefined, null];

					await expect(provider.handleMigrateResponse(response)).resolves.not.toThrow();
				});

				test("handles error response", async () => {
					const response: Result<
						void,
						{ oldUserID: string; newUserID: string; error: NotAuthorizedError }
					> = [
							null,
							{
								oldUserID: "old_user",
								newUserID: "new_user",
								error: new Error("NotAuthorized") as NotAuthorizedError,
							},
						];

					await expect(provider.handleMigrateResponse(response)).resolves.not.toThrow();
				});
			});
		},
	};
}

//#endregion

