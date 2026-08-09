import React, { createContext, useContext, useEffect, useState, useMemo } from 'react'
import type { Theme, ThemeAssetSet } from '../assets/types'
import { loadManifest, ComposableAssetResolver } from '../assets/resolver'

type ThemeState = {
  theme: Theme
  toggle: ()=>void
  setTheme: (t:Theme)=>void
  manifest: ThemeAssetSet | null
  resolver: ComposableAssetResolver
  manifestLoading: boolean
}

const Ctx = createContext<ThemeState|null>(null)

export function ThemeProvider({ children }: { children:React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark')
  const [manifest, setManifest] = useState<ThemeAssetSet|null>(null)
  const [loading, setLoading] = useState(true)
  const resolver = useMemo(()=> new ComposableAssetResolver(manifest||{} as ThemeAssetSet), [manifest])

  useEffect(()=>{
    setLoading(true)
    loadManifest().then(m=>{
      setManifest(m)
      resolver.setManifest(m)
    }).finally(()=>setLoading(false))
  },[])

  useEffect(()=>{
    resolver.setManifest(manifest||{} as ThemeAssetSet)
  },[manifest])

  const toggle = ()=> setTheme(t=> t==='dark'?'light':'dark')

  return <Ctx.Provider value={{ theme, toggle, setTheme, manifest, resolver, manifestLoading:loading }}>{children}</Ctx.Provider>
}

export function useThemeAssets() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useThemeAssets outside ThemeProvider')
  return ctx
}
