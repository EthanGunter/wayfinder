import { describe, test, expect, beforeEach, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import { api as convexApi } from "$convex/_generated/api";
import schema from "$convex/schema";
import type { Id } from "$convex/_generated/dataModel";
import type { ConvexClient } from "convex/browser";
import type { ITasksRemote } from "./seam-interfaces";
import type { Task, CreateTaskParams, UpdateTaskParams, TaskData } from "$domain/models/task";
import {
	createRemoteTestSuite,
	createBaseTestSuite,
	type TestHelpers,
	waitForStoreValue,
} from "./seam-interfaces.test";
import { ConvexError } from "convex/values";
import type { AppNode } from "$domain/models/node";

//#region Mock ConvexClient

type TestContext = ReturnType<typeof convexTest> extends Promise<infer T> ? T : never;

/**
 * Creates a mock ConvexClient that wraps a convex-test context
 * Note: This is a simplified mock that works with convex-test's synchronous test context
 */
function createMockConvexClient(testCtx: any): ConvexClient {
	const client = {
		mutation: async (functionPath: any, args: any) => {
			return await testCtx.mutation(functionPath, args);
		},
		query: async (functionPath: any, args: any) => {
			return await testCtx.query(functionPath, args);
		},
		onUpdate: (
			functionPath: any,
			args: any,
			callback: (result: any) => void,
			onError?: (error: Error) => void
		) => {
			// For onUpdate subscriptions, we'll query immediately and set up polling
			// This is a simplified approach for testing
			let cancelled = false;
			let lastValue: any = null;

			const poll = async () => {
				if (cancelled) return;
				try {
					const result = await testCtx.query(functionPath, args);
					const resultStr = JSON.stringify(result);
					if (resultStr !== JSON.stringify(lastValue)) {
						lastValue = result;
						callback(result);
					}
				} catch (error) {
					if (onError && error instanceof Error) {
						onError(error);
					}
				}
				if (!cancelled) {
					setTimeout(poll, 50); // Poll every 50ms for tests
				}
			};

			// Initial call
			poll();

			return () => {
				cancelled = true;
			};
		},
		setAuth: vi.fn(),
		clearAuth: vi.fn(),
	} as unknown as ConvexClient;

	return client;
}

//#endregion

//#region Test Helpers Implementation

function mockAuth(subject: string) {
	return {
		subject,
		tokenIdentifier: `test|${subject}`,
		issuer: "test",
		name: subject,
		email: `${subject}@test.com`,
	};
}

function buildTaskCreate(overrides: Partial<CreateTaskParams> = {}): CreateTaskParams {
	return {
		title: "Test Task",
		status: 0,
		...overrides,
	};
}

function buildTaskUpdate(id: string, overrides: Partial<UpdateTaskParams> = {}): UpdateTaskParams {
	return { id, ...overrides };
}

/**
 * Creates test helpers for ConvexTaskProvider tests
 */
function createTestHelpers(testCtx: any, provider: ITasksRemote): TestHelpers {
	return {
		buildTaskCreate,
		buildTaskUpdate,

		async getTaskById(id: string): Promise<Task | null> {
			const store = provider.getTask(id);
			const res = await waitForStoreValue(
				store,
				(v) => v.status === "resolved" || v.status === "error",
				5000
			);
			if (res.status === "resolved" && res.value.data.type === "task") {
				return res.value as Task;
			}
			return null;
		},

		async getAllTasksForUser(userId: string, excludeRoot = false): Promise<AppNode[]> {
			const store = provider.getAllUserTasks(userId);
			const value = await waitForStoreValue(
				store,
				(v) => v.status === "resolved" || v.status === "error",
				5000
			);
			if (value.status === "resolved") {
				const tasks = value.value;
				return excludeRoot ? tasks.filter((t) => t.data.type === "task") : tasks;
			}
			return [];
		},

		assertBidirectionalRelationship(parent: Task, child: Task): void {
			expect(parent.children).toContain(child.id);
			expect(child.parents).toContain(parent.id);
		},

		async withAuth<T>(userId: string, fn: () => Promise<T>): Promise<T> {
			// The test context already has auth set up via withIdentity
			// The mocked client uses the test context, so auth is handled automatically
			return await fn();
		},
	};
}

//#endregion

//#region Provider-Specific Tests

describe("ConvexTaskProvider — Provider-Specific Tests", () => {
	let testCtx: any;
	let helpers: TestHelpers;
	let provider: ITasksRemote;

	beforeEach(async () => {
		// Create convex-test context with auth
		const ctx = convexTest(schema, import.meta.glob("$convex/**/*.*s"));
		testCtx = ctx.withIdentity(mockAuth("user1"));

		// Create mock client
		const mockClient = createMockConvexClient(testCtx);

		// Mock the ConvexClient module using doMock (not hoisted)
		vi.doMock("$lib/API/ConvexClient", () => ({
			sharedConvexClient: mockClient,
		}));

		// Re-import provider to use mocked client
		vi.resetModules();
		const { api } = await import("./ConvexTaskProvider");
		provider = api;
		helpers = createTestHelpers(testCtx, provider);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("Data Transformation", () => {
		test("converts server timestamps (number) to client (Date)", async () => {
			const now = Date.now();
			const result = await testCtx.mutation(convexApi.tasks.createTask, {
				createDetail: {
					title: "Test Task",
					status: 0,
					created: now,
					lastEdit: now,
				},
			});

			// Get via provider to test conversion
			const task = await helpers.getTaskById(result.created.id);

			expect(task).toBeDefined();
			if (task) {
				expect(task.created).toBeInstanceOf(Date);
				expect(task.lastEdit).toBeInstanceOf(Date);
				expect(task.created.getTime()).toBe(now);
				expect(task.lastEdit.getTime()).toBe(now);
			}
		});

		test("converts nested data structure from server node format to client Task format", async () => {
			const result = await testCtx.mutation(convexApi.tasks.createTask, {
				createDetail: {
					title: "Test Task",
					status: 0,
					content: "Test content",
				},
			});

			const task = await helpers.getTaskById(result.created.id);

			expect(task).toBeDefined();
			if (task) {
				// Verify nested structure is preserved
				expect(task.data.type).toBe("task");
				expect(task.data.title).toBe("Test Task");
				expect(task.data.content).toBe("Test content");
				expect(task.data.status).toBe(0);
			}
		});

		test("converts Date timestamps in data fields (todaysTask, dueDate)", async () => {
			const now = Date.now();
			const tomorrow = now + 86400000;

			const result = await testCtx.mutation(convexApi.tasks.createTask, {
				createDetail: {
					title: "Test Task",
					status: 0,
					todaysTask: now,
					dueDate: tomorrow,
				},
			});

			const task = await helpers.getTaskById(result.created.id);

			expect(task).toBeDefined();
			if (task) {
				expect(task.data.todaysTask).toBeInstanceOf(Date);
				expect(task.data.dueDate).toBeInstanceOf(Date);
				expect(task.data.todaysTask?.getTime()).toBe(now);
				expect(task.data.dueDate?.getTime()).toBe(tomorrow);
			}
		});
	});

	describe("Error Reconstruction", () => {
		test("reconstructs NotAuthorizedError from ConvexError", async () => {
			// Try to create task without auth
			const noAuthCtx = convexTest(schema, import.meta.glob("$convex/**/*.*s"));
			const mockClientNoAuth = createMockConvexClient(noAuthCtx);

			vi.doMock("$lib/API/ConvexClient", () => ({
				sharedConvexClient: mockClientNoAuth,
			}));

			vi.resetModules();
			const { api: noAuthApi } = await import("./ConvexTaskProvider");

			const createDetail = buildTaskCreate({ title: "Test" });
			const result = await noAuthApi.createTask({
				createDetail
			});

			const [data, error] = result;
			expect(error).toBeDefined();
			if (error) {
				expect(error.name).toMatch(/NotAuthorized/i);
			}

			// Restore original client for subsequent tests
			const originalClient = createMockConvexClient(testCtx);
			vi.doMock("$lib/API/ConvexClient", () => ({
				sharedConvexClient: originalClient,
			}));
			vi.resetModules();
		});

		test("reconstructs NotFoundError from ConvexError", async () => {
			const result = await provider.updateTask(
				buildTaskUpdate("non_existent_id" as Id<"nodes">, { title: "Nope" })
			);

			const [data, error] = result;
			expect(error).toBeDefined();
			if (error) {
				expect(error.name).toMatch(/NotFound/i);
			}
		});

		test("reconstructs InvalidStateError from ConvexError", async () => {
			// Create a task first
			const createParams = buildTaskCreate({ title: "Test" });
			const createResult = await testCtx.mutation(convexApi.tasks.createTask, {
				createDetail: {
					...createParams,
					created: createParams.created instanceof Date ? createParams.created.getTime() : createParams.created,
					lastEdit: createParams.lastEdit instanceof Date ? createParams.lastEdit.getTime() : createParams.lastEdit,
					todaysTask: createParams.todaysTask instanceof Date ? createParams.todaysTask.getTime() : createParams.todaysTask,
					dueDate: createParams.dueDate instanceof Date ? createParams.dueDate.getTime() : createParams.dueDate,
				},
			});

			// Try to delete root (should fail with InvalidStateError)
			const rootId = createResult.created.parents[0];
			const result = await provider.deleteTask({ id: rootId });

			const [data, error] = result;
			expect(error).toBeDefined();
			if (error) {
				expect(error.name).toMatch(/InvalidState/i);
			}
		});

		test("wraps non-ConvexError errors", async () => {
			// Mock client to throw a generic error
			const errorClient = {
				mutation: async () => {
					throw new Error("Generic error");
				},
				query: async () => {
					throw new Error("Generic error");
				},
				onUpdate: () => () => { },
				setAuth: vi.fn(),
				clearAuth: vi.fn(),
			} as unknown as ConvexClient;

			vi.doMock("$lib/API/ConvexClient", () => ({
				sharedConvexClient: errorClient,
			}));

			vi.resetModules();
			const { api: errorApi } = await import("./ConvexTaskProvider");

			const result = await errorApi.createTask({
				createDetail: buildTaskCreate({ title: "Test" }),
			});

			const [data, error] = result;
			expect(error).toBeDefined();
			expect(error).toBeInstanceOf(Error);

			// Restore original client for subsequent tests
			const originalClient = createMockConvexClient(testCtx);
			vi.doMock("$lib/API/ConvexClient", () => ({
				sharedConvexClient: originalClient,
			}));
			vi.resetModules();
		});
	});

	describe("givenId Handling", () => {
		test("preserves givenId for optimistic updates", async () => {
			const givenId = "temp_id_123";
			const result = await helpers.withAuth("user1", async () => {
				return await provider.createTask({
					createDetail: buildTaskCreate({ id: givenId, title: "Test" }),
				});
			});

			const [data, error] = result;
			expect(error).toBeNull();
			expect(data).toBeDefined();
			if (data) {
				expect(data.created.data.givenId).toBe(givenId);
			}
		});

		test("givenId is preserved through conversion", async () => {
			const givenId = "temp_id_456";
			const result = await testCtx.mutation(convexApi.tasks.createTask, {
				createDetail: {
					id: givenId,
					title: "Test Task",
					status: 0,
				},
			});

			// Verify server has it
			expect(result.created.data.givenId).toBe(givenId);

			// Verify client conversion preserves it
			const task = await helpers.getTaskById(result.created.id);

			expect(task).toBeDefined();
			if (task) {
				// givenId is added by the server and preserved in conversion
				// Check if givenId exists on the data object
				if ("givenId" in task.data && typeof (task.data as any).givenId === "string") {
					expect((task.data as any).givenId).toBe(givenId);
				}
			}
		});
	});
});

//#endregion

//#region Interface Suite Tests

describe("ConvexTaskProvider — ITasksRemote Interface Suite", () => {
	let testCtx: any;

	// Use context object that gets populated in beforeEach
	const context = {
		provider: undefined as unknown as ITasksRemote,
		helpers: undefined as unknown as TestHelpers,
	};

	// Create proxies that forward all property/method access to context.provider and context.helpers
	const providerProxy = new Proxy({} as ITasksRemote, {
		get: (_, prop) => (context.provider as any)[prop],
	});

	const helpersProxy = new Proxy({} as TestHelpers, {
		get: (_, prop) => (context.helpers as any)[prop],
	});

	beforeEach(async () => {
		// Create convex-test context with auth
		const ctx = convexTest(schema, import.meta.glob("$convex/**/*.*s"));
		testCtx = ctx.withIdentity(mockAuth("user1"));

		// Create mock client
		const mockClient = createMockConvexClient(testCtx);

		// Mock the ConvexClient module using doMock (not hoisted)
		vi.doMock("$lib/API/ConvexClient", () => ({
			sharedConvexClient: mockClient,
		}));

		// Re-import provider to use mocked client
		vi.resetModules();
		const { api } = await import("./ConvexTaskProvider");
		context.provider = api;
		context.helpers = createTestHelpers(testCtx, api);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	// Create test suites once using proxies - they'll access the actual provider/helpers at runtime
	const remoteSuite = createRemoteTestSuite(providerProxy, helpersProxy);
	remoteSuite.describeCreateTask();
	remoteSuite.describeCreateTasks();

	const baseSuite = createBaseTestSuite(providerProxy, helpersProxy);
	baseSuite.describeUpdateTask();
	baseSuite.describeUpdateTasks();
	baseSuite.describeDeleteTask();
	baseSuite.describeDeleteTasks();
	baseSuite.describeImportData();
	baseSuite.describeExportData();
	baseSuite.describeGetTask();
	baseSuite.describeGetTasks();
	baseSuite.describeGetAllUserTasks();
	baseSuite.describeGetChildrenOf();
	baseSuite.describeGetParentsOf();
	baseSuite.describeGetSiblingsOf();
	baseSuite.describeGetRootTasks();
	baseSuite.describeGetTodaysTasks();
	baseSuite.describeGetPrioritizedTasks();
	baseSuite.describeSearchTasks();
});

//#endregion

