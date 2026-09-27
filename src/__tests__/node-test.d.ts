/**
 * The slice of `node:test` / `node:assert/strict` the SDK's tests use.
 *
 * The SDK has no `@types/node` (its only dependency is the `viem` peer), and
 * `tsconfig.json` type-checks `src/__tests__`, so the tests need these declared.
 * `tsconfig.build.json` excludes this directory, so none of it ships. If
 * `@types/node` is ever added as a devDependency, delete this file.
 */
declare module 'node:test' {
  export default function test(name: string, fn: () => void | Promise<void>): void;
}

declare module 'node:assert/strict' {
  interface StrictAssert {
    ok(value: unknown, message?: string): asserts value;
    equal<T>(actual: unknown, expected: T, message?: string): asserts actual is T;
    deepEqual<T>(actual: unknown, expected: T, message?: string): asserts actual is T;
    notEqual(actual: unknown, expected: unknown, message?: string): void;
    throws(fn: () => unknown, error?: (abstract new (...args: never[]) => Error) | RegExp, message?: string): void;
    rejects(promise: Promise<unknown>, error?: (abstract new (...args: never[]) => Error) | RegExp, message?: string): Promise<void>;
    match(value: string, regexp: RegExp, message?: string): void;
  }
  const assert: StrictAssert;
  export default assert;
}

/** Contract sources, imported as text by the tests (esbuild `--loader:.sol=text`). */
declare module '*.sol' {
  const source: string;
  export default source;
}
