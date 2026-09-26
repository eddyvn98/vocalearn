import {spawnSync} from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
let failed = false;

function run(label, command, args) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(command, args, {stdio: 'inherit', shell: false});
  if (result.error) {
    console.error(`FAILED: ${label}: ${result.error.message}`);
    failed = true;
    return false;
  }
  if (result.status !== 0) {
    console.error(`FAILED: ${label} (exit ${result.status})`);
    failed = true;
    return false;
  }
  console.log(`PASS: ${label}`);
  return true;
}

function changedFiles() {
  const result = spawnSync('git', ['diff', '--name-only', 'HEAD'], {encoding: 'utf8'});
  if (result.status !== 0) return [];
  return result.stdout.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
}

run('Rebuild offline service-worker manifest', npm, ['run', 'build:sw']);
run('Static checks + automated regression tests', npm, ['run', 'verify']);

const changed = changedFiles();
const runtime = changed.filter(path => /^(core|server|public\/js)\//.test(path) && /\.m?js$/.test(path));
const tests = changed.filter(path => /^tests\//.test(path));

if (runtime.length && !tests.length) {
  console.warn('\nWARNING: Runtime behavior changed but no test file changed.');
  console.warn('Changed runtime files:');
  for (const path of runtime) console.warn(`  - ${path}`);
  console.warn('Add/update a focused regression test, or verify that an existing test already covers the exact behavior and mention that test in the completion note.');
}

const swChanged = changed.includes('public/sw.js');
if (swChanged) {
  console.warn('\nWARNING: public/sw.js changed after rebuild. Include the generated file in the same commit.');
}

if (failed) {
  console.error('\nFEATURE CHECK FAILED. Fix every failure, rerun npm run feature:check, and do not mark the work complete until it passes.');
  process.exit(1);
}

console.log('\nFEATURE CHECK PASSED.');
console.log('Treat warnings as unresolved review items before declaring the feature complete.');
