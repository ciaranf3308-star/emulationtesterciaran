import { buildDetailUrl } from './vimmRoutes';
import { VIMM_PARSER_VERSION_SEARCH, VIMM_PARSER_VERSION_DETAIL } from './types';

export class ParserErrorThrown extends Error {
  provider = 'vimms'
  routeType: 'search'|'detail'
  parserVersion: string
  httpStatus: number
  selectorHint?: string
  constructor(message:string, routeType:'search'|'detail', parserVersion:string, httpStatus=200, selectorHint?:string){
    super(message);
    this.name = 'ParserError';
    this.routeType = routeType;
    this.parserVersion = parserVersion;
    this.httpStatus = httpStatus;
    this.selectorHint = selectorHint;
  }
}

function makeSearchError(msg:string, hint?:string): ParserErrorThrown {
  return new ParserErrorThrown(msg, 'search', VIMM_PARSER_VERSION_SEARCH, 200, hint);
}
function makeDetailError(msg:string, hint?:string): ParserErrorThrown {
  return new ParserErrorThrown(msg, 'detail', VIMM_PARSER_VERSION_DETAIL, 200, hint);
}

type DiscoveryResultLite = any;
type DiscoveryDetailLite = any;

function extractYear(text:string): number|undefined {
  const m = text.match(/\b(19\d{2}|20[0-2]\d|2030|203[0-5])\b/);
  if(m){ const y=parseInt(m[0],10); if(y>=1970 && y<=2035) return y; }
  return undefined;
}

export function parseSearchHtml(html:string, crystalSystemId:string, vimmSystemToken:string): DiscoveryResultLite[] {
  if (!html || typeof html !== 'string') throw makeSearchError('Empty HTML','html non-empty');

  // Try result-row blocks (fixtures and robust)
  const rowRe = /<div[^>]*class=["'][^"']*result-row[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
  const rows: string[] = [];
  let rm: RegExpExecArray|null;
  while((rm=rowRe.exec(html))!==null){
    rows.push(rm[1]);
  }

  if(rows.length>0){
    const results:any[]=[];
    for(const inner of rows){
      const aMatch = inner.match(/href=["']\/vault\/(\d+)["'][^>]*>([^<]{1,200}?)<\/a>/i);
      if(!aMatch) continue;
      const id=aMatch[1];
      const titleRaw=aMatch[2].trim().replace(/\s+/g,' ');
      const title=titleRaw.slice(0,200);
      // region
      let region: string|undefined;
      const regionMatch = inner.match(/class=["'][^"']*region[^"']*["'][^>]*>([^<]{1,30}?)<\/span>/i);
      if(regionMatch){ region = regionMatch[1].trim().slice(0,30); }
      // year
      let year: number|undefined;
      const yearMatch = inner.match(/class=["'][^"']*year[^"']*["'][^>]*>([^<]{1,10}?)<\/span>/i);
      if(yearMatch){
        const ym = yearMatch[1].match(/\d+/);
        if(ym) year = parseInt(ym[0],10);
      }
      if(!year) year = extractYear(inner);

      results.push({
        provider:'vimms',
        providerId:id,
        id:id,
        systemId:crystalSystemId,
        externalSystem:vimmSystemToken,
        title,
        region,
        year,
        externalUrl: buildDetailUrl(id),
        availability:'available'
      });
    }
    if(results.length>0) return results;
    // if rows but none parsed – continue to fallback
  }

  const lower = html.toLowerCase();
  if(lower.includes('no results') || lower.includes('no games found') || lower.includes('0 results')){
    return [];
  }

  // generic vault href extraction fallback (supports live site)
  const vaultRe = /href=["']\/vault\/(\d+)["'][^>]*>([^<]{1,200}?)<\/a>/gi;
  const matches:any[]=[];
  let gm: RegExpExecArray|null;
  while((gm=vaultRe.exec(html))!==null){
    const id=gm[1];
    const title=gm[2].trim().replace(/\s+/g,' ').slice(0,200);
    const pos=html.indexOf(`/vault/${id}`);
    const ctx = pos>=0? html.slice(pos, pos+900):'';
    const yr=extractYear(ctx);
    matches.push({
      provider:'vimms',
      providerId:id,
      id,
      systemId:crystalSystemId,
      externalSystem:vimmSystemToken,
      title: title||`Game ${id}`,
      year: yr,
      externalUrl: buildDetailUrl(id),
      availability:'available'
    });
  }
  if(matches.length>0){
    const uniq=new Map<string,any>();
    for(const r of matches) if(!uniq.has(r.providerId)) uniq.set(r.providerId,r);
    return Array.from(uniq.values());
  }

  // malformed detection
  if(lower.includes('vault')){
    // vault marker but no results – treat as zero?
    // if page has vault-results or vault-detail marker but empty, zero is okay
    if(lower.includes('vault-results') || lower.includes('vault-detail')){
      return [];
    }
  }

  // Check if completely unrelated page – throw
  if(!lower.includes('/vault/')){
    throw makeSearchError('Vimm search format changed – no vault anchors found','a[href*="/vault/"] result-row');
  }

  throw makeSearchError('Vimm search format changed – regex found no vault entries','href="/vault/{id}" result-row');
}

export function parseDetailHtml(html:string, crystalSystemId:string, vimmSystemToken:string, detailId:string): DiscoveryDetailLite {
  if(!html || typeof html!=='string') throw makeDetailError('Empty HTML detail','html non-empty');

  const lower = html.toLowerCase();
  // takedown detection first – preserve even if minimal
  const isTakedown = lower.includes('no longer available') || lower.includes('publisher request') || lower.includes('takedown') || lower.includes('taken down') || lower.includes('dmca');
  if(!lower.includes('vault-detail') && !lower.includes('vault-title')){
    // page might be malformed – throw schema change
    throw makeDetailError('Vimm detail format changed – vault-detail missing','.vault-detail vault-title');
  }

  const titleMatch = html.match(/<h1[^>]*class=["'][^"']*vault-title[^"']*["'][^>]*>([^<]{1,300}?)<\/h1>/i);
  const title = titleMatch ? titleMatch[1].trim().replace(/\s+/g,' ') : `Game ${detailId}`;

  // system
  let systemToken: string|undefined;
  const sysMatch = html.match(/<span[^>]*class=["'][^"']*system[^"']*["'][^>]*>([^<]{1,30}?)<\/span>/i);
  if(sysMatch) systemToken = sysMatch[1].trim().slice(0,30);
  // region
  let region: string|undefined;
  const regMatch = html.match(/<span[^>]*class=["'][^"']*region[^"']*["'][^>]*>([^<]{1,30}?)<\/span>/i);
  if(regMatch) region = regMatch[1].trim().slice(0,30);
  // year
  let year: number|undefined;
  const yearMatches = [...html.matchAll(/<span[^>]*class=["'][^"']*year[^"']*["'][^>]*>([^<]{1,10}?)<\/span>/gi)];
  if(yearMatches.length>0){
    const last = yearMatches[yearMatches.length-1][1];
    const ym = last.match(/\d+/);
    if(ym) year = parseInt(ym[0],10);
  }
  if(!year) year = extractYear(html);

  // thumbnail
  let thumb: string|undefined;
  const thumbMatch = html.match(/<img[^>]*class=["'][^"']*thumb[^"']*["'][^>]*src=["']([^"']+)["']/i) || html.match(/<img[^>]+src=["']([^"']*vault[^"']*thumb[^"']*)["']/i) || html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if(thumbMatch) {
    const cand = thumbMatch[1];
    try{
      const u = new URL(cand,'https://vimm.net');
      if(u.protocol==='https:') thumb = u.toString().slice(0,500);
    }catch{}
  }

  // availability
  let availability: 'available'|'unavailable'|'takedown' = 'available';
  if(isTakedown) availability='takedown';
  else if(lower.includes('download not available')||lower.includes('not available')||lower.includes('unavailable')) availability='unavailable';

  // description
  let description: string|undefined;
  const descMatch = html.match(/<div[^>]*class=["'][^"']*description[^"']*["'][^>]*>([\s\S]{1,2000}?)<\/div>/i);
  if(descMatch) description = descMatch[1].trim().replace(/\s+/g,' ').slice(0,2000);

  // disc count via data-discs attribute
  let discCount: number|undefined;
  const discsAttr = html.match(/data-discs=["'](\d+)["']/i);
  if(discsAttr) {
    const n=parseInt(discsAttr[1],10);
    if(!isNaN(n)&&n>=1&&n<=10) discCount=n;
  }
  if(!discCount){
    const discTextMatch = html.match(/(\d+)\s*Discs?/i);
    if(discTextMatch) discCount=parseInt(discTextMatch[1],10);
  }

  // publisher/developer etc extras
  let publisher: string|undefined;
  const pubMatch = html.match(/<span[^>]*class=["'][^"']*publisher[^"']*["'][^>]*>([^<]{1,80}?)<\/span>/i);
  if(pubMatch) publisher = pubMatch[1].trim();

  let developer: string|undefined;
  const devMatch = html.match(/<span[^>]*class=["'][^"']*developer[^"']*["'][^>]*>([^<]{1,80}?)<\/span>/i);
  if(devMatch) developer = devMatch[1].trim();

  return {
    provider:'vimms',
    providerId:detailId,
    id:detailId,
    systemId:crystalSystemId,
    externalSystem: systemToken || vimmSystemToken || 'unknown',
    externalSystemToken: systemToken || vimmSystemToken,
    title,
    region,
    year,
    publisher,
    developer,
    thumbnailUrl: thumb,
    availability,
    description,
    discCount,
    externalUrl: buildDetailUrl(detailId)
  };
}

export function parseTakedownCheck(html:string): boolean {
  const low=(html||'').toLowerCase();
  return low.includes('no longer available')||low.includes('publisher request')||low.includes('takedown')||low.includes('taken down')||low.includes('dmca');
}
