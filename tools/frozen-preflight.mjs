// Frozen-change preflight (read-only, non-frozen tooling).
//
// Purpose: before CI, detect incomplete frozen changes. For every
// changed file that is listed in the RC deployment manifest
// (prototype/internal-rc/deploy/hashes.json) it verifies that
// (a) reviewed mirrors - other tracked files that were byte-identical
// to it at the base ref - were changed in sync and are still
// byte-identical, and (b) the manifest record for the file matches
// its current SHA-256. A mirror changed without its frozen source,
// or manifest entries changed for files that did not change, also
// fail. Exit code 1 with a required-sync list on any violation.
//
// Usage: node tools/frozen-preflight.mjs [--base <git-ref>] [--root <dir>]
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync, existsSync} from 'node:fs';
import {basename, join} from 'node:path';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function analyze({changed, manifest, trackedFiles = [], readCurrent, readBase}) {
  const problems = [];
  const required = new Set();
  const frozen = new Set(Object.keys(manifest));
  const isFrozen = path => frozen.has(path);

  // Mirror candidates are tracked files sharing a basename with the
  // frozen file (reviewed mirrors are not manifest entries themselves).
  const mirrorsOf = new Map();
  const byBasename = new Map();
  for (const path of trackedFiles) {
    const base = basename(path);
    if (!byBasename.has(base)) byBasename.set(base, []);
    byBasename.get(base).push(path);
  }
  // Mirror candidates: tracked files (from manifest keys plus any file
  // sharing a basename with a changed frozen file) whose base bytes
  // equal the frozen file's base bytes.
  const mirrorCandidates = (frozenPath) => {
    const baseBytes = readBase(frozenPath);
    if (baseBytes === null) return [];
    const out = [];
    for (const candidate of byBasename.get(basename(frozenPath)) || []) {
      if (candidate === frozenPath) continue;
      const candidateBytes = readBase(candidate);
      if (candidateBytes !== null && candidateBytes.equals(baseBytes)) out.push(candidate);
    }
    return out;
  };

  for (const path of changed) {
    if (isFrozen(path)) {
      const current = readCurrent(path);
      if (current === null) { problems.push(`${path}: frozen file missing`); continue; }
      if (manifest[path] !== sha256(current)) {
        problems.push(`${path}: manifest hash stale (recorded ${manifest[path].slice(0, 12)}…, actual ${sha256(current).slice(0, 12)}…)`);
        required.add('prototype/internal-rc/deploy/hashes.json');
      }
      for (const mirror of mirrorCandidates(path)) {
        mirrorsOf.set(path, [...(mirrorsOf.get(path) || []), mirror]);
        const mirrorCurrent = readCurrent(mirror);
        if (!changed.includes(mirror) || mirrorCurrent === null || !mirrorCurrent.equals(current)) {
          problems.push(`${path}: reviewed mirror not in sync: ${mirror}`);
          required.add(mirror);
        }
      }
    }
  }
  // Mirror changed without its frozen source.
  for (const path of changed) {
    if (isFrozen(path)) continue;
    for (const frozenPath of trackedFiles.filter(p => isFrozen(p))) {
      if (basename(frozenPath) !== basename(path)) continue;
      const frozenBase = readBase(frozenPath), mirrorBase = readBase(path);
      if (frozenBase !== null && mirrorBase !== null && frozenBase.equals(mirrorBase) && !changed.includes(frozenPath)) {
        problems.push(`${path}: mirror changed without frozen source ${frozenPath}`);
        required.add(frozenPath);
      }
    }
  }
  // Manifest changed: only entries for changed files may differ.
  const manifestPath = 'prototype/internal-rc/deploy/hashes.json';
  if (changed.includes(manifestPath)) {
    let baseManifest = {};
    try { baseManifest = JSON.parse(readBase(manifestPath).toString('utf8')); } catch {}
    const baseFiles = baseManifest.files || baseManifest;
    const nowFiles = manifest;
    for (const key of new Set([...Object.keys(baseFiles), ...Object.keys(nowFiles)])) {
      if (baseFiles[key] !== nowFiles[key] && !changed.includes(key)) {
        problems.push(`${manifestPath}: entry changed for unchanged file ${key}`);
        required.add(key);
      }
    }
  }
  return {ok: problems.length === 0, problems, requiredSync: [...required].sort()};
}

function main() {
  const args = process.argv.slice(2);
  const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'HEAD~1';
  const root = args.includes('--root') ? args[args.indexOf('--root') + 1] : process.cwd();
  const git = (a) => execFileSync('git', a, {cwd: root, encoding: 'utf8'});
  const changed = [...new Set([
    ...git(['diff', '--name-only', base, 'HEAD']).split('\n'),
    ...git(['diff', '--name-only', 'HEAD']).split('\n'),
    ...git(['ls-files', '--others', '--exclude-standard']).split('\n'),
  ].map(s => s.trim()).filter(Boolean))];
  const manifest = JSON.parse(readFileSync(join(root, 'prototype/internal-rc/deploy/hashes.json'), 'utf8'));
  const files = manifest.files || manifest;
  const readCurrent = (p) => { try { return readFileSync(join(root, p)); } catch { return null; } };
  const readBase = (p) => {
    try { return execFileSync('git', ['show', `${base}:${p}`], {cwd: root}); } catch { return null; }
  };
  const trackedFiles = git(['ls-files']).split('\n').map(s => s.trim()).filter(Boolean);
  const result = analyze({changed, manifest: files, trackedFiles, readCurrent, readBase});
  console.log(JSON.stringify({frozen_preflight: result.ok ? 'PASS' : 'FAIL', changed, ...result}, null, 2));
  if (!existsSync(join(root, 'prototype/internal-rc/deploy/hashes.json'))) process.exit(2);
  process.exit(result.ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
