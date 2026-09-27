// `node --import tsx --import ./script/node-test.mjs --test "src/**/*.test.ts"` — registers the
// `.sol`-as-text loader the SDK tests rely on (they import contract sources to pin constants
// against them, the same as `esbuild --loader:.sol=text` in each test's documented command).
import { register } from 'node:module';
register('./sol-text-loader.mjs', import.meta.url);
