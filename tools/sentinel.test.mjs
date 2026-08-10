import test from 'node:test';
import assert from 'node:assert/strict';
import { diffSnapshots } from './sentinel.mjs';

const snapshot = (target) => ({ generatedAt: new Date(0).toISOString(), targets: [target] });

test('Crystal-owned logs creation is visible but expected', () => {
  const base = { id: 'crystal:logs-dir', path: 'C:\\Users\\ciara\\AppData\\Local\\CrystalFrontend\\logs', category: 'crystal-internal' };
  const report = diffSnapshots(snapshot({ ...base, exists: false }), snapshot({ ...base, exists: true, isDir: true, mtimeMs: 10, size: 0 }));
  assert.equal(report.changes.length, 1);
  assert.equal(report.changes[0].type, 'existence-changed');
  assert.equal(report.unexpectedCount, 0);
});

test('watched external mutation remains unexpected', () => {
  const base = { id: 'gamelist:gbc', path: 'C:\\EmuDeck\\ES-DE\\gamelists\\gbc\\gamelist.xml', category: 'gamelist', exists: true, size: 100 };
  const report = diffSnapshots(snapshot({ ...base, mtimeMs: 1 }), snapshot({ ...base, mtimeMs: 5000, size: 101 }));
  assert.equal(report.unexpectedCount, 1);
  assert.equal(report.unexpected[0].id, 'gamelist:gbc');
});
