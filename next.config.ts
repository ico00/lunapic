import type { NextConfig } from "next";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(path.join(process.cwd(), "package.json"));
const basePath: string = require(
  path.resolve(process.cwd(), "cpanelBasePath.cjs")
) as string;

const nextConfig: NextConfig = {
  basePath,
  env: {
    /** Isti `basePath` kao u buildu; klijent ga treba za `fetch` (ne nasljeđuje se automatski). */
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  transpilePackages: ["mapbox-gl"],
};

export default nextConfig;
