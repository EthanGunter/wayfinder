// resultMatchers.ts
import type { Result } from '$domain/result';
import { Err } from '$domain/errors';
import { expect } from 'vitest';


expect.extend({
    toBeOk([_, error]: Result<any, Err>) {
        if (!error) {
            return {
                message: () => `expected Result was Ok`,
                pass: true,
            };
        } else {
            return {
                message: () => `expected Ok, but got Err: ${error.message}\nContext: ${JSON.stringify(error.context, undefined, 2)}`,
                pass: false,
            };
        }
    },
    toErr([value, error]: Result<any, Err>) {
        if (error) {
            return {
                message: () => `expected Result to be Err: ${error.message}\nContext: ${JSON.stringify(error.context, undefined, 2)}`,
                pass: true,
            };
        } else {
            return {
                message: () => `expected Err, but got ok(${JSON.stringify(value, undefined, 2)})`,
                pass: false,
            };
        }
    },
});