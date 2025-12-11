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

export function getDueDateStatus(dueDate?: Date): {
	status: DueDateStatus;
	text: string;
	className: string;
} {
	if (!dueDate) {
		return { status: 'none', text: '', className: '' };
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
		return { status: 'overdue', text, className: 'text-red-600 bg-red-50' };
	}

	if (isToday) {
		let text: string;
		if (diffHours < 1) {
			text = diffMinutes <= 0 ? 'due now' : `due in ${diffMinutes} min`;
		} else {
			text = `due in ${diffHours} hour${diffHours === 1 ? '' : 's'}`;
		}
		return { status: 'due-today', text, className: 'text-orange-600 bg-orange-50' };
	}

	else if (diffDays <= 1) {
		return { status: 'due-soon', text: 'due tomorrow', className: 'text-amber-600 bg-amber-50' };
	}
	else if (diffDays <= 3) {
		// Due soon (within 3 days)
		const text = `due in ${diffDays} days`;
		return { status: 'due-soon', text, className: 'text-yellow-600 bg-yellow-50' };
	}

	// Upcoming (more than 3 days)
	const text = `due in ${diffDays} days`;
	return { status: 'upcoming', text, className: 'text-blue-600 bg-blue-50' };
}
