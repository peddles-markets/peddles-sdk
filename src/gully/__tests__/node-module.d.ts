/** The slice of `node:module` the Gully web-parity test uses (the SDK ships no `@types/node`). */
declare module 'node:module' {
  export function register(specifier: string, parentURL?: string): void;
}
