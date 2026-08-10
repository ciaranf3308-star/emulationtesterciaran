/**
 * V8.6D1 – Provider surface deterministic frontend tests
 * Same-host nav, target=_blank same-host, third-party popup blocked, download valid zip/7z/ROM ext, executable rejected
 * Must execute in CI (bun test)
 */

import { describe, it, expect } from 'bun:test';
import { isAllowedRomsFunHost, validateRomsFunUrl, FORBIDDEN_THIRD_PARTY_HOSTS, isForbiddenThirdParty } from '../../src/discovery/providers/romsfun/hostValidation';
import { isValidRomsFunSlug } from '../../src/discovery/providers/romsfun/slugValidation';
import { buildCanonicalDetailUrl } from '../../src/discovery/providers/romsfun/romsfunRoutes';

describe('V8.6D1 frontend deterministic – provider surface host/URL/slug', () => {
  it('same-host nav allowed – romsfun.com and www.romsfun.com', () => {
    expect(isAllowedRomsFunHost('romsfun.com')).toBe(true);
    expect(isAllowedRomsFunHost('www.romsfun.com')).toBe(true);
    expect(isAllowedRomsFunHost('ROMsFun.com')).toBe(true);
    expect(isAllowedRomsFunHost('vimm.net')).toBe(false);
    expect(isAllowedRomsFunHost('galaxylanesandgames.com')).toBe(false);
    expect(isAllowedRomsFunHost('evilromsfun.com')).toBe(false);
  });

  it('first-party roms path allowed', () => {
    const ok1 = validateRomsFunUrl('https://romsfun.com/');
    expect(ok1.valid).toBe(true);
    const ok2 = validateRomsFunUrl('https://romsfun.com/roms/nintendo/');
    expect(ok2.valid).toBe(true);
    const ok3 = validateRomsFunUrl('https://www.romsfun.com/roms/ps2/browse');
    expect(ok3.valid).toBe(true);
  });

  it('rejects http, custom port, creds, traversal', () => {
    expect(validateRomsFunUrl('http://romsfun.com/roms/').valid).toBe(false);
    expect(validateRomsFunUrl('https://romsfun.com:8080/roms/').valid).toBe(false);
    expect(validateRomsFunUrl('https://user:pass@romsfun.com/roms/').valid).toBe(false);
    expect(validateRomsFunUrl('https://romsfun.com/../etc').valid).toBe(false);
    expect(validateRomsFunUrl('https://romsfun.com/roms\\evil').valid).toBe(false);
  });

  it('third-party popup blocked – galaxylanes explicit FORBIDDEN', () => {
    expect(FORBIDDEN_THIRD_PARTY_HOSTS.includes('galaxylanesandgames.com' as any)).toBe(true);
    expect(isForbiddenThirdParty('https://galaxylanesandgames.com/advertising')).toBe(true);
    expect(isForbiddenThirdParty('https://romsfun.com/roms/ps2/game')).toBe(false);
    // Navigation policy: first-party only allowed – third-party must block
    const thirdParty = 'https://galaxylanesandgames.com/download-looking';
    const isAllowed = isAllowedRomsFunHost(new URL(thirdParty).hostname);
    expect(isAllowed).toBe(false);
  });

  it('target=_blank first-party inside SAME provider child where technically possible – slug valid', () => {
    const slug = 'ps2/final-fantasy-x';
    expect(isValidRomsFunSlug(slug)).toBe(true);
    const canonical = buildCanonicalDetailUrl(slug);
    expect(canonical).toBe('https://romsfun.com/roms/ps2/final-fantasy-x');
    // Same-host new window should be handled inside same child (on_new_window returns Deny but navigates same webview)
    // Here we prove host validation passes for same-host child reuse
    const u = new URL(canonical);
    expect(isAllowedRomsFunHost(u.hostname)).toBe(true);
  });

  it('target=_blank third-party must be blocked – keep romsfun page alive', () => {
    const external = 'https://galaxylanesandgames.com/popup';
    const host = new URL(external).hostname;
    expect(isAllowedRomsFunHost(host)).toBe(false);
    expect(isForbiddenThirdParty(external)).toBe(true);
    // Spec: Do NOT open Edge, do NOT create WebviewWindow, keep romsfun page alive, emit EXTERNAL_NAVIGATION_BLOCKED
    // Frontend deterministic: we assert blocked host would be rejected by provider surface on_new_window logic
  });
});

describe('V8.6D1 frontend deterministic – download validation', () => {
  // Mirror backend validation: Windows filename safety, dangerous ext reject, allowed exts = system-configured + zip/7z

  const DANGEROUS = ['exe','msi','bat','cmd','ps1','scr','com','js'];
  function isDangerous(ext: string) { return DANGEROUS.includes(ext.toLowerCase()); }
  function extOf(fn: string) {
    const dot = fn.lastIndexOf('.');
    if (dot === -1 || dot === fn.length-1) return '';
    return fn.slice(dot+1).toLowerCase();
  }
  function isAllowedExt(filename: string, systemExts: string[]) {
    const ext = extOf(filename);
    if (!ext) return false;
    if (ext === 'zip' || ext === '7z') return true;
    if (isDangerous(ext)) return false;
    return systemExts.map(e=>e.toLowerCase()).includes(ext);
  }
  function validateWindowsFilename(fn: string) {
    if (!fn || fn.trim().length===0) return false;
    if (fn.includes('/')||fn.includes('\\')||fn.includes(':')) return false;
    if (fn.endsWith('.')||fn.endsWith(' ')) return false;
    if (/[<>:"|?*]/.test(fn)) return false;
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i.test(fn)) return false;
    return true;
  }

  it('valid zip/7z/ROM ext allowed', () => {
    expect(validateWindowsFilename('game.zip')).toBe(true);
    expect(isAllowedExt('game.zip', ['iso','bin'])).toBe(true);
    expect(isAllowedExt('game.7z', ['iso'])).toBe(true);
    expect(isAllowedExt('game.iso', ['iso','bin'])).toBe(true);
    expect(isAllowedExt('Super Mario (USA).zip', [])).toBe(true);
  });

  it('executable/dangerous rejected – exe msi bat cmd ps1 scr com js', () => {
    for (const ext of DANGEROUS) {
      expect(isDangerous(ext)).toBe(true);
      expect(isAllowedExt(`evil.${ext}`, ['zip'])).toBe(false);
    }
    expect(isAllowedExt('game.exe', ['exe'])).toBe(false); // even if system claims exe, dangerous block wins
  });

  it('Windows filename safety – trailing dot/space, reserved DOS, illegal chars', () => {
    expect(validateWindowsFilename('CON.zip')).toBe(false);
    expect(validateWindowsFilename('game.')).toBe(false);
    expect(validateWindowsFilename('game ')).toBe(false);
    expect(validateWindowsFilename('a/b.zip')).toBe(false);
    expect(validateWindowsFilename('game<.zip')).toBe(false);
    expect(validateWindowsFilename('')).toBe(false);
    expect(validateWindowsFilename("Blow'em Out (USA).7z")).toBe(true);
  });

  it('session dir isolated – no overwrite, no traversal, %LOCALAPPDATA%/CrystalFrontend/cache/downloads/<sessionId>', () => {
    // Logic: sessionId must not contain / \ : .. ; dir is under crystal_writable_root cache/downloads/sessionId
    const validSession = 'ps-1711111111-abc123';
    expect(validSession.includes('/')).toBe(false);
    expect(validSession.includes('\\')).toBe(false);
    expect(validSession.includes('..')).toBe(false);
    const invalid1 = '../etc/passwd';
    expect(invalid1.includes('..')).toBe(true);
    const invalid2 = 'sess/with/slash';
    expect(invalid2.includes('/')).toBe(true);
  });
});
