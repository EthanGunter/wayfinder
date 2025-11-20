import { Err, NotImplementedError, NotAuthorizedError, ArgumentError, NotFoundError, InvalidStateError } from "$domain/errors";
import { err, ok } from "$domain/result";
import type { CreateTaskParams, UpdateTaskParams, TaskData } from "$domain/models/task";
import type { INodeBase } from "$domain/models/node";
import type { ProjectData } from "$domain/models/project";
import { api as convexApi } from "$convex/_generated/api";
import type { Doc, Id } from "$convex/_generated/dataModel";
import { sharedConvexClient as client } from "$lib/API/ConvexClient";
import { createFetchableReadable as createFetchable, createQueryable } from "$lib/API/fetchableStore";
import type { ITasks, ITasksLocal } from "./seam-interfaces";
import { ConvexError } from "convex/values";

// Type alias for server-side nodes with number timestamps
type ServerNode<T> = INodeBase<T, number>;


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
			const res = await client.mutation(convexApi.tasks.deleteTask, { id: id as Id<'nodes'> });
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
			const res = await client.mutation(convexApi.tasks.deleteTasks, { ids: ids as Id<'nodes'>[] });
			return ok({
				affected: res.affected.map(convertFromServerTask)
			});
		} catch (error) {
			console.error(error)
			return err(reconstructError(error));
		}
	},

	importData: async ({ data, mode = "add" }) => {
		try {
			const res = await client.mutation(convexApi.tasks.importData, { data, mode });
			return ok(res);
		} catch (error) {
			console.error(error)
			return err(reconstructError(error));
		}
	},


	// Queries
	getTask: (id) =>
		createQueryable<{ id: string }, TaskData>(
			{ id },
			(params, set) => {
				const unsubscribe = client.onUpdate(
					convexApi.tasks.getTask,
					{ id: params.id as Id<'nodes'> },
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

	getTasks: (ids) =>
		createQueryable<{ ids: string[] }, TaskData[]>(
			{ ids },
			(params, set) => {
				const unsubscribe = client.onUpdate(
					convexApi.tasks.getTasks,
					{ ids: params.ids as Id<'nodes'>[] },
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

	getAllUserTasks: (userId) =>
		createQueryable<{ userId?: string }, TaskData[]>(
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

	getChildrenOf: (id) =>
		createQueryable(
			{ id },
			(params, set) => {
				const unsubscribe = client.onUpdate(
					convexApi.tasks.getChildrenOf,
					{ id: params.id as Id<'nodes'> },
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

	getParentsOf: (id) =>
		createQueryable(
			{ id },
			(params, set) => {
				const unsubscribe = client.onUpdate(
					convexApi.tasks.getParentsOf,
					{ id: params.id as Id<'nodes'> },
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

	getSiblingsOf: (id) =>
		createQueryable({ id }, (params, set) => {
			const unsubscribe = client.onUpdate(
				convexApi.tasks.getSiblingsOf,
				{ id: params.id as Id<'nodes'> },
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

	exportData: async (subtreeId?: string) => {
		const res = await client.query(convexApi.tasks.exportData, { subtreeId });
		return res;
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

	exportData: async (subtreeId?: string) => api.exportData(subtreeId),
	importData: async ({ data, mode = "add" }) => api.importData({ data, mode }),
};

export default localApi;


/**
 * Converts client create params to Convex format with nested data structure
 * Separates graph fields (id, userAuthId, parents, children, timestamps) from data fields (title, content, status, etc.)
 */
export function convexifyCreateTaskDetails(params: CreateTaskParams): any {
	// Extract data fields vs graph fields
	const dataFields = {
		type: "task" as const,
		title: params.title,
		content: params.content,
		status: params.status ?? 0,
		todaysTask: params.todaysTask instanceof Date ? params.todaysTask.getTime() : params.todaysTask,
		dueDate: params.dueDate instanceof Date ? params.dueDate.getTime() : params.dueDate,
	};

	const graphFields = {
		id: params.id,
		userAuthId: params.userAuthId,
		parents: params.parents ?? [],
		children: params.children ?? [],
		created: params.created instanceof Date ? params.created.getTime() : (params.created ?? Date.now()),
		lastEdit: params.lastEdit instanceof Date ? params.lastEdit.getTime() : (params.lastEdit ?? Date.now()),
	};

	return {
		...graphFields,
		data: dataFields,
	};
}

/**
 * Converts server response (node with nested data or legacy ITask) to client Task format
 * Handles both node structure (with nested data) and legacy flat structure for backward compatibility
 */
function convertFromServerNode(serverNode: ServerNode<TaskData | ProjectData<number>> | ITask<number>): TaskData {
	// Check if it's a node structure (has nested data property)
	if ('data' in serverNode && typeof serverNode.data === 'object' && serverNode.data !== null) {
		const node = serverNode as ServerNode<TaskData | ProjectData>;
		// Map nested data back to flat structure for backward compatibility
		return {
			id: node.id,
			userAuthId: node.userAuthId,
			type: node.data.type === "project" ? "root" : "task",
			title: node.data.title,
			content: node.data.content,
			status: node.data.status,
			todaysTask: node.data.type === "task" && node.data.todaysTask
				? new Date(node.data.todaysTask)
				: undefined,
			dueDate: node.data.dueDate ? new Date(node.data.dueDate) : undefined,
			parents: node.parents,
			children: node.children,
			created: new Date(node.created),
			lastEdit: new Date(node.lastEdit),
		};
	}

	// Legacy format - convert timestamps
	const legacyTask = serverNode as ITask<number>;
	return {
		...legacyTask,
		created: new Date(legacyTask.created),
		lastEdit: new Date(legacyTask.lastEdit),
		todaysTask: legacyTask.todaysTask ? new Date(legacyTask.todaysTask) : undefined,
		dueDate: legacyTask.dueDate ? new Date(legacyTask.dueDate) : undefined,
	};
}

// Backward compatibility alias
const convertFromServerTask = convertFromServerNode;

/**
 * Converts client update params to Convex format
 * UpdateTaskParams is flat, so we just need to convert Date timestamps to numbers
 */
function convexifyTaskUpdate(update: UpdateTaskParams): any {
	const result: any = {
		id: update.id as Id<'nodes'>,
	};

	// Graph fields (parents, children, timestamps)
	if (update.parents !== undefined) result.parents = update.parents;
	if (update.children !== undefined) result.children = update.children;
	if (update.addParents !== undefined) result.addParents = update.addParents;
	if (update.removeParents !== undefined) result.removeParents = update.removeParents;
	if (update.addChildren !== undefined) result.addChildren = update.addChildren;
	if (update.removeChildren !== undefined) result.removeChildren = update.removeChildren;
	if (update.created !== undefined) {
		result.created = update.created instanceof Date ? update.created.getTime() : update.created;
	}
	if (update.lastEdit !== undefined) {
		result.lastEdit = update.lastEdit instanceof Date ? update.lastEdit.getTime() : update.lastEdit;
	}

	// Data fields (title, content, status, etc.)
	if (update.title !== undefined) result.title = update.title;
	if (update.content !== undefined) result.content = update.content;
	if (update.status !== undefined) result.status = update.status;
	if (update.todaysTask !== undefined) {
		result.todaysTask = update.todaysTask instanceof Date ? update.todaysTask.getTime() : update.todaysTask;
	}
	if (update.dueDate !== undefined) {
		result.dueDate = update.dueDate instanceof Date ? update.dueDate.getTime() : update.dueDate;
	}
	if (update.userAuthId !== undefined) result.userAuthId = update.userAuthId;

	return result;
}
