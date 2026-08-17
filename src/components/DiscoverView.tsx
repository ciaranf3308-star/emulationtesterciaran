/**
 * Crystal Discover V3.1 – Recommendations + Tabs
 * Adds For You / Trending / New tabs (local scoring) + Browse (Vimm catalog) preserving V3 resilience
 * No server ML – all local scoring in src/lib/recommendations.ts
 */

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import type { GameEntry } from '../runtime/backend'
import discoveryService, { type DiscoveryResult } from '../lib/discoveryService'
import { isInLibrary, normalizeTitle } from '../lib/discoveryMatching'
import { toAssetUrl } from '../runtime/mediaUrl'
import SystemLogo from './SystemLogo'
import { recommendForUser, getTrending, getNewReleases } from '../lib/recommendations'
import { getCuratedCrossSystemTop } from '../data/curatedPopular'

type Tab = 'foryou' | 'trending' | 'new' | 'browse'

export type BeginAcquisitionRequest = {
  systemId: string
  expectedTitle: string
  openExternalPage: () => Promise<void>
}

type DiscoverProps = {
  systemId: string
  systemFullName: string
  theme: 'light' | 'dark'
  backgroundUrl?: string | null
  logoUrl?: string | null
  onBack: () => void
  selectedLocalGame?: GameEntry | null
  libraryGames?: GameEntry[] | null
  allGames?: GameEntry[] | null
  favorites?: GameEntry[] | null
  recentGames?: GameEntry[] | null
  onOpenDiscoverGame?: (id: string) => void
  onBeginAcquisition?: (request: BeginAcquisitionRequest) => unknown
  acquisitionActive?: boolean
  acquisitionPhase?: string | null
  discoveryQueue?: DiscoveryResult[]
  onDiscoveryQueueChange?: (q: DiscoveryResult[]) => void
  onSelectLibraryGame?: (game: GameEntry) => void
}

const PROVIDER_NAVIGATION_TITLES = new Set([
  'atari 2600','atari 5200','atari 7800','nintendo','super nintendo',
  'nintendo 64','nintendo ds','nintendo 3ds','game boy','game boy color',
  'game boy advance','gamecube','wii','wii u','sega 32x','master system',
  'genesis','dreamcast','playstation','playstation 2','playstation 3',
  'playstation portable','xbox','xbox 360','the vault','emulation lair',
])

function removeProviderNavigationRows(items: any[]): any[] {
  return items.filter(item => !PROVIDER_NAVIGATION_TITLES.has(normalizeTitle(String(item?.title || ''))))
}

type ProviderHealth = { status: 'live' | 'cached' | 'slow'; lastSuccessMs?: number; lastFailReason?: string; lastParseCount?: number }

export function DiscoverView({
  systemId,
  systemFullName,
  theme,
  backgroundUrl,
  logoUrl,
  onBack,
  selectedLocalGame,
  libraryGames,
  allGames,
  favorites,
  recentGames,
  onBeginAcquisition,
  acquisitionActive,
  discoveryQueue: externalQueue,
  onDiscoveryQueueChange,
  onSelectLibraryGame,
}: DiscoverProps) {
  const isDark = theme === 'dark'
  const searchInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const gridColumns = useCallback(()=> Math.max(1, Math.floor(((containerRef.current?.clientWidth || 900)+12)/257)), [])

  const [activeTab, setActiveTab] = useState<Tab>('foryou')

  const prefill = useMemo(()=>{
    if (selectedLocalGame?.name) return selectedLocalGame.name
    try {
      if (typeof window!=='undefined') {
        const w=window as any
        if (w.__crystal_discover_prefill_q) return String(w.__crystal_discover_prefill_q)
        const sp=new URLSearchParams(window.location.search)
        const q=sp.get('q')
        if (q) return q
      }
    } catch {}
    return ''
  },[selectedLocalGame])

  const [query,setQuery]=useState(prefill)
  const [debounced,setDebounced]=useState(prefill)
  const [browseLetter,setBrowseLetter]=useState('FEATURED')
  const [results,setResults]=useState<any[]>([])
  const [total,setTotal]=useState(0)
  const [searching,setSearching]=useState(false)
  const [offline,setOffline]=useState(false)
  const [schemaChanged,setSchemaChanged]=useState(false)
  const [errorMsg,setErrorMsg]=useState<string|null>(null)
  const [focusedIdx,setFocusedIdx]=useState(0)
  const browseOptions=useMemo(()=>['FEATURED',...'#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')],[])
  const [focusZone,setFocusZone]=useState<'search'|'browse'|'grid'>('grid')
  const [focusedBrowseIdx,setFocusedBrowseIdx]=useState(0)
  const [selectedDetail,setSelectedDetail]=useState<DiscoveryResult|null>(null)
  const [showDetailPanel,setShowDetailPanel]=useState(false)
  const [detailResolving,setDetailResolving]=useState(false)
  const [detailFull,setDetailFull]=useState<any>(null)
  const [localCoverUrls,setLocalCoverUrls]=useState<Record<string,string>>({})

  const [providerHealth,setProviderHealth]=useState<ProviderHealth>({status:'cached'})
  const [cacheInfo,setCacheInfo]=useState<{source:'cache'|'live'|null; timestamp:number|null; fresh:boolean}>({source:null,timestamp:null,fresh:false})
  const [internalQueue,setInternalQueue]=useState<DiscoveryResult[]>([])
  const effectiveQueue=externalQueue ?? internalQueue
  const setEffectiveQueue=useCallback((next:DiscoveryResult[])=>{
    if (onDiscoveryQueueChange) onDiscoveryQueueChange(next)
    else setInternalQueue(next)
  },[onDiscoveryQueueChange])

  const [toast,setToast]=useState<string|null>(null)
  const toastTimer=useRef<number|null>(null)
  const showToast=useCallback((msg:string)=>{
    setToast(msg)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current=window.setTimeout(()=>setToast(null),2200) as any
  },[])

  const abortRef=useRef<AbortController|null>(null)

  // local recs
  const all = useMemo(()=> (allGames && allGames.length ? allGames : (libraryGames||[])) as GameEntry[], [allGames, libraryGames])
  const favs = useMemo(()=> (favorites || all.filter((g:any)=> (g as any).favorite)) as GameEntry[], [favorites, all])
  const last10 = useMemo(()=>{
    if (recentGames && recentGames.length) return recentGames.slice(0,10) as GameEntry[]
    const sorted=[...all].sort((a:any,b:any)=>{
      const am=(a as any).last_played||(a as any).lastplayed||''
      const bm=(b as any).last_played||(b as any).lastplayed||''
      return String(bm).localeCompare(String(am))
    })
    return sorted.slice(0,10) as GameEntry[]
  },[recentGames, all])

  const forYouRecs = useMemo(()=> {
    try { return recommendForUser(all as any, favs as any, last10 as any, getCuratedCrossSystemTop(20)) } catch { return [] }
  },[all,favs,last10])
  const trendingRecs = useMemo(()=> {
    try { return getTrending(all as any, getCuratedCrossSystemTop(20)) } catch { return [] }
  },[all])
  const newRecs = useMemo(()=> {
    try { return getNewReleases(all as any) } catch { return [] }
  },[all])

  useEffect(()=>{ if (prefill && prefill!==query){ setQuery(prefill); setDebounced(prefill)} },[prefill])

  const activateBrowse=useCallback((index:number)=>{
    const next=browseOptions[Math.max(0,Math.min(browseOptions.length-1,index))]
    setQuery(''); setBrowseLetter(next); setFocusedBrowseIdx(index); setFocusedIdx(0); setFocusZone('grid')
  },[browseOptions])

  useEffect(()=>{ const h=setTimeout(()=>setDebounced(query.trim()),340); return()=>clearTimeout(h)},[query])
  useEffect(()=>{ setFocusedIdx(0)},[debounced, results.length])

  useEffect(()=>{
    let cancelled=false
    void (async()=>{
      const pairs=await Promise.all((libraryGames||[]).filter(g=>g.cover_path).map(async g=>{
        const url=await toAssetUrl(g.cover_path)
        return [normalizeTitle(g.name), url] as const
      }))
      if (cancelled) return
      const next:Record<string,string>={}
      for (const [k,url] of pairs) if (k&&url) next[k]=url
      setLocalCoverUrls(next)
    })()
    return()=>{ cancelled=true }
  },[libraryGames])

  // focused thumb resolve (browse only)
  useEffect(()=>{
    if (focusZone!=='grid' || activeTab!=='browse') return
    const focused=results[focusedIdx]
    if (!focused || focused.thumbnailUrl || (focused as any).thumbUrl) return
    let cancelled=false
    const timer=window.setTimeout(async()=>{
      try{
        const detail=await discoveryService.detail(String(focused.id||focused.providerId), systemId)
        const thumbnailUrl=(detail as any)?.thumbnailUrl
        if (cancelled||!thumbnailUrl) return
        setResults(cur=>cur.map((it,idx)=> idx===focusedIdx ? {...it, thumbnailUrl}:it))
      }catch{}
    },420)
    return()=>{ cancelled=true; window.clearTimeout(timer)}
  },[focusZone,focusedIdx,results,systemId,activeTab])

  const resolveCoverUrl=useCallback((r:any):string|null=>{
    const normalized=normalizeTitle(String(r?.title||''))
    if (normalized && localCoverUrls[normalized]) return localCoverUrls[normalized]
    if (r?.thumbnailUrl) return r.thumbnailUrl
    if (r?.thumbUrl) return r.thumbUrl
    if (backgroundUrl) return backgroundUrl
    return null
  },[localCoverUrls, backgroundUrl])

  const performSearch=useCallback(async(forceRefresh=false)=>{
    if (activeTab!=='browse') return
    if (abortRef.current) try{ abortRef.current.abort()}catch{}
    const ac=new AbortController(); abortRef.current=ac
    setSearching(true); setOffline(false); setSchemaChanged(false); setErrorMsg(null)
    try{
      let metaRes:any
      try{
        if ((discoveryService as any).searchWithMeta){
          const sw=await (discoveryService as any).searchWithMeta({ systemId, query:debounced, browseLetter:debounced?undefined:browseLetter, limit:48, signal:ac.signal, forceRefresh })
          metaRes=sw
        } else {
          const basic=await discoveryService.search({ systemId, query:debounced, browseLetter:debounced?undefined:browseLetter, limit:48, signal:ac.signal, forceRefresh: forceRefresh as any } as any)
          metaRes={ results:basic, source:forceRefresh?'live':'live', timestamp:Date.now(), fresh:true, providerHealth:{ status:forceRefresh?'live':'cached' } }
        }
      } catch(e:any){
        if (e?.providerHealth) setProviderHealth(e.providerHealth)
        const maybe=e?.error?.message||e?.message
        if (/parse|selector/i.test(String(maybe))){
          try{
            const fallback=await discoveryService.search({ systemId, query:debounced, browseLetter:debounced?undefined:browseLetter, limit:48 } as any)
            metaRes={ results:fallback, source:'cache', timestamp:Date.now(), fresh:false, providerHealth:{ status:'slow', lastFailReason:String(maybe).slice(0,120)}}
          }catch{ throw e?.error||e }
        } else throw e?.error||e
      }
      if (ac.signal.aborted) return
      const list=metaRes.results||metaRes
      if (Array.isArray(list)){
        const clean=removeProviderNavigationRows(list)
        setResults(clean); setTotal(clean.length)
        setCacheInfo({ source:(metaRes as any).source||null, timestamp:(metaRes as any).timestamp||null, fresh:(metaRes as any).fresh??true })
        if ((metaRes as any).providerHealth) setProviderHealth((metaRes as any).providerHealth)
        else {
          const healthSrc=(metaRes as any).source
          if (healthSrc==='cache') setProviderHealth(h=>({...h,status:'cached'}))
          else if (healthSrc==='live') setProviderHealth({status:'live', lastSuccessMs:Date.now(), lastParseCount:clean.length})
        }
        setOffline(false); setSchemaChanged(false); return
      }
      if (Array.isArray((metaRes as any).results)){
        const clean=removeProviderNavigationRows((metaRes as any).results)
        setResults(clean); setTotal(clean.length)
        setCacheInfo({ source:(metaRes as any).source||null, timestamp:(metaRes as any).timestamp||null, fresh:(metaRes as any).fresh??false })
        if ((metaRes as any).providerHealth) setProviderHealth((metaRes as any).providerHealth)
        return
      }
      const resObj=metaRes as any
      const clean=removeProviderNavigationRows(resObj.results||[])
      setResults(clean); setTotal(clean.length)
      setOffline(!!resObj.offline); setSchemaChanged(!!resObj.schemaChanged)
      if (resObj.error && !resObj.offline && !resObj.schemaChanged) setErrorMsg(resObj.error)
      setCacheInfo({ source:resObj.source||null, timestamp:resObj.timestamp||null, fresh:true })
    }catch(e:any){
      if (e?.name==='AbortError') return
      const msg=e?.message||String(e)
      if (/offline|network/i.test(msg)){ setOffline(true); setProviderHealth(h=>({...h,status:'slow',lastFailReason:'offline/network'})) }
      else if (/schema/i.test(msg)) setSchemaChanged(true)
      else setErrorMsg(msg)
    } finally { if (abortRef.current===ac) setSearching(false) }
  },[debounced,browseLetter,systemId,activeTab])

  useEffect(()=>{ if (activeTab==='browse'){ performSearch(false); return ()=>{ try{ abortRef.current?.abort()}catch{} } } },[performSearch,activeTab])

  const refreshBypass=useCallback(()=>{ performSearch(true); showToast('Refreshing…') },[performSearch,showToast])

  const inLibraryCheck=useCallback((title:string)=>{
    if (!libraryGames) return false
    return isInLibrary(title, systemId, libraryGames as any)
  },[libraryGames,systemId])

  const handleOpenVaultRoot=useCallback(async()=>{
    try{ await (discoveryService as any).openRoot?.() } catch { try{ window.open('https://vimm.net/vault','_blank')}catch{} }
  },[])

  async function openDetail(r:DiscoveryResult){
    setSelectedDetail(r); setShowDetailPanel(true); setDetailFull(null); setDetailResolving(true)
    try{ const d=await discoveryService.detail(r.id, systemId); setDetailFull(d) } catch{ setDetailFull(null) } finally{ setDetailResolving(false) }
  }

  const startInFlightRef=useRef(false)
  const currentAvailability=(detailFull as any)?.availability ?? selectedDetail?.availability ?? null
  const currentDetailTitle=(detailFull as any)?.title ?? selectedDetail?.title ?? ''
  const alreadyInLibraryForDetail=useMemo(()=>{
    const t=String(currentDetailTitle||'').trim()
    if (!t) return false
    return inLibraryCheck(t)
  },[currentDetailTitle,inLibraryCheck])
  const canGetGame=useMemo(()=> currentAvailability==='available' && !alreadyInLibraryForDetail,[currentAvailability,alreadyInLibraryForDetail])

  useEffect(()=>{ if (!acquisitionActive) startInFlightRef.current=false },[acquisitionActive,showDetailPanel])

  const handleGetGame=useCallback((provider:'vimm'|'romsfun'='vimm')=>{
    if (acquisitionActive) return
    if (startInFlightRef.current) return
    if (!onBeginAcquisition) return
    if (!canGetGame) return
    const rawProviderId=detailFull?.providerId ?? (detailFull as any)?.id ?? selectedDetail?.providerId ?? selectedDetail?.id
    if (rawProviderId==null){ setErrorMsg('Missing provider id'); return }
    const idStr=String(rawProviderId).trim()
    const isRomsFunSlug=idStr.includes('/') && !idStr.includes('://') && !idStr.includes('..') && !idStr.startsWith('/') && !idStr.startsWith('\\')
    if (!isRomsFunSlug && !/^\d+$/.test(idStr)){ setErrorMsg(`Provider id must be slug/numeric – got '${idStr.slice(0,48)}'`); return }
    const titleRaw=detailFull?.title ?? selectedDetail?.title ?? ''
    const expectedTitle=String(titleRaw).trim()
    if (!expectedTitle){ setErrorMsg('Could not determine title'); return }
    const openExternalPage=()=>discoveryService.open(idStr)
    const openRomsFunBackupPage=()=>discoveryService.openRomsFunBackup(systemId, expectedTitle)
    startInFlightRef.current=true
    try{
      onBeginAcquisition({ systemId, expectedTitle, openExternalPage: provider==='vimm'?openExternalPage:openRomsFunBackupPage })
      setShowDetailPanel(false); setSelectedDetail(null); setDetailFull(null)
    }catch(e:any){
      startInFlightRef.current=false
      const code=e?.code||e?.message
      if (code==='EXTERNAL_ACQUISITION_ALREADY_ACTIVE'||code==='PROVIDER_SURFACE_ALREADY_ACTIVE') setErrorMsg('Acquisition already active')
      else setErrorMsg(code?String(code).slice(0,140):'Could not start acquisition')
    }
  },[acquisitionActive,canGetGame,detailFull,selectedDetail,systemId,onBeginAcquisition,alreadyInLibraryForDetail,currentAvailability])

  const queueSelected=useCallback((r?:DiscoveryResult)=>{
    const candidate=r ?? (focusZone==='grid'? results[focusedIdx] : selectedDetail) as any
    if (!candidate) return
    const current=effectiveQueue
    if (current.some(x=>String(x.id)===String(candidate.id))){ showToast(`Already queued • ${current.length}/4`); return }
    if (current.length>=4){ showToast('Queue full • 4/4 max'); return }
    const next=[...current,candidate]
    setEffectiveQueue(next)
    showToast(`Queued ${next.length}/4`)
  },[results,focusedIdx,focusZone,selectedDetail,effectiveQueue,setEffectiveQueue,showToast])

  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      const target=e.target as HTMLElement|null
      const isTyping=!!target && (target.tagName==='INPUT'||target.tagName==='TEXTAREA'||(target as any).isContentEditable)
      if (isTyping) return
      if (acquisitionActive){ e.preventDefault(); return }
      if (showDetailPanel){
        if (e.key==='Escape'||e.key==='Backspace'){ e.preventDefault(); setShowDetailPanel(false); setSelectedDetail(null); return }
        if (e.key==='Enter'||e.key===' '){ e.preventDefault(); if (canGetGame) handleGetGame(); return }
        if (e.key.toLowerCase()==='y'||e.key.toLowerCase()==='f'){ e.preventDefault(); queueSelected(selectedDetail as any); return }
      } else {
        if (e.key==='Escape'||e.key==='Backspace'){ e.preventDefault(); onBack(); return }
        if (e.key==='ArrowUp'||e.key==='w'||e.key==='k'){
          e.preventDefault()
          if (focusZone==='grid' && focusedIdx < gridColumns() && !debounced) setFocusZone('browse')
          else if (focusZone==='grid') setFocusedIdx(i=>Math.max(0,i-gridColumns()))
          else if (focusZone==='browse'){ setFocusZone('search'); searchInputRef.current?.focus() }
          return
        }
        if (e.key==='ArrowDown'||e.key==='s'||e.key==='j'){
          e.preventDefault()
          if (focusZone!=='grid'){ searchInputRef.current?.blur(); setFocusZone(debounced?'grid': focusZone==='search'?'browse':'grid') }
          else setFocusedIdx(i=>Math.min(Math.max(results.length-1,0), i+gridColumns()))
          return
        }
        if ((e.key==='ArrowLeft'||e.key==='ArrowRight') && focusZone==='browse'){
          e.preventDefault()
          setFocusedBrowseIdx(i=>Math.max(0,Math.min(browseOptions.length-1, i+(e.key==='ArrowRight'?1:-1))))
          return
        }
        if (e.key==='Enter'||e.key===' '){
          e.preventDefault()
          if (focusZone==='browse') activateBrowse(focusedBrowseIdx)
          else { const r=results[focusedIdx]; if (r) openDetail(r) }
          return
        }
        if (e.key==='x'||e.key==='X'){ e.preventDefault(); if (activeTab==='browse') refreshBypass(); return }
        if (e.key.toLowerCase()==='y'||e.key.toLowerCase()==='f'){ e.preventDefault(); queueSelected(); return }
        if (e.key.toLowerCase()==='r'){ e.preventDefault(); if (activeTab==='browse') refreshBypass(); return }
      }
    }
    const onDiscoverNav=(ev:any)=>{
      if (acquisitionActive) return
      const action=ev?.detail as string
      if (!action) return
      if (showDetailPanel){
        if (action==='back'||action==='menu'){ setShowDetailPanel(false); setSelectedDetail(null); return }
        if (action==='confirm'){ if (canGetGame) handleGetGame(); return }
        if (action==='favorite'||action==='queue'){ queueSelected(selectedDetail as any); return }
        if (action==='media'||action==='refresh'){ if (activeTab==='browse') refreshBypass(); return }
        return
      } else {
        if (action==='up'){
          if (focusZone==='grid' && focusedIdx < gridColumns() && !debounced) setFocusZone('browse')
          else if (focusZone==='grid') setFocusedIdx(i=>Math.max(0,i-gridColumns()))
          else if (focusZone==='browse'){ setFocusZone('search'); searchInputRef.current?.focus() }
        } else if (action==='down'){
          if (focusZone!=='grid'){ searchInputRef.current?.blur(); setFocusZone(debounced?'grid': focusZone==='search'?'browse':'grid') }
          else setFocusedIdx(i=>Math.min(Math.max(results.length-1,0), i+gridColumns()))
        } else if (action==='left'){
          if (focusZone==='browse') setFocusedBrowseIdx(i=>Math.max(0,i-1))
          else setFocusedIdx(i=>Math.max(0,i-1))
        } else if (action==='right'){
          if (focusZone==='browse') setFocusedBrowseIdx(i=>Math.min(browseOptions.length-1,i+1))
          else setFocusedIdx(i=>Math.min(Math.max(results.length-1,0), i+1))
        } else if (action==='confirm'){
          if (focusZone==='browse') activateBrowse(focusedBrowseIdx)
          else if (focusZone==='search') searchInputRef.current?.focus()
          else { const r=results[focusedIdx]; if (r) openDetail(r) }
        } else if (action==='search'){ setFocusZone('search'); try{ searchInputRef.current?.focus()}catch{} }
        else if (action==='back'||action==='menu'){ onBack() }
        else if (action==='favorite'||action==='queue'){ queueSelected() }
        else if (action==='media'||action==='refresh'){ if (activeTab==='browse') refreshBypass() }
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('crystal-discover-nav' as any, onDiscoverNav)
    return()=>{ window.removeEventListener('keydown', onKey); window.removeEventListener('crystal-discover-nav' as any, onDiscoverNav) }
  },[results,focusedIdx,focusedBrowseIdx,focusZone,browseOptions.length,debounced,showDetailPanel,onBack,selectedDetail,detailFull,handleGetGame,canGetGame,acquisitionActive,gridColumns,activateBrowse,queueSelected,refreshBypass,activeTab])

  const resultCountLabel=useMemo(()=>{
    if (activeTab!=='browse'){
      if (activeTab==='foryou') return `${forYouRecs.length} recommended`
      if (activeTab==='trending') return `${trendingRecs.length} trending`
      if (activeTab==='new') return `${newRecs.length} new for you`
      return ''
    }
    if (searching) return 'searching…'
    if (!debounced) return `${results.length} games • ${browseLetter}`
    return `${total||results.length} results`
  },[searching,debounced,browseLetter,total,results.length,activeTab,forYouRecs,trendingRecs,newRecs])

  const providerPillStyle=useMemo(()=>{
    const status=providerHealth.status
    if (status==='live') return { bg:'rgba(71,255,150,0.16)', border:'rgba(71,255,150,0.28)', fg:isDark?'#b9ffcf':'#0d6a2a', label:'● LIVE' }
    if (status==='cached') return { bg:'rgba(255,214,90,0.14)', border:'rgba(255,214,90,0.24)', fg:isDark?'#ffd85a':'#8a5a00', label:'◑ CACHED' }
    return { bg:'rgba(255,120,120,0.14)', border:'rgba(255,120,120,0.22)', fg:isDark?'#ff9a9a':'#8a2e2e', label:'◎ SLOW' }
  },[providerHealth,isDark])

  const showCachedBadge=cacheInfo.source==='cache' && cacheInfo.fresh && cacheInfo.timestamp && (Date.now()-cacheInfo.timestamp < 24*3600*1000)

  // tab style helper
  const tabBtn=(id:Tab,label:string)=> {
    const active=id===activeTab
    return (
      <button
        key={id}
        onClick={()=>setActiveTab(id)}
        data-active={active?'1':'0'}
        style={{
          appearance:'none',
          padding:'7px 14px',
          borderRadius:999,
          border:`1px solid ${active ? (isDark?'rgba(125,249,255,0.42)':'rgba(70,130,255,0.34)') : (isDark?'rgba(255,255,255,0.10)':'rgba(18,26,44,0.10)')}`,
          background:active ? (isDark?'rgba(125,249,255,0.14)':'rgba(70,130,255,0.14)') : (isDark?'rgba(255,255,255,0.04)':'rgba(255,255,255,0.62)'),
          color:active ? (isDark?'#c8fcff':'#1d3a88') : (isDark?'rgba(230,244,255,0.72)':'rgba(18,26,44,0.68)'),
          fontFamily:'var(--crystal-mono)', fontSize:10, fontWeight:active?800:600, letterSpacing:'0.06em',
          cursor:'pointer',
        }}
      >
        {label}
      </button>
    )
  }

  const renderLocalCard=(item:any, kind:Tab)=>{
    const g=item.game || item
    const name=(g as any).name || (g as any).rom_basename || item.title || 'Game'
    const system=(g as any).system_id || item.systemId || systemId
    const coverPath=(g as any).cover_path
    const reason=item.reason || (item as any).reason || ''
    // resolve cover async? For now placeholder attempt to use localCoverUrls
    const normTitle=normalizeTitle(String(name))
    const localUrl=localCoverUrls[normTitle]
    return (
      <div
        key={`${system}-${name}-${Math.random()}`}
        onClick={()=>{
          if (kind==='foryou' || kind==='trending' || kind==='new'){
            if (onSelectLibraryGame) { onSelectLibraryGame(g as GameEntry); onBack(); }
            else {
              // try to select in libraryGames pool if exists
              const found=(libraryGames||[]).find((lg:any)=> lg.id=== (g as any).id || lg.rom_basename===(g as any).rom_basename)
              if (found && onSelectLibraryGame) { onSelectLibraryGame(found) }
            }
          }
        }}
        style={{
          display:'flex', minHeight:102, gap:12, padding:'10px 12px', borderRadius:12, cursor:'pointer',
          background:isDark?'rgba(255,255,255,0.03)':'rgba(255,255,255,0.52)',
          border:`1px solid ${isDark?'rgba(255,255,255,0.06)':'rgba(18,26,44,0.06)'}`,
        }}
      >
        {localUrl || coverPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={localUrl || ''} alt="" style={{ width:62, height:78, objectFit:'cover', borderRadius:8, background:'#fff' }} />
        ) : (
          <div style={{ width:62, height:78, borderRadius:8, background:isDark?'linear-gradient(145deg, rgba(125,249,255,.10), rgba(255,255,255,.025))':'linear-gradient(145deg, rgba(70,130,255,.12), rgba(255,255,255,.72))', border:`1px solid ${isDark?'rgba(125,249,255,.12)':'rgba(70,130,255,.12)'}`, display:'grid', placeItems:'center', fontFamily:'var(--crystal-mono)', fontSize:13, fontWeight:800 }}>{String(name).slice(0,2).toUpperCase()}</div>
        )}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:'var(--crystal-display)', fontSize:13.5, fontWeight:700, lineHeight:1.2 }}>{name}</div>
          <div style={{ fontFamily:'var(--crystal-mono)', fontSize:10, opacity:0.62, marginTop:3 }}>{system} { (g as any).genre ? `• ${(g as any).genre}` : ''} { (g as any).play_count ? `• ${(g as any).play_count} plays` : ''}</div>
          {reason && <div style={{ fontFamily:'var(--crystal-mono)', fontSize:10, marginTop:6, color:isDark?'#7df9ff':'#2a4d9e', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{reason}</div>}
          {kind==='foryou' && item.seedId && <div style={{ fontFamily:'var(--crystal-mono)', fontSize:9, opacity:0.56, marginTop:2 }}>seed {(item as any).seedId?.slice(0,12)}</div>}
        </div>
        <div style={{ opacity:0.42, fontSize:11 }}>↗</div>
      </div>
    )
  }

  return (
    <div className="discover-view" data-theme={theme} style={{ position:'absolute', inset:0, overflow:'hidden', background:isDark?'#0a0a0f':'#f6f8fd', color:isDark?'#eef7ff':'#16213e', display:'flex', flexDirection:'column', zIndex:7 }}>
      <div style={{ position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none', zIndex:0 }}>
        {backgroundUrl ? <img src={backgroundUrl} alt="" style={{ position:'absolute', inset:'-6%', width:'112%', height:'112%', objectFit:'cover', filter:'blur(30px) saturate(0.82) brightness(0.68)', transform:'scale(1.06)', opacity:isDark?0.86:0.58 }} /> : <div style={{ position:'absolute', inset:0, background:isDark?'#12131a':'#eceef8' }} />}
        <div style={{ position:'absolute', inset:0, background:isDark?'linear-gradient(180deg, rgba(10,12,18,0.34), rgba(10,12,18,0.52)), radial-gradient(84% 68% at 50% 18%, transparent 8%, rgba(6,9,14,0.42) 72%)':'linear-gradient(180deg, rgba(250,252,255,0.64), rgba(240,244,255,0.72)), radial-gradient(84% 66% at 50% 22%, transparent 10%, rgba(234,238,248,0.42) 70%)' }} />
      </div>

      <div style={{ height:84, minHeight:84, flexShrink:0, zIndex:2, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 22px', borderBottom:`1px solid ${isDark?'rgba(255,255,255,0.06)':'rgba(18,26,44,0.06)'}`, backdropFilter:'blur(22px) saturate(1.12)', background:isDark?'rgba(10,12,18,0.32)':'rgba(255,255,255,0.54)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={onBack} style={{ appearance:'none', background:isDark?'rgba(255,255,255,0.06)':'rgba(255,255,255,0.82)', border:`1px solid ${isDark?'rgba(255,255,255,0.10)':'rgba(18,26,44,0.10)'}`, borderRadius:999, width:34, height:34, display:'grid', placeItems:'center', cursor:'pointer', color:isDark?'#eef7ff':'#16213e' }}>←</button>
          <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
            <div style={{ fontFamily:'var(--crystal-mono)', fontSize:10, letterSpacing:'0.12em', opacity:0.6, textTransform:'uppercase' as const }}>{systemFullName}</div>
            <div style={{ fontFamily:'var(--crystal-display)', fontSize:18, fontWeight:700, letterSpacing:'-0.02em', display:'flex', alignItems:'center', gap:10 }}>
              DISCOVER
              {activeTab==='browse' && (
                <>
                  <span style={{ fontFamily:'var(--crystal-mono)', fontSize:9.5, padding:'3px 8px', borderRadius:999, background:providerPillStyle.bg, border:`1px solid ${providerPillStyle.border}`, color:providerPillStyle.fg, fontWeight:700 }}>{providerPillStyle.label}</span>
                  {showCachedBadge && <span style={{ fontFamily:'var(--crystal-mono)', fontSize:9, padding:'3px 7px', borderRadius:999, background:'rgba(120,180,255,0.12)', border:'1px solid rgba(120,180,255,0.18)', color:isDark?'#a9d2ff':'#345daa' }}>CACHED</span>}
                </>
              )}
            </div>
          </div>
          <div style={{ display:'flex', gap:6, marginLeft:12 }}>
            {tabBtn('foryou','For You')}
            {tabBtn('trending','Trending')}
            {tabBtn('new','New')}
            {tabBtn('browse','Browse')}
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12, opacity:isDark?0.92:0.90 }}>
          {logoUrl && <SystemLogo systemId={systemId} logoUrl={logoUrl} fallbackName={systemFullName} isSelected theme={theme} style={{ minWidth:140, maxWidth:220, minHeight:32 }} />}
          <div style={{ fontFamily:'var(--crystal-mono)', fontSize:10, opacity:0.54 }}>{resultCountLabel}</div>
          {effectiveQueue.length>0 && <div style={{ fontFamily:'var(--crystal-mono)', fontSize:10, padding:'4px 8px', borderRadius:999, background:isDark?'rgba(125,249,255,0.12)':'rgba(70,130,255,0.12)', border:`1px solid ${isDark?'rgba(125,249,255,0.18)':'rgba(70,130,255,0.18)'}`, color:isDark?'#c7feff':'#2a4d9e' }}>QUEUE {effectiveQueue.length}/4</div>}
        </div>
      </div>

      {activeTab==='browse' && (
        <div style={{ height:60, minHeight:60, flexShrink:0, zIndex:2, display:'flex', alignItems:'center', gap:12, padding:'0 22px', background:isDark?'rgba(10,12,18,0.18)':'rgba(255,255,255,0.36)', borderBottom:`1px solid ${isDark?'rgba(255,255,255,0.04)':'rgba(18,26,44,0.05)'}`, backdropFilter:'blur(16px)' }}>
          <div style={{ flex:1, display:'flex', alignItems:'center', gap:10, background:isDark?'rgba(18,22,36,0.72)':'rgba(255,255,255,0.84)', border:`1px solid ${focusZone==='search'?(isDark?'rgba(125,249,255,0.72)':'rgba(70,130,255,0.64)'):(isDark?'rgba(125,249,255,0.18)':'rgba(70,130,255,0.18)')}`, borderRadius:12, padding:'0 12px', height:42 }}>
            <span style={{ fontFamily:'var(--crystal-mono)', fontSize:11, opacity:0.56, whiteSpace:'nowrap' }}>{systemFullName.toUpperCase()} — Search Vimm's Lair</span>
            <input ref={searchInputRef} value={query} onChange={e=>setQuery(e.target.value)} onFocus={()=>setFocusZone('search')} onKeyDown={e=>{ if (e.key==='Escape'){ if (query){ setQuery(''); e.preventDefault()} else onBack() } }} placeholder="Search any part of a title…" style={{ flex:1, background:'transparent', border:'none', outline:'none', color:isDark?'#eef7ff':'#16213e', fontFamily:'var(--crystal-display)', fontSize:14, fontWeight:500 }} />
            {query && <button onClick={()=>setQuery('')} style={{ background:'transparent', border:'none', cursor:'pointer', opacity:0.5 }}>✕</button>}
            <button onClick={refreshBypass} title="Refresh bypass cache (X / R)" style={{ background:'transparent', border:`1px solid ${isDark?'rgba(125,249,255,0.18)':'rgba(70,130,255,0.18)'}`, borderRadius:8, padding:'4px 8px', fontFamily:'var(--crystal-mono)', fontSize:10, cursor:'pointer', color:isDark?'#7df9ff':'#3a6ae0' }}>⟳ X</button>
            {searching && <span style={{ width:10, height:10, borderRadius:'50%', border:`2px solid ${isDark?'rgba(125,249,255,0.42)':'rgba(70,130,255,0.42)'}`, borderTopColor:'transparent', display:'inline-block', animation:'crystal-spin 0.8s linear infinite' }} />}
          </div>
          <div style={{ fontFamily:'var(--crystal-mono)', fontSize:10, opacity:0.54, display:'flex', gap:8, alignItems:'center' }}>
            <span style={{ padding:'4px 8px', borderRadius:999, border:`1px solid ${isDark?'rgba(255,255,255,0.10)':'rgba(18,26,44,0.10)'}`, background:isDark?'rgba(255,255,255,0.04)':'rgba(255,255,255,0.6)' }}>[View] SEARCH</span>
            <span style={{ padding:'4px 8px', borderRadius:999, border:`1px solid ${isDark?'rgba(255,255,255,0.10)':'rgba(18,26,44,0.10)'}`, background:isDark?'rgba(255,255,255,0.04)':'rgba(255,255,255,0.6)' }}>[A] OPEN</span>
            <span style={{ padding:'4px 8px', borderRadius:999, border:`1px solid ${isDark?'rgba(255,255,255,0.10)':'rgba(18,26,44,0.10)'}`, background:isDark?'rgba(255,255,255,0.04)':'rgba(255,255,255,0.6)' }}>[Y] QUEUE</span>
          </div>
        </div>
      )}

      {activeTab==='browse' && !query && (
        <div style={{ zIndex:2, flexShrink:0, display:'flex', alignItems:'center', gap:7, padding:'10px 22px 11px', overflowX:'auto', scrollbarWidth:'none', background:isDark?'rgba(8,10,16,0.30)':'rgba(255,255,255,0.42)', borderBottom:`1px solid ${isDark?'rgba(255,255,255,0.05)':'rgba(18,26,44,0.06)'}` }}>
          <span style={{ fontFamily:'var(--crystal-mono)', fontSize:9.5, opacity:0.5, marginRight:5, whiteSpace:'nowrap' }}>BROWSE</span>
          {browseOptions.map((letter, browseIdx)=>{
            const active=browseLetter===letter
            const focused=focusZone==='browse' && focusedBrowseIdx===browseIdx
            return <button key={letter} onClick={()=>activateBrowse(browseIdx)} onFocus={()=>{ setFocusZone('browse'); setFocusedBrowseIdx(browseIdx)}} style={{ width:letter==='FEATURED'?76:30, height:30, flex:`0 0 ${letter==='FEATURED'?76:30}px`, borderRadius:9, cursor:'pointer', outline:focused?`2px solid ${isDark?'#fff':'#173c91'}`:'none', outlineOffset:2, transform:focused?'translateY(-2px)':'none', border:`1px solid ${active?(isDark?'rgba(125,249,255,.65)':'rgba(70,130,255,.58)'):(isDark?'rgba(255,255,255,.08)':'rgba(18,26,44,.08)')}`, background:active?(isDark?'#7df9ff':'#4a86ff'):(isDark?'rgba(255,255,255,.04)':'rgba(255,255,255,.62)'), color:active?(isDark?'#041018':'#fff'):'inherit', fontFamily:'var(--crystal-mono)', fontSize:10, fontWeight:800 }}>{letter}</button>
          })}
        </div>
      )}

      {effectiveQueue.length>0 && (
        <div style={{ zIndex:2, flexShrink:0, display:'flex', gap:8, padding:'10px 22px', overflowX:'auto', background:isDark?'rgba(125,249,255,0.04)':'rgba(70,130,255,0.04)', borderBottom:`1px solid ${isDark?'rgba(125,249,255,0.08)':'rgba(70,130,255,0.08)'}` }}>
          <span style={{ fontFamily:'var(--crystal-mono)', fontSize:9.5, opacity:0.5, whiteSpace:'nowrap', flexShrink:0 }}>QUEUE {effectiveQueue.length}/4</span>
          {effectiveQueue.map((q,i)=>(
            <span key={`${q.id}-${i}`} style={{ fontFamily:'var(--crystal-mono)', fontSize:10, padding:'4px 9px', borderRadius:999, background:isDark?'rgba(255,255,255,0.06)':'#fff', border:`1px solid ${isDark?'rgba(255,255,255,0.10)':'rgba(18,26,44,0.10)'}`, display:'flex', alignItems:'center', gap:6 }}>
              {i+1}. {String(q.title).slice(0,22)}
              <button onClick={()=>setEffectiveQueue(effectiveQueue.filter((_,idx)=> idx!==i))} style={{ background:'transparent', border:'none', cursor:'pointer', opacity:0.5 }}>✕</button>
            </span>
          ))}
        </div>
      )}

      {/* MAIN CONTENT */}
      <div ref={containerRef} style={{ flex:1, overflowY:'auto', zIndex:1, padding:'18px 22px', display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', alignContent:'start', gap:12 }}>
        {activeTab==='foryou' && forYouRecs.length===0 && <div style={{ gridColumn:'1 / -1', fontFamily:'var(--crystal-mono)', fontSize:11, opacity:0.55 }}>No recommendations – play more games to build affinity. Favorites + last 10 used as seed.</div>}
        {activeTab==='foryou' && forYouRecs.map((r,i)=> <div key={`${(r.game as any).id||i}`}>{renderLocalCard(r,'foryou')}</div>)}
        {activeTab==='trending' && trendingRecs.length===0 && <div style={{ gridColumn:'1 / -1', fontFamily:'var(--crystal-mono)', fontSize:11, opacity:0.55 }}>No trending data.</div>}
        {activeTab==='trending' && trendingRecs.map((r:any,i:number)=> <div key={i}>{renderLocalCard(r,'trending')}</div>)}
        {activeTab==='new' && newRecs.length===0 && <div style={{ gridColumn:'1 / -1', fontFamily:'var(--crystal-mono)', fontSize:11, opacity:0.55 }}>No new games – all played.</div>}
        {activeTab==='new' && newRecs.map((r:any,i:number)=> <div key={i}>{renderLocalCard(r,'new')}</div>)}
        {activeTab==='browse' && (
          <>
            {offline && (
              <div style={{ padding:'18px 16px', borderRadius:12, background:isDark?'rgba(20,16,12,0.52)':'rgba(255,244,230,0.82)', border:`1px solid ${isDark?'rgba(255,180,120,0.18)':'rgba(180,120,20,0.18)'}`, fontFamily:'var(--crystal-mono)', fontSize:11 }}>
                <div style={{ fontWeight:700, marginBottom:6, fontFamily:'var(--crystal-display)', fontSize:13 }}>VIMM'S LAIR UNAVAILABLE</div>
                <button onClick={handleOpenVaultRoot} style={{ padding:'8px 14px', borderRadius:999, border:'none', background:isDark?'#7df9ff':'#4a86ff', color:isDark?'#041018':'#fff', fontFamily:'var(--crystal-mono)', fontSize:11, fontWeight:700, cursor:'pointer' }}>OPEN VIMM'S LAIR</button>
              </div>
            )}
            {!offline && !schemaChanged && !searching && debounced && results.length===0 && <div style={{ fontFamily:'var(--crystal-mono)', fontSize:11, opacity:0.5, padding:'24px 4px' }}>No catalog entries for “{debounced}”. {errorMsg && <span style={{ color:'#ff7b7b' }}> {errorMsg}</span>}</div>}
            {!offline && !schemaChanged && !searching && !debounced && results.length===0 && <div style={{ gridColumn:'1 / -1', fontFamily:'var(--crystal-mono)', fontSize:11, opacity:0.52, padding:'24px 4px' }}>No {browseLetter} titles found for {systemFullName}.</div>}
            {!offline && !schemaChanged && results.map((r,idx)=>{
              const focused=focusZone==='grid' && idx===focusedIdx
              const inLib=inLibraryCheck(r.title)
              const visualUrl=resolveCoverUrl(r)
              const isQueued=effectiveQueue.some(q=>String(q.id)===String(r.id))
              return (
                <div key={`${r.id}-${idx}`} data-result-idx={idx} onClick={()=>{ setFocusZone('grid'); setFocusedIdx(idx); openDetail(r) }} tabIndex={0} onFocus={()=>{ setFocusZone('grid'); setFocusedIdx(idx)}} style={{ display:'flex', minHeight:112, gap:12, padding:'12px 12px', borderRadius:12, cursor:'pointer', background:focused?isDark?'linear-gradient(100deg, rgba(125,249,255,0.13), rgba(125,249,255,0.06) 62%)':'linear-gradient(100deg, rgba(70,130,255,0.12), rgba(90,160,255,0.06) 62%)':isDark?'rgba(255,255,255,0.02)':'rgba(255,255,255,0.42)', border:`1px solid ${focused?(isDark?'rgba(125,249,255,0.32)':'rgba(70,130,255,0.28)'):isDark?'rgba(255,255,255,0.05)':'rgba(18,26,44,0.06)'}`, transform:focused?'translateY(-1px)':'translateY(0)', transition:'all 180ms' }}>
                  {visualUrl ? <img src={visualUrl} alt="" style={{ width:68, height:84, objectFit:'cover', borderRadius:9, border:`1px solid ${isDark?'rgba(255,255,255,0.10)':'rgba(18,26,44,0.08)'}`, flexShrink:0, background:'#fff' }}/> : <div style={{ width:68, height:84, borderRadius:9, background:isDark?'linear-gradient(145deg, rgba(125,249,255,.10), rgba(255,255,255,.025))':'linear-gradient(145deg, rgba(70,130,255,.12), rgba(255,255,255,.72))', border:`1px solid ${isDark?'rgba(125,249,255,.12)':'rgba(70,130,255,.12)'}`, display:'grid', placeItems:'center', fontFamily:'var(--crystal-mono)', fontSize:17, fontWeight:800 }}>{String(r.title||'?').slice(0,2).toUpperCase()}</div>}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:'var(--crystal-display)', fontSize:14.5, fontWeight:680, lineHeight:1.18 }}>{r.title}</div>
                    <div style={{ display:'flex', gap:8, marginTop:4, flexWrap:'wrap', fontFamily:'var(--crystal-mono)', fontSize:10.5, opacity:0.62 }}>
                      {r.region && <span style={{ padding:'2px 7px', borderRadius:999, background:isDark?'rgba(255,255,255,0.06)':'rgba(18,26,44,0.06)' }}>{r.region}</span>}
                      {r.year && <span>{r.year}</span>}
                      {r.developer && <span style={{ opacity:0.7 }}>• {String(r.developer).slice(0,18)}</span>}
                    </div>
                    <div style={{ display:'flex', gap:6, marginTop:6, flexWrap:'wrap' }}>
                      <span style={{ fontFamily:'var(--crystal-mono)', fontSize:9.5, padding:'3px 8px', borderRadius:999, background:r.availability==='available'?(isDark?'rgba(125,249,255,0.14)':'rgba(90,180,120,0.14)'):isDark?'rgba(255,120,120,0.12)':'rgba(255,120,120,0.16)' }}>{(r.availability||'AVAILABLE').toString().toUpperCase()}</span>
                      <span style={{ fontFamily:'var(--crystal-mono)', fontSize:9.5, padding:'3px 8px', borderRadius:999, background:inLib?(isDark?'rgba(255,214,90,0.16)':'rgba(255,200,60,0.18)'):isDark?'rgba(255,255,255,0.04)':'rgba(18,26,44,0.05)', border:`1px solid ${inLib?(isDark?'rgba(255,214,90,0.24)':'rgba(255,180,0,0.24)'):isDark?'rgba(255,255,255,0.06)':'rgba(18,26,44,0.06)'}`, color:inLib?(isDark?'#ffd85a':'#8a5a00'):undefined }}>{inLib?'★ OWNED':'NEW'}</span>
                      {isQueued && <span style={{ fontFamily:'var(--crystal-mono)', fontSize:9, padding:'3px 8px', borderRadius:999, background:'rgba(125,249,255,0.12)', border:'1px solid rgba(125,249,255,0.18)', color:'#7df9ff' }}>QUEUED</span>}
                    </div>
                  </div>
                  <div style={{ alignSelf:'center', opacity:focused?0.9:0.32, fontSize:12, display:'flex', flexDirection:'column', gap:4 }}><span>↗</span>{focused && <button onClick={(e)=>{e.stopPropagation(); queueSelected(r)}} style={{ fontFamily:'var(--crystal-mono)', fontSize:9, padding:'3px 6px', borderRadius:6, border:`1px solid ${isDark?'rgba(125,249,255,0.18)':'rgba(70,130,255,0.18)'}`, background:isDark?'rgba(125,249,255,0.08)':'rgba(70,130,255,0.08)', cursor:'pointer' }} title="Y to queue">+Q</button>}</div>
                </div>
              )
            })}
          </>
        )}
      </div>

      {toast && <div style={{ position:'absolute', bottom:18, left:'50%', transform:'translateX(-50%)', zIndex:20, padding:'10px 16px', borderRadius:999, background:isDark?'rgba(18,22,36,0.92)':'rgba(255,255,255,0.92)', border:`1px solid ${isDark?'rgba(125,249,255,0.18)':'rgba(70,130,255,0.18)'}`, backdropFilter:'blur(18px)', fontFamily:'var(--crystal-mono)', fontSize:11, fontWeight:700 }}>{toast}</div>}

      {showDetailPanel && selectedDetail && (
        <div style={{ position:'absolute', inset:0, zIndex:10, background:isDark?'rgba(8,11,18,0.56)':'rgba(244,247,255,0.46)', backdropFilter:'blur(16px) saturate(1.1)', display:'grid', placeItems:'center', padding:'22px' }} onClick={()=>{ setShowDetailPanel(false); setSelectedDetail(null) }}>
          <div onClick={e=>e.stopPropagation()} style={{ width:'min(640px, 92vw)', maxHeight:'86vh', overflowY:'auto', background:isDark?'linear-gradient(180deg, rgba(18,22,36,0.96), rgba(12,16,26,0.94))':'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,255,0.94))', border:`1px solid ${isDark?'rgba(255,255,255,0.10)':'rgba(18,26,44,0.10)'}`, borderRadius:16, boxShadow:isDark?'0 24px 64px rgba(0,0,0,0.56)':'0 24px 64px rgba(18,26,44,0.18)', padding:'20px 20px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
              <div>
                <div style={{ fontFamily:'var(--crystal-mono)', fontSize:10, opacity:0.6 }}>{(selectedDetail.system||systemFullName).toUpperCase()} • {selectedDetail.region||'--'} • {selectedDetail.year||'--'}</div>
                <div style={{ fontFamily:'var(--crystal-display)', fontSize:20, fontWeight:780, marginTop:4 }}>{detailFull?.title||selectedDetail.title}</div>
              </div>
              <button onClick={()=>{ setShowDetailPanel(false); setSelectedDetail(null) }} style={{ width:32, height:32, borderRadius:'50%', border:`1px solid ${isDark?'rgba(255,255,255,0.10)':'rgba(18,26,44,0.10)'}`, background:isDark?'rgba(255,255,255,0.06)':'#fff', cursor:'pointer' }}>✕</button>
            </div>
            {detailResolving && <div style={{ marginTop:12, fontFamily:'var(--crystal-mono)', fontSize:11, opacity:0.6 }}>Resolving detail…</div>}
            {(detailFull||selectedDetail) && (
              <div style={{ marginTop:14 }}>
                <div style={{ fontFamily:'var(--crystal-mono)', fontSize:11, opacity:0.72 }}>{(detailFull?.description|| (selectedDetail as any).description || 'No description available.').toString().slice(0,420)}</div>
                <div style={{ marginTop:12, display:'flex', gap:8 }}>
                  <button disabled={!canGetGame} onClick={()=>handleGetGame('romsfun')} style={{ padding:'9px 14px', borderRadius:999, border:'none', background:canGetGame?(isDark?'#7df9ff':'#4a86ff'):(isDark?'rgba(255,255,255,0.08)':'rgba(18,26,44,0.08)'), color:canGetGame?(isDark?'#041018':'#fff'):(isDark?'#6b7688':'#8a94aa'), fontFamily:'var(--crystal-mono)', fontSize:11, fontWeight:700, cursor:canGetGame?'pointer':'not-allowed' }}>GET GAME</button>
                  <button onClick={()=>queueSelected(selectedDetail as any)} style={{ padding:'8px 12px', borderRadius:999, border:`1px solid ${isDark?'rgba(125,249,255,0.18)':'rgba(70,130,255,0.18)'}`, background:'transparent', color:isDark?'#7df9ff':'#3a6ae0', fontFamily:'var(--crystal-mono)', fontSize:10, cursor:'pointer' }}>+ QUEUE</button>
                  <span style={{ fontFamily:'var(--crystal-mono)', fontSize:10, opacity:0.5, alignSelf:'center' }}>Esc close • Enter Get • Y Queue • [Y hold] Pin in Library</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <style>{`@keyframes crystal-spin { to { transform: rotate(360deg);} }`}</style>
    </div>
  )
}
export default DiscoverView
