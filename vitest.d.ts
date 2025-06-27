import 'vitest'
import { Result } from "neverthrow";

declare module 'vitest' {
  interface Assertion<T = Result.value> {
    toBeOk(): T;
    toErr(): T;
  }
}