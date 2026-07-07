import { rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const pathsToDelete = [
  join(rootDir, 'A_Steady_Ascent.mp3'),
  join(rootDir, 'resources'),
  join(rootDir, 'out'),
  join(rootDir, 'DELIVERY.md')
];

for (const p of pathsToDelete) {
  if (existsSync(p)) {
    try {
      rmSync(p, { recursive: true, force: true });
      console.log(`Successfully deleted: ${p}`);
    } catch (err) {
      console.error(`Failed to delete ${p}:`, err.message);
    }
  } else {
    console.log(`Path does not exist (already clean): ${p}`);
  }
}
