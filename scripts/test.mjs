import { rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const outDir = '.test-dist';
rmSync(outDir, { recursive: true, force: true });

const compile = spawnSync(
  process.execPath,
  ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.test.json'],
  { stdio: 'inherit' },
);

if (compile.status !== 0) process.exit(compile.status ?? 1);

writeFileSync(`${outDir}/package.json`, '{"type":"commonjs"}\n');

const test = spawnSync(
  process.execPath,
  ['--test', `${outDir}/tests/calculations.test.js`],
  { stdio: 'inherit' },
);

rmSync(outDir, { recursive: true, force: true });
process.exit(test.status ?? 1);
