// desktop/scripts/patch-exe.mjs
// Post-build: embed icon and version info into Windows EXEs via rcedit
// (Needed because signAndEditExecutable=false skips rcedit in electron-builder)
import { rcedit } from 'rcedit';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dist = join(root, 'dist');
const ico = join(root, 'assets', 'icon.ico');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const productName = pkg.build.productName;
const author = pkg.author || 'yamapan';

const commonOpts = {
  icon: ico,
  'version-string': {
    ProductName: productName,
    CompanyName: author,
    LegalCopyright: `Copyright (c) ${new Date().getFullYear()} ${author}`,
    OriginalFilename: `${productName}.exe`,
    InternalName: pkg.name,
  },
  'product-version': version,
  'file-version': version,
};

const targets = [
  {
    path: join(dist, 'win-unpacked', `${productName}.exe`),
    desc: `${productName} Desktop`,
  },
  {
    path: join(dist, `${productName} ${version}.exe`),
    desc: `${productName} Desktop (Portable)`,
  },
];

for (const t of targets) {
  if (!existsSync(t.path)) {
    console.log(`[patch-exe] skip (not found): ${t.path}`);
    continue;
  }
  await rcedit(t.path, {
    ...commonOpts,
    'version-string': { ...commonOpts['version-string'], FileDescription: t.desc },
  });
  console.log(`[patch-exe] patched: ${t.path}`);
}
console.log('[patch-exe] done');
