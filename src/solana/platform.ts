/**
 * The few runtime globals the Solana module uses, typed here because the SDK compiles against plain
 * ES2022 (no DOM, no Node types). Every one exists in browsers, Node 18+, Deno and Bun; a runtime
 * without one throws a clear error at the call that needs it, never at import.
 */

interface UrlLike {
  readonly protocol: string;
  readonly username: string;
  readonly password: string;
}

interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: unknown },
) => Promise<FetchResponseLike>;

const global = globalThis as unknown as {
  URL?: new (text: string) => UrlLike;
  fetch?: FetchLike;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  crypto?: { getRandomValues<T extends Int32Array>(array: T): T };
};

export function parseUrl(text: string): UrlLike {
  if (!global.URL) throw new Error('This runtime has no URL parser.');
  return new global.URL(text);
}

export function platformFetch(): FetchLike {
  if (!global.fetch) throw new Error('This runtime has no fetch: pass your own `fetch`.');
  return global.fetch.bind(globalThis) as FetchLike;
}

/** Hand the event loop back for one turn, so a long grind never freezes a page or a server. */
export function yieldToEventLoop(): Promise<void> {
  const set = global.setTimeout;
  return new Promise<void>((resolve) => (set ? set(resolve, 0) : resolve()));
}

export function randomInt32Pair(): Int32Array {
  if (!global.crypto?.getRandomValues) throw new Error('This runtime has no crypto.getRandomValues: pass `start`.');
  return global.crypto.getRandomValues(new Int32Array(2));
}
