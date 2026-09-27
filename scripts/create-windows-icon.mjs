import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pngToIco from 'png-to-ico';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'src', 'assets', 'logo.png');
const outputDirectory = path.join(root, 'build');
const output = path.join(outputDirectory, 'uams.ico');

await mkdir(outputDirectory, { recursive: true });
await writeFile(output, await pngToIco(await readFile(source)));
console.log(`Created Windows icon from ${path.relative(root, source)} at ${path.relative(root, output)}`);
