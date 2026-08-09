# V8 — Golden Screen parity – FINAL REPORT

**Repo:** ciaranf3308-star/emulationtesterciaran
**Milestone:** V8 — Golden Screen parity: production-quality system landing and game library experiences modelled on the proven Crystal ES-DE theme
**Semver:** 4.0.0  
**Commit:** $(git rev-parse HEAD --short 2>/dev/None || echo pending)
**Date:** 2026-08-10
**Build:** `index-CyD-tZap.js 262.70kB gzip 76.41kB` 89 modules 2.07s vs V7.3 `index-BAAueQMZ.js 250.43kB gzip 73.14kB` 86 mods 2.31s

## What shipped

1. **System metadata registry** `src/presentation/systemMeta.ts` – 19 makers/years/forms/tagline/facts 3 max concise flavour.
2. **Pure summary** `src/presentation/systemSummary.ts` – `deriveSystemSummary`, `getRecent=continuePlaying`, `getMostPlayed`, `getSurprise deterministic hash+seed`, collapse elegant no fabricate.
3. **Golden A – SystemLanding.tsx** – LEFT 32% (30-34 spec) `backdrop-filter blur(18px)`, TOP `01 / 19 CONSOLE` real order/count, SystemLogo swappable, facts 2-3 chips, YOUR LIBRARY real total/fav, CONTINUE PLAYING collapsed if null, YOUR ROTATION RECENT/MOST/SURPRISE title-only, CTA `A ENTER YOUR [SYSTEM] LIBRARY`, L/R arrows 38px circles restrained not covering artwork, RIGHT 66-70% empty letting Crystal bg hero dominate, never shows transparent hardware layer.
4. **Golden B – LibraryView.tsx** – TOP 48px minimal `← FULLNAME | MY LIBRARY`, LEFT 37% (34-40) logo/marquee/title/year/genre/dev/pub/desc clamped 640 chars collapsed N/A-free, rating visual star 0-10→5 real only, chips players/lastPlayed/playCount collapsed, PRIMARY `A PLAY` gradient, X MEDIA Y FAVORITE optional, RIGHT 60-66% slot `stageNode` transparent preserving SystemStage calibrated hardware, BOTTOM 22% 148-196px `GameBoxCarousel`.
5. **GameBoxCarousel.tsx** – 5-7 covers window `-3..+3`, selected 1.08 112×152 opaque forward reflection, neighbours 0.92/0.84/0.78 scale opacity 0.78/0.52/0.34 blur 0.6, no giant border, title fallback graceful, class `game-box-carousel`.
6. **Frame invariant fix** `SystemStage.tsx` – removed `getBoundingClientRect` in `measureUntransformed`, uses `ResizeObserver entry.contentRect + contentBoxSize.inlineSize/blockSize + clientWidth/clientHeight`, outer wrapper `scale(1.16-1.22)` no longer drifts inner %, added docs 1254×1254 square / 1024×1536 portrait / 1536×1024 landscape invariance.
7. **DEV fixture** `src/dev/fixtures/goldenFixture.ts` – DEV-only isolated 3 systems GBC/PS2/GC ×5-6 games real fields, `getFixtureSummary`.
8. **App.tsx rewrite** – state machine `activeSystemId`, `view system|library|allgames|favorites|recent|settings`, `gameCache Map`, `selectedGameId`, `mediaRequestIdRef monotonic`, `debounceRef 130ms`, `handleSelectGame` invalidates previous `if(curId!==ref) return`, only latest commits gameplaySources/physicalUrl, summary `deriveSystemSummary(activeGames)`, landing brief `toLandingBrief` with `lastPlayedLabel`, preloaded neighbours ±1 bg/logo±hw, SystemLanding wired prev/next assets, landing real counts, SystemStage `mode=library isEntered` wraps LibraryView + maintains V7.1 hardware foreground 22 PNGs, dual-screen truthful primary only comment `dual-screen truthful primary only`.
9. **Input** – added `media` to `NavigationAction` + keyboard `y/Y favorite`, `x/X media`, `f/F favorite`.
10. **V8 golden tests** `tests/v8.golden.test.ts` 41 tests – total/fav/continue/recent/most/surprise returns actual, collapse, metadata collapse no N/A, cover fallback, no fabricate idle glass, carousel wrap 7 wrap, launch bridge, media race monotonic refs/debounce 130ms, inner frame contentRect/clientWidth/contentBoxSize no boundingRect, numeric 1254/1024/1536, golden screens structural no hardware in landing but hardware in library carousel required, dev-mode hidden, cache/preload gameCache listGames.
11. **Typecheck 0**, **143 tests pass 482 expects 12 files**, **vite build 89 mods 262.70kB**.
12. **Screenshot validation 6 PNGs** 1920×1080 – system GBC light 1.9M, PS2 dark 2.3M, GC dark 2.4M, library GBC light 1.5M, PS2 dark 726K, GC dark 1.5M – LEFT 30-34% info / RIGHT hero artwork no hardware, library LEFT 37% RIGHT hardware stage sharp, bottom carousel integrated, bgFilter `blur(32px) brightness(0.68) saturate(0.82)` library defocus sharp hardware, hwOpacity 1, hasCarousel true, old SystemShelf not rendered.

## Golden compliance

- SYSTEM/STOREFRONT shows: Crystal Light/Dark bg, platform logo swappable, console info, library real, nav/CTA – no transparent hardware, no glass hardware, no gameplay video, no physical cartridge/disc, no giant shelf, no bottom system carousel, no dev info/emulator command/raw ID/extension/machine diagnostic – artwork hero.
- LEFT 30-34% info / RIGHT 66-70% artwork dominant – transparent acrylic only, not opaque panel.
- TOP LEFT `01 / 19 CONSOLE` real order/count not hardcoded 19 fallback.
- LOGO swappable, never raw IDs.
- FACTS 2-3 max flavour.
- YOUR LIBRARY real total/fav via real listGames runtime enumeration.
- Continue Playing most recent real – collapsed elegantly if null – no "No history available" UI.
- Rotation RECENT/MOST/SURPRISE real games – surprise deterministic hash+seed.
- CTA `A ENTER YOUR [SYSTEM] LIBRARY` – A enters B.
- System nav L/R restrained edge arrows 38px no flashing loading, preload prev/next bg+logo 250-400ms no bounce slide 40-80px.
- Golden B main reason – TOP minimal `← FULLNAME | MY LIBRARY` – LEFT 34-40% meta clamped 640 – RIGHT 60-66% hardware stage – BOTTOM 20-25% horizontal rail – carousel overlap intentional not full-width navy.
- Rating visual only if real – no invent scores.
- PRIMARY A PLAY via existing launch, secondary X MEDIA Y FAVORITE where implemented.
- Right media transparent hardware assets – handhelds GB/GBC/GBA/NDS/N3DS/PSP game behind handheld, TV SNES/N64/GC/Dreamcast/PS1/PS2/Xbox/360/Wii, Steam monitor wide, Wii U GamePad-led/hybrid – layers 1 bg 2 video 3 physical 4 transparent hw 5 UI – not flattened.
- Calibrated hardware-frame architecture preserved V7.1 19 systems `[n3ds,dreamcast,gb,gba,gbc,gc,genesis,megadrive,n64,nds,ps2,psp,psx,snes,steam,wii,wiiu,xbox,xbox360]` dual-screen NDS top 26.1%/17.4%/47.5%/23.0% bottom 27.8%/53.7%/43.9%/23.6% n3ds top 31.6%/9.1%/36.7%/33.7% bottom 33.2%/55.7%/33.6%/29.9% etc.
- Background defocus when entering library – `blur(32px) brightness(0.68) saturate(0.82)` – hardware/gameplay/sharp only bg layers.
- Media priority video>screenshot>titlescreen>mix>other>tasteful empty – never fabricate – NDS/N3DS primary-only truthful no fake dup – comment `dual-screen truthful primary only`.
- Physical real scraped only.
- Bottom carousel premium 5-7 covers larger opaque forward reflection – graceful – L/R changes game A launches B back wrap intentional smooth.
- Metadata 150-220ms video 200-300ms physical fade.
- Async media race fixed monotonic ref + 130ms debounce (spec 100-180).
- Frame measurement untransformed invariant – docs numeric 1254×1254 square 1024×1536 portrait 1536×1024 landscape.
- Real data before pretty empty boxes – collapse modules elegantly.
- System data cache reuse when entering library.
- Media perf cover immediate metadata immediate media after 100-180ms only latest resolves video once confirmed preload neighbouring COVER images no 7 videos.
- Controller-first – SYSTEM L/R switch platform A enter MENU utility – LIBRARY L/R select A play B system X media Y favorite – no mouse required.
- All Games/Fav/Recent/Settings retained utility rail bottom-left restrained not Golden pollution no four large pills no permanent sidebar.
- Light/Dark Crystal – DARK graphite black deep glass electric cool, LIGHT white pale grey clear acrylic silver electric blue – NO beige hospitality editorial.
- Logos provider-based swappable.
- Dev/Debug behind explicit dev mode normalised UI never shows raw paths ROM extensions emulator labels real no fake counts screen geometry system IDs.
- Visual QA fixture MAY create DEV-only isolated under `src/dev/fixtures` production real Tauri machine truth only.
- Screenshots answered: "Is this at least same visual class as ES-DE?" – Yes, LEFT info / RIGHT hero artwork cinematic, library LEFT meta / RIGHT sharp hardware / BOTTOM premium rail – boutique hotel polish → premium gaming OS glass/acrylic crystal graphite/electric.
- What deleted – V7.3 left shelf not rendered, horizontal system carousel not rendered in product, generic ROM list moved to utility view, giant glass list panel removed, technical media summary removed, raw IDs removed, developer footer removed.

## Preserved / no regress

- Tauri v2 runtime – real machine config – ROM enum validExtensions – gamelist join – verifyMedia 7 types + marquee – launch resolver %INJECT% %OS-SHELL% blocked – 19 systems – Crystal Light/Dark artwork – 22 hardware foregrounds 1024-1536 RGBA steam transparent monitor 2,167,150 – per-system calibration contain math – dual-screen truthful primary only – Steam transparent display – Genesis/Mega distinct – privacy `.gitignore` line 50 `crystal-machine-config.json, machine-config.json, *.machine.local.json, CRYSTAL-MACHINE-AUDIT.md, *.zip`.

## Visual QA – PNGs

- `your_files/crystal-v8-system-gbc-light.png` 1.9M
- `your_files/crystal-v8-system-ps2-dark.png` 2.3M
- `your_files/crystal-v8-system-gc-dark.png` 2.4M
- `your_files/crystal-v8-library-gbc-light.png` 1.5M
- `your_files/crystal-v8-library-ps2-dark.png` 726K
- `your_files/crystal-v8-library-gc-dark.png` 1.5M
- 1920×1080 Light GBC pastel accurate, Dark PS2/GC graphite crisp electric blue accents – shelf false, Old SystemShelf deprecated not rendered, landing blur 0, library blur 32px brightness 0.68 true isolation, hwOpacity 1 razor sharp, carousel true.

## Tests

- 143 pass 0 fail 482 expects 12 files – V8 golden 41 pass 132 expects
- typecheck 0
- vite build 89 mods 262.70kB gzip 76.41kB vs V7.3 86 mods 250.43kB gzip 73.14kB – +3 mods expected for Landing/Library/Carousel
- Cargo check – Cargo not available in web VM 2026-08-09 – same as V7.3, do not claim proof, real Windows host expected

## Version

- `version.json` 3.6.0→4.0.0 milestoneDefinition V8 detailed, `package.json` 3.6.0→4.0.0, `tauri.conf.json` 3.6.0→4.0.0, `Cargo.toml` 3.6.0→4.0.0 – semver minor→major appropriate.

## Commit & push

- Commit `feat: V8 golden screen parity` 15+ files – SystemLanding/GameBoxCarousel/LibraryView/systemMeta/systemSummary/dev fixtures/App/SystemStage/input/keyboard/version/manifest/tests/v8.golden + docs/V8-FINAL-REPORT + your_files 6 PNGs
- Remote verify `git ls-remote origin/main` HEAD matches local commit.

## Standing – privacy/repo parity

- `git ls-files` no `C:\Users\ciara`, no `crystal-machine-config.json`, no `*.zip` – `.gitignore` line 50 covers扎实.
- Asset handling autonomous fulfilled – hardware ZIP not committed – 75M Crystal + 44M hardware curated only PASS.
- Dev/preview killed `pkill -f vite` after screenshots, `/tmp/vite-v8.log`, `/tmp/crystal-v73-*.png` cleaned `/tmp/crystal-v8-*.png` kept for archive but not committed, `v8-capture.mjs` removed after final capture per spec.

## Product firewall – permanent

- BEIRT AND CRYSTAL ARE COMPLETELY DIFFERENT PRODUCTS – Crystal premium next-gen GAMING OS futuristic hardware clear/translucent glass acrylic crystal transparent polymer graphite black silver electric/cool highlights studio-lit console hardware sharp premium presentation cinematic motion – NOT boutique hotel Soho House Hume Aesop Cereal hospitality UI lifestyle editorial – Beirt visual language never transferred.

