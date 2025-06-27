// resultMatchers.ts
import { Result } from 'neverthrow';
import { Err } from '$lib/Errors';
import { expect } from 'vitest';


expect.extend({
    toBeOk(received: Result<any, Err>) {
        const pass = received.isOk();
        if (pass) {
            return {
                message: () => `expected Result was Ok`,
                pass: true,
            };
        } else {
            return {
                message: () => `expected Ok, but got Err: ${received.error.msg}\nContext: ${JSON.stringify(received.error.context, undefined, 2)}`,
                pass: false,
            };
        }
    },
    toErr(received: Result<any, Err>) {
        const pass = received.isErr();
        if (pass) {
            return {
                message: () => `expected Result to be Err: ${received.error.msg}\nContext: ${JSON.stringify(received.error.context, undefined, 2)}`,
                pass: true,
            };
        } else {
            return {
                message: () => `expected Err, but got Ok`,
                pass: false,
            };
        }
    },
});