#!/usr/bin/env node
/**
 * Crystal Sentinel – read-only audit tool
 * Scans ES-DE / EmuDeck / gamelists / theme metadata and snapshots mtime/size
 * No writes to external targets – pure fs.stat/read.
 * Snapshot stored under %LOCALAPPDATA%\CrystalFrontend\cache\sentinel-*.json
 *
 * Usage:
 *   node tools/sentinel.mjs snapshot [--config ./crystal-machine-config.json] [--out ./sentinel-before.json]
 *   node tools/sentinel.mjs diff before.json after.json [--json out-diff.json]
 *
 * Env detection:
 *   CRYSTAL_MACHINE_CONFIG – highest prio machine config path (same as backend)
 *   EMUDECK_ROOT – e.g. D:\EmuDeck or C:\EmuDeck
 *   ESDE_APPDATA – e.g. C:\Users\<you>\AppData\Roaming\ES-DE
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const KNOWN_MEDIA_SUBFOLDERS = ['covers','physicalmedia','screenshots','titlescreens','videos','marquees','miximages'];

function expandWin(p) {
  // Very minimal env-var expansion for Windows %VAR% style
  if (!p) return p;
  return p.replace(/%([^%]+)%/g, (_, k) => process.env[k] || process.env[k.toUpperCase()] || `%${k}%`);
}

async function safeStat(p) {
  try {
    const st = await fs.stat(p);
    return { exists: true, isFile: st.isFile(), isDir: st.isDirectory(), mtimeMs: Math.floor(st.mtimeMs), size: st.size, mtimeIso: st.mtime.toISOString() };
  } catch {
    return { exists: false };
  }
}

async function countFiles(dir, depth=1) {
  if (depth<0) return null;
  try {
    const entries = await fs.readdir(dir, { withFileTypes:true });
    let c=0;
    for(const e of entries){
      if(e.isFile()) c++;
      else if(e.isDirectory() && depth>0){
        const sub = await countFiles(path.join(dir,e.name), depth-1);
        if(sub!=null) c+=sub;
      }
    }
    return c;
  } catch { return null; }
}

function resolveCacheDir() {
  if (process.env.CRYSTAL_SENTINEL_DIR) return path.resolve(process.env.CRYSTAL_SENTINEL_DIR);
  if (process.env.LOCALAPPDATA) return path.join(process.env.LOCALAPPDATA, 'CrystalFrontend','cache');
  return path.join(os.homedir(),'AppData','Local','CrystalFrontend','cache');
}

function candidateESDE() {
  const cands=[];
  if(process.env.ESDE_APPDATA) cands.push(process.env.ESDE_APPDATA);
  if(process.env.APPDATA) {
    cands.push(path.join(process.env.APPDATA,'ES-DE'));
    cands.push(path.join(process.env.APPDATA,'EmuDeck','ES-DE'));
  }
  cands.push(path.join(os.homedir(),'AppData','Roaming','ES-DE'));
  cands.push(path.join(os.homedir(),'.emulationstation'));
  return [...new Set(cands)];
}

function candidateEmuDeck() {
  const cands=[];
  if(process.env.EMUDECK_ROOT) cands.push(process.env.EMUDECK_ROOT);
  cands.push('C:\\EmuDeck');
  cands.push('D:\\EmuDeck');
  cands.push('D:\\EmuDeck\\Emulation');
  if(process.env.USERPROFILE) cands.push(path.join(process.env.USERPROFILE,'EmuDeck'));
  return [...new Set(cands)];
}

async function loadMachineConfig(configPathHint) {
  let hint = configPathHint || process.env.CRYSTAL_MACHINE_CONFIG;
  const tried=[];
  const tryLoad = async (p) => {
    if(!p) return null;
    tried.push(p);
    try { const txt=await fs.readFile(p,'utf8'); return JSON.parse(txt); } catch { return null; }
  };
  if (hint) {
    let c= await tryLoad(path.resolve(expandWin(hint)));
    if(c) return { config:c, path:path.resolve(expandWin(hint)), tried };
  }
  // search local files portable
  const cwd = process.cwd();
  for(const n of ['crystal-machine-config.json','machine-config.json']) {
    const c = await tryLoad(path.join(cwd,n));
    if(c) return { config:c, path:path.join(cwd,n), tried };
  }
  // LOCALAPPDATA
  const local = process.env.LOCALAPPDATA;
  if(local){
    for(const sub of ['CrystalFrontend\\crystal-machine-config.json','Crystal Frontend\\crystal-machine-config.json']){
      const c = await tryLoad(path.join(local, sub));
      if(c) return { config:c, path:path.join(local,sub), tried };
    }
  }
  return { config:null, path:null, tried };
}

async function collectTargets(opts={}) {
  const { configPath } = opts;
  const { config, path: cfgPath, tried } = await loadMachineConfig(configPath);
  const targets=[];

  const add = async (id, p, extra={}) => {
    const clean = p ? path.normalize(expandWin(p)) : null;
    if(!clean) return;
    const st = await safeStat(clean);
    let fileCount=null;
    if(st.isDir) fileCount = await countFiles(clean, 1);
    targets.push({ id, path: clean, ...st, ...extra });
  };

  // Resolve roots from config if available
  let roots={ gamelists:'', scrapedMedia:'', rom:'' };
  if(config?.roots){
    roots.gamelists = config.roots.gamelists || config.roots.gamelistDir || '';
    roots.scrapedMedia = config.roots.scrapedMedia || '';
    roots.rom = config.roots.rom || '';
  }

  // ES-DE settings
  for(const base of candidateESDE()){
    await add('es-de:settings-xml', path.join(base,'es_settings.xml'), { category:'es-de', note:'ES-DE user settings' });
    await add('es-de:settings-dir', path.join(base,'settings','es_settings.xml'), { category:'es-de' });
    await add('es-de:systems-xml', path.join(base,'custom_systems','es_systems.xml'), { category:'es-de' });
    await add('es-de:es_systems-xml', path.join(base,'es_systems.xml'), { category:'es-de' });
    await add('es-de:es_features-xml', path.join(base,'es_features.xml'), { category:'es-de' });
    await add('es-de:es_find_rules-xml', path.join(base,'es_find_rules.xml'), { category:'es-de' });
    await add('es-de:gamelists-dir', path.join(base,'gamelists'), { category:'gamelists' });
    // themes Crystal
    await add('es-de:themes-crystal', path.join(base,'themes','Crystal'), { category:'theme', note:'stable Crystal theme dir' });
    await add('es-de:themes-crystal-2', path.join(base,'themes','Crystal-Custom'), { category:'theme' });
  }

  // If gamelists root known, scan per-system gamelist.xml
  const sysIds = config?.systems?.map(s=>s.id).filter(Boolean) || ['gb','gbc','gba','nds','n3ds','psp','snes','n64','gc','dreamcast','psx','ps2','xbox','xbox360','wii','wiiu','steam','genesis','megadrive'];
  if(roots.gamelists){
    const rootClean = expandWin(roots.gamelists);
    for(const sid of sysIds) {
      await add(`gamelist:${sid}`, path.join(rootClean, sid, 'gamelist.xml'), { category:'gamelist', system:sid });
    }
  } else {
    // fallback: ES-DE gamelists dir if found
    for(const base of candidateESDE()){
      const gamelistsDir = path.join(base,'gamelists');
      for(const sid of sysIds) {
        await add(`gamelist:${sid}:esde`, path.join(gamelistsDir, sid, 'gamelist.xml'), { category:'gamelist', system:sid });
      }
    }
  }

  // EmuDeck configs
  for(const base of candidateEmuDeck()){
    await add('emudeck:settings-sh', path.join(base,'settings.sh'), { category:'emudeck' });
    await add('emudeck:settings-json', path.join(base,'configs','emudeck.json'), { category:'emudeck' });
    await add('emudeck:emustations-json', path.join(base,'emus.json'), { category:'emudeck' });
    await add('emudeck:tools', path.join(base,'tools'), { category:'emudeck', note:'emu tools dir' });
    await add('emudeck:roms-root', roots.rom || path.join(base,'Emulation','roms'), { category:'rom-root' });
  }

  // Scraped media roots file counts (not ROM hashes – just dir existence)
  if(roots.scrapedMedia){
    for(const sid of sysIds.slice(0,6)){ // limit noise: sample 6 systems for media dir health
      for(const mt of KNOWN_MEDIA_SUBFOLDERS.slice(0,3)){
        await add(`scraped:${sid}:${mt}`, path.join(expandWin(roots.scrapedMedia), sid, mt), { category:'scraped-media' });
      }
    }
  }

  // Crystal app-data logs/cache (own writable area – sentinel must snapshot but never modify externally)
  const cacheDir = resolveCacheDir();
  await add('crystal:cache-dir', cacheDir, { category:'crystal-internal' });
  await add('crystal:logs-dir', path.join(path.dirname(cacheDir),'logs'), { category:'crystal-internal' });

  return { configUsed: cfgPath ? { path: cfgPath, roots } : { tried }, host: os.hostname ? os.hostname() : 'unknown', generatedAt: new Date().toISOString(), targets };
}

export function diffSnapshots(before, after) {
  const beforeMap = new Map((before.targets||[]).map(t=>[t.id+'::'+t.path, t]));
  const afterMap = new Map((after.targets||[]).map(t=>[t.id+'::'+t.path, t]));
  const changes=[];
  const MTIME_TOLERANCE_MS = 1500; // FAT granularity

  for(const [key, a] of afterMap){
    const b = beforeMap.get(key);
    if(!b) { changes.push({ type:'added', key, id:a.id, path:a.path, category:a.category, after:a }); continue; }
    if(!b.exists && !a.exists) continue;
    if(b.exists !== a.exists) { changes.push({ type:'existence-changed', key, id:a.id || b.id, path:a.path || b.path, category:a.category || b.category, before:b, after:a }); continue; }
    const mtimeDelta = Math.abs((a.mtimeMs||0)-(b.mtimeMs||0));
    const sizeChanged = (a.size||0)!==(b.size||0);
    if(mtimeDelta>MTIME_TOLERANCE_MS || sizeChanged){
      changes.push({ type:'modified', key, mtimeDelta, sizeChanged, before:{mtimeMs:b.mtimeMs,size:b.size,mtimeIso:b.mtimeIso}, after:{mtimeMs:a.mtimeMs,size:a.size,mtimeIso:a.mtimeIso,fileCount:a.fileCount}, id:b.id, path:b.path, category:b.category || a.category });
    } else if((b.fileCount!=null || a.fileCount!=null) && b.fileCount!==a.fileCount){
      changes.push({ type:'count-changed', key, id:a.id || b.id, path:a.path || b.path, category:a.category || b.category, before:b, after:a });
    }
  }
  for(const [key,b] of beforeMap){
    if(!afterMap.has(key) && b.exists) changes.push({ type:'removed', key, id:b.id, path:b.path, category:b.category, before:b });
  }

  const unexpected = changes.filter(c=>{
    // Crystal internal cache/logs are expected to change – not unexpected
    if(c.category === 'crystal-internal' && c.id && String(c.id).startsWith('crystal:')) return false;
    return true;
  });

  return { beforeAt:before.generatedAt, afterAt:after.generatedAt, totalBefore:before.targets?.length||0, totalAfter:after.targets?.length||0, changes, unexpectedCount:unexpected.length, unexpected };
}

async function main(){
  const cmd = process.argv[2] || 'snapshot';
  const args = process.argv.slice(3);
  const getArg = (k) => { const i=args.indexOf(k); return i>=0?args[i+1]:null; };
  const hasFlag = (k)=> args.includes(k);

  if(cmd==='snapshot'){
    const configPath = getArg('--config') || getArg('-c');
    const outPath = getArg('--out') || getArg('-o');
    const { targets, ...meta } = await collectTargets({ configPath });
    const payload = { ...meta, targets, env:{ CRYSTAL_MACHINE_CONFIG:process.env.CRYSTAL_MACHINE_CONFIG||null, EMUDECK_ROOT:process.env.EMUDECK_ROOT||null, ESDE_APPDATA:process.env.ESDE_APPDATA||null } };

    if(outPath){
      const dir = path.dirname(path.resolve(outPath));
      await fs.mkdir(dir,{recursive:true});
      await fs.writeFile(path.resolve(outPath), JSON.stringify(payload,null,2),'utf8');
      console.log(`[sentinel] snapshot wrote ${targets.length} targets -> ${path.resolve(outPath)}`);
    } else {
      const cacheDir = resolveCacheDir();
      await fs.mkdir(cacheDir,{recursive:true});
      const def = path.join(cacheDir, `sentinel-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
      const latest = path.join(cacheDir,'sentinel-before.json');
      await fs.writeFile(def, JSON.stringify(payload,null,2),'utf8');
      await fs.writeFile(latest, JSON.stringify(payload,null,2),'utf8');
      console.log(`[sentinel] snapshot ${targets.length} targets`);
      console.log(`  cache : ${def}`);
      console.log(`  latest: ${latest}`);
      // also dump JSON to stdout if --json stdout?
      if(hasFlag('--stdout')) console.log(JSON.stringify(payload,null,2));
    }
    return;
  }

  if(cmd==='diff'){
    let beforePath = args[0];
    let afterPath = args[1];
    if(args.includes('--before')) beforePath=getArg('--before');
    if(args.includes('--after')) afterPath=getArg('--after');
    if(!beforePath||!afterPath){
      console.error('Usage: node tools/sentinel.mjs diff <before.json> <after.json> [--json out-diff.json]');
      process.exit(2);
    }
    const beforeTxt = await fs.readFile(path.resolve(beforePath),'utf8');
    const afterTxt = await fs.readFile(path.resolve(afterPath),'utf8');
    const before = JSON.parse(beforeTxt);
    const after = JSON.parse(afterTxt);
    const report = diffSnapshots(before, after);
    const outJson = getArg('--json');
    console.log(`[sentinel diff] before ${report.totalBefore} targets @ ${report.beforeAt}`);
    console.log(`[sentinel diff] after  ${report.totalAfter} targets @ ${report.afterAt}`);
    console.log(`[sentinel diff] changes ${report.changes.length}, unexpected ${report.unexpectedCount}`);
    for(const ch of report.changes.slice(0,50)){
      if(ch.type==='modified'){
        console.log(`  MOD ${ch.id} ${ch.path} mtimeΔ ${ch.mtimeDelta}ms sizeChanged=${ch.sizeChanged}`);
      } else {
        console.log(`  ${ch.type.toUpperCase()} ${ch.key}`);
      }
    }
    if(report.unexpectedCount>0){
      console.log('\nUNEXPECTED (outside Crystal app-data):');
      for(const u of report.unexpected.slice(0,30)){
        console.log(`  ! ${u.type} ${u.path||u.key}`);
      }
      console.log('\n=> Safe-mode FAILED sentinel check – external files were touched. Restore from backup.');
    } else {
      console.log('\n=> Safe-mode PASSED – no external ES-DE/EmuDeck/gamelist changes detected.');
    }
    if(outJson){
      await fs.writeFile(path.resolve(outJson), JSON.stringify(report,null,2),'utf8');
      console.log(`[sentinel] diff JSON -> ${path.resolve(outJson)}`);
    }
    if(report.unexpectedCount>0) process.exit(1);
    return;
  }

  console.error('Unknown command – use snapshot|diff');
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
