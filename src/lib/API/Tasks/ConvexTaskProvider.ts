import { Err, NotImplementedError, NotAuthorizedError, ArgumentError, NotFoundError, InvalidStateError } from "$domain/errors";
import { err, ok } from "$domain/result";
import { type CreateTaskParams, type Task, type UpdateTaskParams, type ITask } from "$domain/models/task";
import { api as convexApi } from "$convex/_generated/api";
import type { Doc, Id } from "$convex/_generated/dataModel";
import { sharedConvexClient as client } from "$lib/API/ConvexClient";
import { createFetchableReadable as createFetchable, createQueryable } from "$lib/API/fetchableStore";
import type { ITasks, ITasksLocal } from "./seam-interfaces";
import { ConvexError } from "convex/values";

interface ExportedData {
	version: string;
	exportedAt: string;
	tasks: ITask<string>[];
}

function reconstructError(error: unknown): Err {
	if (error instanceof ConvexError) {
		const data = error.data as { type: string; msg: string; ctx?: any; msgForUser?: string };
		const messageForUser = data.msgForUser ?? data.msg;

		switch (data.type) {
			case "NotAuthorizedError":
				return new NotAuthorizedError(messageForUser, data.ctx);
			case "NotFoundError":
				return new NotFoundError(messageForUser, data.ctx?.key ?? data.ctx);
			case "InvalidState":
				return new InvalidStateError(messageForUser, data.ctx);
			case "NotImplementedError":
				return new NotImplementedError(messageForUser);
			case "Error":
			default:
				return new Err(data.type, messageForUser, data.ctx);
		}
	}

	// If not ConvexError, wrap it
	if (error instanceof Error) {
		return Err.wrap(error);
	}
	return new Err("Unknown", String(error));
}

export const api: ITasks = {
	// Mutators
	createTask: async ({ createDetail }) => {
		try {
			const res = await client.mutation(convexApi.tasks.createTask, { createDetail: convexifyCreateTaskDetails(createDetail) });
			return ok({
				created: convertFromServerTask(res.created),
				affected: res.affected.map((r) => convertFromServerTask(r))
			});
		} catch (error) {
			console.error(error)
			return err(reconstructError(error));
		}
	},

	createTasks: async ({ createDetails }) => {
		try {
			const res = await client.mutation(convexApi.tasks.createTasks, { createDetails: createDetails.map(convexifyCreateTaskDetails) });
			return ok({
				created: res.created.map((r) => convertFromServerTask(r)),
				affected: res.affected.map((r) => convertFromServerTask(r))
			});
		} catch (error) {
			console.error(error)
			return err(reconstructError(error));
		}
	},

	updateTask: async (update: UpdateTaskParams) => {
		try {
			const res = await client.mutation(convexApi.tasks.updateTask, convexifyTaskUpdate(update));
			return ok({
				updated: convertFromServerTask(res.updated),
				affected: res.affected.map(convertFromServerTask)
			});
		} catch (error) {
			console.error(error)
			return err(reconstructError(error));
		}
	},

	updateTasks: async ({ updates }) => {
		try {
			const res = await client.mutation(convexApi.tasks.updateTasks, { updates: updates.map(u => convexifyTaskUpdate(u)) });
			return ok({
				updated: res.updated.map(convertFromServerTask),
				affected: res.affected.map(convertFromServerTask)
			});
		} catch (error) {
			console.error(error)
			return err(reconstructError(error));
		}
	},

	deleteTask: async ({ id }) => {
		try {
			const res = await client.mutation(convexApi.tasks.deleteTask, { id: id as Id<'tasks'> });
			return ok({
				affected: res.affected.map(convertFromServerTask)
			});
		} catch (error) {
			console.error(error)
			return err(reconstructError(error));
		}
	},

	deleteTasks: async ({ ids }) => {
		try {
			const res = await client.mutation(convexApi.tasks.deleteTasks, { ids: ids as Id<'tasks'>[] });
			return ok({
				affected: res.affected.map(convertFromServerTask)
			});
		} catch (error) {
			console.error(error)
			return err(reconstructError(error));
		}
	},


	// Queries
	getTask: ({ id }) =>
		createQueryable<{ id: string }, Task>(
			{ id },
			(params, set) => {
				const unsubscribe = client.onUpdate(
					convexApi.tasks.getTask,
					{ id: params.id as Id<'tasks'> },
					(result) => {
						set({ status: "resolved", data: convertFromServerTask(result) });
					},
					(error: Error) => {
						set({ status: "error", error: reconstructError(error) });
					}
				);
				return () => {
					unsubscribe();
				};
			}),

	getTasks: ({ ids }) =>
		createQueryable<{ ids: string[] }, Task[]>(
			{ ids },
			(params, set) => {
				const unsubscribe = client.onUpdate(
					convexApi.tasks.getTasks,
					{ ids: params.ids as Id<'tasks'>[] },
					(result) => {
						set({ status: "resolved", data: result.map(convertFromServerTask) });
					},
					(error: Error) => {
						set({ status: "error", error: reconstructError(error) });
					}
				);
				return () => {
					unsubscribe();
				};
			}),

	getAllUserTasks: ({ userId }) =>
		createQueryable<{ userId?: string }, Task[]>(
			{ userId },
			(params, set) => {
				let unsubscribe: (() => void) | null = null;
				let cancelled = false;

				// If userId is not provided, get current authenticated user
				const resolveUserId = async (): Promise<string | null> => {
					if (params.userId) {
						return params.userId;
					}
					try {
						const whoamiResult = await client.query(convexApi.users.whoami, {});
						if (whoamiResult && whoamiResult.authId) {
							return whoamiResult.authId;
						}
						return null;
					} catch (error) {
						console.error(error)
						return null;
					}
				};

				// Start async resolution of userId
				resolveUserId().then((resolvedUserId) => {
					if (cancelled || !resolvedUserId) {
						if (!resolvedUserId && !cancelled) {
							set({ status: "error", error: new NotAuthorizedError("Not authenticated") });
						}
						return;
					}

					unsubscribe = client.onUpdate(
						convexApi.tasks.getAllUserTasks,
						{ userId: resolvedUserId },
						(result) => {
							if (cancelled) return;
							set({ status: "resolved", data: result.map(convertFromServerTask) });
						},
						(error: Error) => {
							if (cancelled) return;
							set({ status: "error", error: reconstructError(error) });
						}
					);
				}).catch((error) => {
					if (cancelled) return;
					set({ status: "error", error: reconstructError(error) });
				});

				return () => {
					cancelled = true;
					if (unsubscribe) {
						unsubscribe();
					}
				};
			}),

	getChildrenOf: ({ id }) =>
		createQueryable(
			{ id },
			(params, set) => {
				const unsubscribe = client.onUpdate(
					convexApi.tasks.getChildrenOf,
					{ id: params.id as Id<'tasks'> },
					(result) => {
						set({ status: "resolved", data: result.map(convertFromServerTask) });
					},
					(error: Error) => {
						set({ status: "error", error: reconstructError(error) });
					}
				);
				return () => {
					unsubscribe();
				};
			}),

	getParentsOf: ({ id }) =>
		createQueryable(
			{ id },
			(params, set) => {
				const unsubscribe = client.onUpdate(
					convexApi.tasks.getParentsOf,
					{ id: params.id as Id<'tasks'> },
					(result) => {
						set({ status: "resolved", data: result.map(convertFromServerTask) });
					},
					(error: Error) => {
						set({ status: "error", error: reconstructError(error) });
					}
				);
				return () => {
					unsubscribe();
				};
			}),

	getSiblingsOf: ({ id }) =>
		createQueryable({ id }, (params, set) => {
			const unsubscribe = client.onUpdate(
				convexApi.tasks.getSiblingsOf,
				{ id: params.id as Id<'tasks'> },
				(result) => {
					const siblings = new Map(result.map(
						([parent, siblings]) => [convertFromServerTask(parent), siblings.map(convertFromServerTask)]
					));
					set({ status: "resolved", data: siblings });
				},
				(error: Error) => {
					set({ status: "error", error: reconstructError(error) });
				}
			);
			return () => {
				unsubscribe();
			};
		}),

	getRootTasks: () =>
		createFetchable((set) => {
			const unsubscribe = client.onUpdate(
				convexApi.tasks.getRootTasks,
				{},
				(result) => {
					set({ status: "resolved", data: result.map(convertFromServerTask) });

				},
				(error: Error) => {
					set({ status: "error", error: reconstructError(error) });
				}
			);
			return () => {
				unsubscribe();
			};
		}),

	getTodaysTasks: () =>
		createFetchable((set) => {
			set({ status: "loading" });
			const unsubscribe = client.onUpdate(
				convexApi.tasks.getTodaysTasks,
				{},
				(result) => {
					set({ status: "resolved", data: result.map(convertFromServerTask) });
				},
				(error: Error) => {
					set({ status: "error", error: reconstructError(error) });
				}
			);
			return () => {
				unsubscribe();
			};
		}),

	getPrioritizedTasks: (limit: number) =>
		createQueryable({ limit }, (params, set) => {
			const unsubscribe = client.onUpdate(
				convexApi.tasks.getPrioritizedTasks,
				{ limit: params.limit },
				(result) => {
					set({ status: "resolved", data: result.map(convertFromServerTask) });
				},
				(error: Error) => {
					set({ status: "error", error: reconstructError(error) });
				}
			);
			return () => {
				unsubscribe();
			};
		}),

	searchTasks: async (_searchTerm: string) => {
		// const res = await client.query(api.tasks.searchTasks, { searchTerm });
		// return res; // Promise<Task[]>
		Err.throw(new NotImplementedError("api.searchTasks"));
	},
};

// Thin passthrough over the Convex provider. No optimistic/local behavior.
export const localApi: ITasksLocal = {
	// Creates remotely; returns newId for local contract
	createTask: async ({ createDetail }) => {
		const [res, e] = await api.createTask({ createDetail });
		if (e) return err(e);
		return ok(res.created.givenId!); // id is required from client, so it will be returned from server
	},
	createTasks: async ({ createDetails }) => {
		const [res, e] = await api.createTasks({ createDetails });
		if (e) return err(e);
		// Prefer authoritative ids from affectedTasks if mapping is empty
		return ok(res.created.map(t => t.givenId!));
	},

	getTask: (params) => api.getTask(params),
	getTasks: (params) => api.getTasks(params),
	getAllUserTasks: (params) => api.getAllUserTasks(params),

	updateTask: async (params: UpdateTaskParams) => api.updateTask(params),
	updateTasks: async (params) => api.updateTasks(params),
	handleUpdateTasksResponse: async (_response) => { /* no-op */ },

	deleteTask: async (params) => api.deleteTask(params),
	deleteTasks: async (params) => api.deleteTasks(params),
	handleDeleteTasksResponse: async (_response) => { /* no-op */ },

	handleCreateTasksResponse: async (_response) => { /* no-op */ },
	handleMigrateResponse: async (_response) => { /* no-op */ },

	getChildrenOf: (params) => api.getChildrenOf(params),
	getParentsOf: (params) => api.getParentsOf(params),
	getSiblingsOf: (params) => api.getSiblingsOf(params),
	getRootTasks: () => api.getRootTasks(),
	getTodaysTasks: () => api.getTodaysTasks(),
	getPrioritizedTasks: (limit: number) => api.getPrioritizedTasks(limit),

	searchTasks: async (searchTerm: string) => api.searchTasks(searchTerm),

	exportData: async () => {
		const whoamiResult = await client.query(convexApi.users.whoami, {});
		if (!whoamiResult?.authId) {
			throw new NotAuthorizedError("Not authenticated");
		}

		const tasksResult = await client.query(convexApi.tasks.getAllUserTasks, { userId: whoamiResult.authId });

		const tasks = tasksResult.map(convertFromServerTask);
		const exportedTasks: ITask<string>[] = tasks.map(task => ({
			id: task.id,
			userAuthId: task.userAuthId,
			type: task.type,
			title: task.title,
			content: task.content,
			status: task.status,
			parents: task.parents,
			children: task.children,
			todaysTask: task.todaysTask?.toISOString(),
			dueDate: task.dueDate?.toISOString(),
			created: task.created.toISOString(),
			lastEdit: task.lastEdit.toISOString(),
		}));

		const exportedData: ExportedData = {
			version: "0.0.0",
			exportedAt: new Date().toISOString(),
			tasks: exportedTasks,
		};

		return JSON.stringify(exportedData, null, 2);
	},

	importData: async ({ data, mode = "add" }) => {
		const whoamiResult = await client.query(convexApi.users.whoami, {});
		if (!whoamiResult?.authId) {
			throw new NotAuthorizedError("Not authenticated");
		}

		let parsed: ExportedData;
		try {
			parsed = JSON.parse(data);
		} catch (error) {
			console.error(error)
			throw new ArgumentError("Invalid JSON format", data, { cause: error });
		}

		if (!parsed.version || !parsed.tasks || !Array.isArray(parsed.tasks)) {
			throw new ArgumentError("Invalid export format: missing version or tasks", parsed);
		}

		// Version migration - currently only support 0.0.0
		if (parsed.version !== "0.0.0") {
			throw new ArgumentError(`Unsupported export version: ${parsed.version}. Expected 0.0.0`, parsed);
		}

		if (parsed.tasks.length == 0) return 0;

		// Convert ISO strings back to Date objects
		const tasksToImport: Task[] = parsed.tasks.map(task => ({
			...task,
			userAuthId: whoamiResult.authId, // Override with current user
			todaysTask: task.todaysTask ? new Date(task.todaysTask) : undefined,
			dueDate: task.dueDate ? new Date(task.dueDate) : undefined,
			created: new Date(task.created),
			lastEdit: new Date(task.lastEdit),
		}));

		if (mode === "replace") {

			// Get all existing tasks and delete them
			const existingResult = await client.query(convexApi.tasks.getAllUserTasks, { userId: whoamiResult.authId });
			if (existingResult.length > 0) {
				const existingIds = existingResult.map(row => row.id);
				await client.mutation(convexApi.tasks.deleteTasks, { ids: existingIds });
			}

			const [createResult, err] = await api.createTasks({ createDetails: tasksToImport });
			if (err) {
				throw err;
			}
			return createResult.affected.length;

		} else if (mode === "add") {
			// Remove all references to nodes that aren't in the "add" set
			const allIds = new Set(tasksToImport.map(t => t.id));
			for (const task of tasksToImport) {
				task.parents = task.parents?.filter(p => allIds.has(p)) ?? [];
				task.children = task.children?.filter(c => allIds.has(c)) ?? [];
			}

			const [createResult, err] = await api.createTasks({ createDetails: tasksToImport });
			if (err) {
				throw err;
			}
			return createResult.affected.length;

		} else if (mode === "attemptMerge") {
			Err.NotImplemented("attemptMerge import mode");
		}

		// Fallback (should never reach here due to type constraints, but satisfies TypeScript)
		return 0;
	},
};

export default localApi;


export function convexifyCreateTaskDetails(dto: CreateTaskParams): Doc<"tasks"> {
	const convexified: Partial<Doc<"tasks">> = {
		...dto,
		created: dto.created instanceof Date ? dto.created.getTime() : dto.created,
		todaysTask: dto.todaysTask instanceof Date ? dto.todaysTask.getTime() : dto.todaysTask,
		dueDate: dto.dueDate instanceof Date ? dto.dueDate.getTime() : dto.dueDate,
		lastEdit: dto.lastEdit instanceof Date ? dto.lastEdit.getTime() : dto.lastEdit,
	};

	delete (convexified as Partial<Task>).created; // Remove Date object so we don't crash Convex
	return convexified as Doc<"tasks">;
}

function convertFromServerTask(row: ITask<number>): Task {
	return {
		...row,
		created: new Date(row.created),
		lastEdit: new Date(row.lastEdit),
		todaysTask: row.todaysTask ? new Date(row.todaysTask) : undefined,
		dueDate: row.dueDate ? new Date(row.dueDate) : undefined,
	};
}

function convexifyTaskUpdate(update: UpdateTaskParams) {
	const u = {
		...update,
		id: update.id as Id<'tasks'>,
		data: {
			...update.data,
			created: update.data?.created ? update.data.created.getTime() : undefined,
			dueDate: update.data?.dueDate ? update.data.dueDate.getTime() : undefined,
			todaysTask: update.data?.todaysTask ? update.data.todaysTask.getTime() : undefined,
			lastEdit: update.data?.lastEdit?.getTime(),
		}
	}
	return u;
}
