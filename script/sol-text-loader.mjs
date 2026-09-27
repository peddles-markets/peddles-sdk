import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** A `.sol` import is the file's text: `import source from '../../contracts/src/X.sol'`. */
export async function load(url, context, next) {
  if (url.startsWith('file:') && url.endsWith('.sol')) {
    return { format: 'module', source: `export default ${JSON.stringify(readFileSync(fileURLToPath(url), 'utf8'))};`, shortCircuit: true };
  }
  return next(url, context);
}
