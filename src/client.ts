import type { PublicClient } from 'viem';

/**
 * The client every SDK read takes: any viem client that can `readContract`, `multicall` and
 * `getBalance`. Narrower than `PublicClient` on purpose — a `PublicClient` built for a chain with its
 * own formatters (Base and every OP-stack chain add `deposit` transactions) is NOT assignable to the
 * generic `PublicClient`, so typing parameters that way made `createPublicClient({ chain: base })`
 * a compile error for every Base integrator. Only the three methods the SDK calls are required.
 */
export type ReadClient = Pick<PublicClient, 'readContract' | 'multicall' | 'getBalance'>;
