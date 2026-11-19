import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const buildCommand = pkg.scripts['build:backend'];
const output = buildCommand.match(/--outfile=(\S+)/)[1];
let staging: string;
let bundle: string;

describe('packaged backend module format', () => {
  beforeAll(() => {
    execSync(buildCommand, {
      cwd: root,
      env: { ...process.env, PATH: `${join(root, 'node_modules', '.bin')}${delimiter}${process.env.PATH}` },
      stdio: 'pipe',
      timeout: 30000,
    });
    staging = mkdtempSync(join(tmpdir(), 'ytcast-bundle-'));
    // Recreate the ZIP's package scope, without ignored files or node_modules.
    copyFileSync(join(root, 'package.json'), join(staging, 'package.json'));
    bundle = join(staging, output);
    mkdirSync(dirname(bundle), { recursive: true });
    copyFileSync(resolve(root, output), bundle);
  }, 30000);

  afterAll(() => {
    if (staging) rmSync(staging, { recursive: true, force: true });
  });

  it('uses an explicit CommonJS filename consistently in the build, launcher and package', () => {
    expect(extname(output)).toBe('.cjs');
    const launcher = readFileSync(join(root, 'main.py'), 'utf8');
    expect(launcher).toContain('SERVER_CJS = os.path.join(PLUGIN_DIR, "backend", "out", "server.cjs")');
    expect(launcher).toContain('[NODE_BIN, SERVER_CJS]');
    expect(readFileSync(join(root, 'build.ps1'), 'utf8')).toContain('"backend/out/server.cjs"');
  });

  it('parses the real bundle under the packaged root type:module', () => {
    expect(pkg.type).toBe('module');
    const result = spawnSync(process.execPath, ['--check', bundle], { encoding: 'utf8' });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
  });

  it('loads CommonJS globals only with a .cjs extension under type:module', () => {
    // Execute a dependency-free fixture: --check alone accepts CommonJS globals in ESM.
    const source = "module.exports = require('node:path').sep;\n";
    for (const [extension, status] of [['cjs', 0], ['js', 1]] as const) {
      const fixture = join(dirname(bundle), `commonjs-fixture.${extension}`);
      writeFileSync(fixture, source);
      const result = spawnSync(process.execPath, [fixture], { encoding: 'utf8' });
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(status);
    }
  });
});
