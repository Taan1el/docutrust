import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The compiled server lives in server/dist/server/src because the build also
// picks up ../shared (see server/tsconfig.json), so its own directory is not
// a reliable anchor for other paths, and process.cwd() is not either: it is
// the server/ folder under `npm run dev` (npm sets cwd per workspace) but the
// repo root inside the Docker image (`node server/dist/server/src/index.js`
// run from /app). Instead, walk up from this file to the server package's
// own package.json and resolve every other path from there.
function findServerRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    const manifest = path.join(dir, 'package.json');
    if (fs.existsSync(manifest)) {
      try {
        const { name } = JSON.parse(fs.readFileSync(manifest, 'utf8')) as { name?: string };
        if (name === '@docutrust/server') return dir;
      } catch {
        // Unreadable manifest: keep walking up.
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
}

export const serverRoot = findServerRoot(path.dirname(fileURLToPath(import.meta.url)));
export const repoRoot = path.resolve(serverRoot, '..');
export const defaultDbPath = path.join(serverRoot, 'data', 'docutrust.db');
export const defaultClientDir = path.join(repoRoot, 'client', 'dist');
