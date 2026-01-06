import type { AppNode } from "$domain/models/node";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, "child"> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, "children"> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };

export type DueDateStatus = 'overdue' | 'due-today' | 'due-soon' | 'upcoming' | 'none';

function getDueDateClassName(color: string/* , inherited: boolean */): string {
	/* 	if (inherited) {
			return `border border-dashed border-${color}-600 text-${color}-600 bg-transparent`;
		} */
	return `text-${color}-600 bg-${color}-50`;
}

export function getDueDateStatus(dueDate?: Date, /* inherited: boolean = false */): {
	status: DueDateStatus;
	text: string;
	className: string;
	// inherited: boolean;
} {
	if (!dueDate) {
		return { status: 'none', text: '', className: ''/* , inherited: false */ };
	}

	const now = Date.now();
	const diff = dueDate.getTime() - now;
	const diffDays = Math.floor(diff / (1000 * 60 * 60 * 24));
	const diffHours = Math.floor(diff / (1000 * 60 * 60));
	const diffMinutes = Math.floor(diff / (1000 * 60));

	// Check if same calendar day
	const dueD = new Date(dueDate);
	const nowD = new Date(now);
	const isToday = dueD.toDateString() === nowD.toDateString();

	if (diff < 0) {
		// Overdue
		const absDays = Math.abs(diffDays);
		const absHours = Math.abs(diffHours);
		let text: string;
		if (absDays >= 1) {
			text = `overdue by ${absDays} day${absDays === 1 ? '' : 's'}`;
		} else if (absHours >= 1) {
			text = `overdue by ${absHours} hour${absHours === 1 ? '' : 's'}`;
		} else {
			text = 'overdue';
		}
		return { status: 'overdue', text, className: getDueDateClassName('red'/* , inherited */)/* , inherited */ };
	}

	if (isToday) {
		let text: string;
		if (diffHours < 1) {
			text = diffMinutes <= 0 ? 'due now' : `due in ${diffMinutes} min`;
		} else {
			text = `due in ${diffHours} hour${diffHours === 1 ? '' : 's'}`;
		}
		return { status: 'due-today', text, className: getDueDateClassName('orange'/* , inherited */)/* , inherited */ };
	}

	else if (diffDays <= 1) {
		return { status: 'due-soon', text: 'due tomorrow', className: getDueDateClassName('amber'/* , inherited */)/* , inherited */ };
	}
	else if (diffDays <= 3) {
		// Due soon (within 3 days)
		const text = `due in ${diffDays} days`;
		return { status: 'due-soon', text, className: getDueDateClassName('yellow'/* , inherited */)/* , inherited */ };
	}

	// Upcoming (more than 3 days)
	const text = `due in ${diffDays} days`;
	return { status: 'upcoming', text, className: getDueDateClassName('blue'/* , inherited */)/* , inherited */ };
}

export function getEffectiveDueDate(task: AppNode/* , allNodes: Map<string, AppNode> */): {
	dueDate?: Date;
	// inherited: boolean;
} {
	// If task has explicit due date, use it
	if (task.data.type === 'task' && task.data.dueDate) {
		return { dueDate: new Date(task.data.dueDate)/* , inherited: false */ };
	} else return { dueDate: undefined }

	// Otherwise traverse up parents to find first due date
	/* 	const visited = new Set<string>();
		const toCheck = [...task.parents];
	
		while (toCheck.length > 0) {
			const parentId = toCheck.shift()!;
			if (visited.has(parentId)) continue;
			visited.add(parentId);
	
			const parent = allNodes.get(parentId);
			if (!parent) continue;
	
			// Check if parent has a due date (only tasks, not projects)
			const parentDueDate = parent.data.type === 'task'
				? parent.data.dueDate
				: undefined;
	
			if (parentDueDate) {
				return { dueDate: new Date(parentDueDate), inherited: true };
			}
	
			// Continue up the tree
			toCheck.push(...parent.parents);
		}
	
		return { dueDate: undefined, inherited: false }; */
}


export function setEquals(a: Set<string>, b: Set<string>) {
	if (a.size !== b.size) return false;
	for (const x of a) if (!b.has(x)) return false;
	return true;
}