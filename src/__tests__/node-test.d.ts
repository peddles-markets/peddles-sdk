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

/** The slice of Node's `Buffer` and `node:crypto` the Solana verify test uses to build account bytes. */
interface NodeTestBuffer extends Uint8Array {
  writeUInt32LE(value: number, offset?: number): number;
  writeUInt16LE(value: number, offset?: number): number;
  copy(target: Uint8Array, targetStart?: number): number;
  subarray(start?: number, end?: number): NodeTestBuffer;
}

declare const Buffer: {
  from(data: string | Uint8Array, encoding?: 'hex' | 'utf8'): NodeTestBuffer;
  alloc(size: number): NodeTestBuffer;
  concat(list: readonly Uint8Array[]): NodeTestBuffer;
};

declare module 'node:crypto' {
  export function createHash(algorithm: 'sha256'): {
    update(data: string | Uint8Array): { digest(): NodeTestBuffer };
  };
}
