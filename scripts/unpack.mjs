import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
const source = await readFile(new URL('../index.ts', import.meta.url),'utf8');
const expression = /const assets=JSON\.parse\(gunzipSync\(Buffer\.from\('([^']+)','base64'\)\)\.toString\('utf8'\)\);/;
const match = expression.exec(source);
const start = source.indexOf('/**\n * TriFlow API;');
if(!match || start < 0 || start >= match.index) throw new Error('Invalid TriFlow distribution layout');
const assets = JSON.parse(gunzipSync(Buffer.from(match[1], 'base64')).toString('utf8'));
await mkdir(new URL('../public/',import.meta.url),{recursive:true});
await mkdir(new URL('../src/',import.meta.url),{recursive:true});
for (const [path, content] of Object.entries(assets)) {
 if (!/^\/[a-z0-9.-]+$/.test(path) || typeof content!=='string') throw new Error('Unsafe asset: '+path);
 await writeFile(new URL('../public/'+path.slice(1),import.meta.url),content,'utf8');
}
const handler = source.slice(start,match.index).replace('function createHandler(', 'export function createHandler(');
await writeFile(new URL('../src/handler.mjs',import.meta.url),handler,'utf8');
console.log('Extracted',Object.keys(assets).length,'assets and src/handler.mjs');
