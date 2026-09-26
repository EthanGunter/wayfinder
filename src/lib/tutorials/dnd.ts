import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { getReorderDestinationIndex } from '@atlaskit/pragmatic-drag-and-drop-hitbox/util/get-reorder-destination-index';

/** Drag data as attached by list items (only `listId` is required; `index` enables indices). */
export type DragItemData = Record<string | symbol, unknown> & { listId: string };

export type ListDropDetail = {
	/** Data of the dragged item. */
	source: DragItemData;
	/** Data of the innermost drop target in the same list, or null if dropped elsewhere. */
	target: DragItemData | null;
	/** `source.index`, if numeric. */
	startIndex: number | null;
	/** Resulting index after a reorder (closest-edge aware), if computable. */
	finishIndex: number | null;
	/** True when the drop landed on the same list and changed the item's position. */
	moved: boolean;
};

export type MonitorListDropsOptions = {
	/** Also report drops that didn't land on an item of the same list (default false). */
	includeMisses?: boolean;
	/** Axis used to compute finishIndex from the closest edge (default 'vertical'). */
	axis?: 'vertical' | 'horizontal';
};

function isDragItemData(d: unknown): d is DragItemData {
	return !!d && typeof d === 'object' && typeof (d as { listId?: unknown }).listId === 'string';
}

/**
 * Watch pragmatic-drag-and-drop element drops for items whose drag data has `listId === listId`.
 * Doesn't interfere with the list's own monitor. Returns a cleanup function.
 */
export function monitorListDrops(
	listId: string,
	onDrop: (detail: ListDropDetail) => void,
	{ includeMisses = false, axis = 'vertical' }: MonitorListDropsOptions = {}
): () => void {
	return monitorForElements({
		canMonitor: ({ source }) => isDragItemData(source.data) && source.data.listId === listId,
		onDrop: ({ location, source }) => {
			const src = source.data;
			if (!isDragItemData(src)) return;
			const dst = location.current.dropTargets[0]?.data;
			const target = isDragItemData(dst) && dst.listId === listId ? dst : null;
			if (!target && !includeMisses) return;

			const startIndex = typeof src.index === 'number' ? src.index : null;
			let finishIndex: number | null = null;
			if (target && startIndex !== null && typeof target.index === 'number') {
				finishIndex = getReorderDestinationIndex({
					startIndex,
					indexOfTarget: target.index,
					closestEdgeOfTarget: extractClosestEdge(target),
					axis
				});
			}

			onDrop({
				source: src,
				target,
				startIndex,
				finishIndex,
				moved: target !== null && startIndex !== null && finishIndex !== startIndex
			});
		}
	});
}
