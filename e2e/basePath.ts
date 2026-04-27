import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(path.join(process.cwd(), "package.json"));
/** Isto kao `cpanelBasePath.cjs` (Playwright očekuje path od origin, npr. /LunaPic) */
export const E2E_BASE: string = require(
  path.resolve(process.cwd(), "cpanelBasePath.cjs")
) as string;
