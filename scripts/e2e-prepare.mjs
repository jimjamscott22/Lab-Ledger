import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '.e2e');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'data'), { recursive: true });
fs.cpSync(path.join(root, 'tests/fixtures/labs'), path.join(out, 'labs'), { recursive: true });
console.log('E2E sandbox ready at', out);
