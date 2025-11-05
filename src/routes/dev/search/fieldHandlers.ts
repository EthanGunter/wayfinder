import { TaskStatus } from '$domain/models/task';
import type { FieldRegistry, FieldHandler, ParsedValue } from './types';
import { fieldHandler } from './types';
import { parseDateValue } from './dateParser';
import { compareDate } from './matchers';

type DateValue = Date | { type: 'relative'; amount: number; unit: 'day' | 'week' | 'month' | 'year' };

export const fieldRegistry: FieldRegistry = {
	status: fieldHandler<TaskStatus>({
		parseValue: (value) => {
			const normalized = value.toLowerCase();
			if (normalized === 'complete') return TaskStatus.complete;
			else if (normalized === 'incomplete') return TaskStatus.incomplete;
			throw new Error(`Invalid status: ${value}. Must be 'complete' or 'incomplete'`);
		},
		matches: (task, op, parsedValue) => {
			if (op !== '=') {
				throw new Error(`Status field only supports '=' operator`);
			}
			return task.status === parsedValue;
		},
		autocomplete: (value) => {
			const normalized = value.toLowerCase();
			const options = ['complete', 'incomplete'];
			if (!normalized) return options;
			return options.filter((opt) => opt.startsWith(normalized));
		}
	}),

	dueDate: fieldHandler<DateValue>({
		parseValue: parseDateValue as (value: string) => DateValue,
		matches: (task, op, parsedValue) => {
			return compareDate(task.dueDate, op, parsedValue);
		}
	}),
};

