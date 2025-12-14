import type { IAppNode } from '$domain/models/node';
import type { ProjectData } from '$domain/models/project';
import type { QueryableStore } from '$lib/API/fetchableStore';
import tasksAPI from '$lib/API/Tasks';
import { derived } from 'svelte/store';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
	const subtreeStore = tasksAPI.getProjectSubtree(params.projectId);

	return {
		subtreeStore: subtreeStore,
	};
};