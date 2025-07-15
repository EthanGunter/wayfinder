Sections of Wayfinder uses a Result<T, Err> object, similar to Rust.

## Core Class - Err
### Functions
*withTrace(depth: number):* Allows a stack trace to be collected when thrown
- Stack traces aren't always ideal, as they cause a bit of overhead, and expose potentially vital internal information anywhere it's being logged. This gives us control over that.
*logError():* Pretty version of console.error()
*logWarning():* Pretty version of console.warn()
### Extending for custom Errors
Type safety is the biggest benefit of this approach. We can define custom errors and switch off of them 
#### Example
```ts
export class IOError extends Err {
    constructor(message: string, internalError: any, context?: any) {
        super(
            1, // Inheritance depth. "WriteError extends IOError" would pass '2'
            "IOError", // The type of error. This is what is used for switching
            message, // The first thing users see when logged to the console
            { internalError, dataToWrite: context } // Any object for extra context
        );
    }
}
```

## Examples
```ts

```