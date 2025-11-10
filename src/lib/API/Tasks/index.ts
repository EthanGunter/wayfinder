import ConvexTaskProvider from './ConvexTaskProvider';
import type { ITasksLocal } from './seam-interfaces';

let tasksAPI: ITasksLocal;

if (true /* browser */) {
    tasksAPI = ConvexTaskProvider;
} else {
    throw new Error('Mobile task provider not implemented');
}

export default tasksAPI;
