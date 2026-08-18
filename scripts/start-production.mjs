import path from "node:path";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

const productionServerUrl = import.meta.resolve("vinext/server/prod-server");
let windowsStaticCacheCompatibilityInstalled = false;

/**
 * vinext 0.0.50 builds its static-file cache with path.relative(). On Windows
 * that creates keys such as `/assets\\index.js`, while HTTP requests always use
 * forward slashes. Add a lookup fallback without changing vinext or global path
 * behavior. Remove this shim after the upstream package normalizes cache keys.
 */
export async function installWindowsStaticCacheCompatibility() {
  if (process.platform !== "win32" || windowsStaticCacheCompatibilityInstalled) return;

  const staticCacheUrl = new URL("./static-file-cache.js", productionServerUrl);
  const { StaticFileCache } = await import(staticCacheUrl.href);
  const originalCreate = StaticFileCache.create.bind(StaticFileCache);

  StaticFileCache.create = async (clientDir) => {
    const cache = await originalCreate(clientDir);
    const originalLookup = cache.lookup.bind(cache);

    cache.lookup = (pathname) => {
      const directMatch = originalLookup(pathname);
      if (directMatch || !pathname.startsWith("/")) return directMatch;

      const windowsPathname = `/${pathname.slice(1).replaceAll("/", path.sep)}`;
      return originalLookup(windowsPathname);
    };

    return cache;
  };
  windowsStaticCacheCompatibilityInstalled = true;
}

export function parsePort(value) {
  const rawPort = value ?? process.env.PORT ?? "3000";
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`Invalid port: ${rawPort}`);
  }
  return port;
}

export function loadLocalRuntimeEnvironment(cwd = process.cwd()) {
  for (const filename of [".env.local", ".env"]) {
    const candidate = path.resolve(cwd, filename);
    if (existsSync(candidate)) loadEnvFile(candidate);
  }
}

export async function runProductionServer(options = {}) {
  await installWindowsStaticCacheCompatibility();
  const { startProdServer } = await import(productionServerUrl);
  return startProdServer({
    port: options.port ?? 3000,
    host: options.host ?? "0.0.0.0",
    outDir: options.outDir ?? path.resolve("dist"),
  });
}

if (process.argv?.[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  loadLocalRuntimeEnvironment();
  const { values } = parseArgs({
    options: {
      port: { type: "string", short: "p" },
      hostname: { type: "string", short: "H" },
    },
  });

  await runProductionServer({
    port: parsePort(values.port),
    host: values.hostname ?? "0.0.0.0",
  });
}
