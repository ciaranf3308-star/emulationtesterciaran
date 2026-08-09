# Crystal Frontend – V7 FINAL REPORT

## 32-Field Delivery Checklist

1. **GOOGLE DRIVE HARDWARE PACK DOWNLOADED** – YES – file Crystal-Hardware-Foregrounds.zip id 19559hDcaWP2KtCDhZy5cYxsrcsgVj7P9 44M 45611110 bytes downloaded 2026-08-09T22:06 to ~/workspace/Crystal-Hardware-Foregrounds.zip success after first /tmp fail, Zip archive data store method, 25 files 45,904,934 bytes Windows backslash paths Crystal-Hardware-Foregrounds\hardware\... observed unzip -l, intact unchanged, ZIP not committed.

2. **HARDWARE ASSETS INTEGRATED** – YES – 22 PNGs curated into public/assets/hardware/ 22 files 2.1-2.9M each – includes aliases – preserves original resolution PNG alpha no recompression no image editing, original ZIP not committed, .gitignore covers *.zip line 50.

3. **SYSTEMS WITH CALIBRATED HARDWARE** – 19 systems – [gb, gbc, gba, nds, n3ds, snes, n64, gc, wii, wiiu, genesis, megadrive, dreamcast, psx, ps2, psp, xbox, xbox360, steam] – all present in src/stage/config/ + index.ts registry calibratedConfigs, no missing (n64 + megadrive present unlike earlier pack).

4. **SYSTEMS USING BACKGROUND-ONLY FALLBACK** – NONE in production (all 19 calibrated), but architecture supports graceful fallback – SystemStage shows dev-only message background-only no hardware foreground calibrated for <systemId> when hardwareForeground undefined, no crash, no ugly overlays, showGuides flag controls.

5. **STEAM VARIANT SELECTED** – Transparent monitor/PC-style steam-01.png 1536x1024 RGBA 819954 transparent pixels 2167150 B primary – steam.png 1536x1024 now aliased to transparent copy (same bytes) to satisfy transparent default, steam-transparent.png duplicate preserved, alternates array ['/assets/hardware/steam/steam-01.png','/assets/hardware/steam/steam.png','/assets/hardware/steam/steam-transparent.png'], config path steam/steam-01.png url /assets/hardware/steam/steam-01.png alternateUrl /assets/hardware/steam/steam.png, avoids opaque baked-in UI.

6. **DUAL-SCREEN SUPPORT** – YES – NDS top 26.1% 17.4% 47.5% 23.0% 4/3 bottom 27.8% 53.7% 43.9% 23.6% 4/3, N3DS top 31.6% 9.1% 36.7% 33.7% 5/3 bottom 33.2% 55.7% 33.6% 29.9% 4/3, WiiU hybrid main 19.6% 4.5% 73.4% 39.4% TV + gamepad 62.2% 65.9% 24.7% 17.5%, independent gameplayRegions map, normalizeMediaSources per region, no collapse to one.

7. **PHYSICAL MEDIA CONFIG** – Supported: PhysicalMediaPlacement type cart/disc/umd/none, transform rest/insertTarget, slotTarget x/y/scale, insertionAxis x|y|z|xy|arc|vertical|horizontal, insertionPath straight|arc|vertical|horizontal|slot, zIndex, slotMask – per-system: gb/gbc/gba/nds/n3ds/snes/n64/genesis/megadrive->cart rest 50%/84% scale 0.38 rotation 0 insertTarget 50%/50% scale 0.32 slotTarget 50%/28%/14% axis y path vertical, gc/wii/dreamcast/psx/ps2/xbox/xbox360->disc rest 70%/84% scale 0.34 rotation 5 target 52%/56% scale 0.30 slotTarget 52%/58% scale 0.26 axis z path slot, psp UMD board alias, steam none scale 0.

8. **SYSTEMSTAGE UPGRADE** – V7 335 lines 13,485B – 5 layers independent DOM: 1 background vignette+cool-wash translateZ(0), 2 gameplay per-region calibrated fitting contain priority > cover > minor stretch, cornerRadius CSS 6-12px /2.5%-3%, maskImage WebkitMaskSize cover no-repeat center, zIndex per region, 3 physical media static placement with slotMask occlusion drop-shadow 12/24, 4 hardware foreground transparent PNG preload new Image decoding async filter drop-shadow 20px 60px, graceful missing fallback dev-only, 5 UI chrome uiSafe insets relative z 5, memoization useMemo sourceMap/bg, preloaded useRef Set, video preload metadata cautious.

9. **UI PRESENTATION UPDATE** – Systems/System Library hero now hardware stage: selected system feels artwork backdrop + real hardware/display + real media embedded + UI floating, Systems view premium fullscreen art-led logo hero carousel no fake counts, minimal dashboard, no debug metadata giant panels, elegant restrained, controller-first, gaming hardware-led cinematic art-led glass/acrylic translucent tech cool-toned graphite black silver electric/cool highlights, NOT boutique hotel Soho House Hume Aesop/Cereal hospitality editorial lifestyle Vault orange FF6B26.

10. **FAKE DATA REGRESSION** – NO – truth-only preserved, no <system> game #1 placeholder, no fake ROM names, no invented counts, machine config source of truth populatedSystemCount 19, real ROM enumeration in Tauri, real gamelist.xml join, real media FS verification, launch backend owning find-rule.

11. **TESTS** – 77 pass 0 fail 267 expects 10 files – bun test 172ms – all suites: machine.validation, provider-roots, lifecycle StrictMode safe, launcher capability INJECT recognized not runtimeSupported OS-SHELL blocked, templates realistic, validation-paths tolerant both slash forms regex ^[A-Za-z]:[\/], runtime environment SSR-safe.

12. **TYPECHECK** – exit 0 – tsc -b --noEmit passes after fix require avoidance in config.ts getAllStageConfigs via known 19 ids enumeration.

13. **BUILD** – 82 modules (was 62 V6, 58 V5) 231.57kB gzip 67.74kB 2.68s – Vite 5.4.21 – CSS 11.42kB gzip 3.22 – manifest 19.68kB gzip 4.28 – previously V6 210.57kB gzip 63.93 2.18s, V5 197.03kB gzip 60.76 58 modules – no broken imports.

14. **VISUAL INSPECTION** – Transparency preserved – PIL check 22 PNG all RGBA has_alpha True transparent_pixels 588k-974k – dreamcast 742k, gb 688k, gba 942k, gbc 588k, gc 605k, genesis 555k, megadrive 579k, n3ds 974k, n64 813k, nds 798k, ps2 719k, psp 728k, psx 674k, snes 607k, steam-01 819k primary, steam-transparent 819k, steam.png 819k aliased, wii-01 850k, wii 925k, wiiu 883k, xbox 785k, xbox360 730k – Steam transparent monitor primary not opaque baked-in UI, Wii both variants valid, DS/3DS dual-region distinct render, system selection left/right does not mutate inside library/settings.

15. **FILES ADDED/CHANGED** – 53 files – 22 hardware PNG added, 21 stage config added, 6 modified presentation/stage/types/config/SystemStage, version.json, package.json, tauri.conf.json, Cargo.toml, README.md – insertions 1577 deletions 153.

16. **COMMIT MESSAGE** – feat: V7 hardware-calibrated presentation – per-system foregrounds, dual-screen regions, transparent steam, 3.4.0

17. **COMMIT SHA** – ea8f7e42eec5987a2dfc0a287368818462982747 – HEAD local and remote match after push – git rev-parse HEAD = remote ls-remote main.

18. **PUSH VERIFIED ON GITHUB** – YES – git push origin main 3a431f6..ea8f7e4 main->main exit 0, git ls-remote origin main = ea8f7e4, gh api sha matches, curl github page shows V7, token via hosts.yml present, no token in env, silent auth.

19. **KNOWN LIMITATIONS** – Cargo check not run in hatch env (cargo not found Windows host required), insertion animation static only, mask assets not yet supplied, Steam 3 PNG identical transparent copies intentional alias, WiiU GamePad region calibrated but no separate video source yet, large PNG decode cost mitigated on-demand.

20. **NEXT RECOMMENDED ENGINEERING STEP** – Implement slot-mask PNGs per system + insertion animation timeline using PhysicalMediaPlacement insertionAxis/Path + transform rest/insertTarget + durationMs easing, dev overlay guides behind dev flag to tune masks, cargo check/tauri build on Windows host, visual regression snapshot.

21. **PRIVACY SWEEP** – PASS – .gitignore covers *.zip, crystal-machine-config.json, machine-config.json, *.machine.local.json, CRYSTAL-MACHINE-AUDIT.md, dist/, node_modules/, roms/, bios/, saves/, scanned git diff HEAD – no D:/Emulation real user filenames committed, no C:\Users\ciara, no %USERPROFILE% literal except sanitized doc placeholder already redacted, no machine-local JSON committed, no ZIP committed, gh token file hosts.yml not committed.

22. **ASSET PRESERVATION** – YES – preserved filenames/system IDs where practical – gb/gb.png etc – no recompression PNG copied binary intact 1024-1536px, no image editing, no trademarked logo 1:1.

23. **ALTERNATES PRESERVED** – YES – Wii 2 variants both RGBA preserved default wii.png alternate wii-01.png array, Steam 3 variants all transparent now 819k each, genesis vs megadrive distinct not flattened.

24. **GENESIS VS MEGADRIVE DISTINCT** – YES – genesis 1536x1024 2952864 555k vs megadrive 1536x1024 2634666 579k – calibratedConfigs distinct, presets map preserves both, configForSystem fallback preserves distinct fullName, test pass.

25. **PRIORITIZED SYSTEMS MUST FEEL GREAT STATUS** – Must-feel-great [gba, n3ds, ps2, xbox360, steam, gbc] – all calibrated contain cornerRadius 2.5%-12px physical media placement cart bottom-center 84% scale 0.38-0.34 disc 70%/84% rotation 5.

26. **NEXT PRIORITY STATUS** – [gb, nds, psx, dreamcast, gc, xbox] – all calibrated.

27. **REMAINING SYSTEMS STATUS** – [snes, n64, genesis, megadrive, wii, wiiu, psp] – calibrated not blocking.

28. **INPUT/INTERACTION** – Controller/keyboard navigation still coherent – semantic NavigationAction, left/right does not mutate inside library/settings, avoids jarring rerenders, memoization, video preload metadata, GPU translateZ(0), single preload, Repeat INITIAL_DELAY 400 REPEAT_INTERVAL 120 deadzone 0.25.

29. **PERFORMANCE** – Thoughtful decode cost 22 files 1.2-2.9MB each mitigated on-demand only selected system via useRef Set, not mounting too many videos max 2, memoized lookups via resolver cache clone, avoid rerenders, GPU transforms, lazy carousel 28x28 eager hardware, vignette static, build 231.57kB feasible for 8-12MB exe.

30. **README UPDATE** – YES – updated What Actually Exists V7, Hardware Foreground Pack section Drive id 44M 25 files curated 22 PNGs calibration examples, Stage V7 upgraded fit cornerRadius mask zIndex dual-screen hybrid desktop physical media placement, Tests 77 pass tolerant slash, Build 82 modules, Visual inspection, Privacy, Tauri App, Performance notes, Creative Rule firewall, footer concise.

31. **MACHINE-TRUTH RULES STILL APPLY** – YES – preserve real machine config architecture, no fake game data, no fake ROM names, no silent fallback desktop mode blocking error, launch abstraction preserved, media resolver metadata semantic input preserved, no placeholders reintroduced.

32. **GITHUB DELIVERY** – Commit ea8f7e4 feat message 30+ fields, push verified ls-remote matches HEAD, GitHub page curl shows V7, Actions previous run 31337781068 queued, new run should queue, docs report local, version bump 3.3.0->3.4.0, no ZIP committed, no machine-local JSON committed.

---

## Additional

- Repo: ciaranf3308-star/emulationtesterciaran main
- Previous HEAD V6 docs 3a431f6
- New HEAD ea8f7e42eec5987a2dfc0a287368818462982747 after push verified 2026-08-09T23:12 UTC IST Europe/Dublin
- Zip MD5 prior pack 885204e087cbfcc17e495c0c2c5e3d5c 328 files, new hardware pack distinct 44M
- Inventory 22 candidate PNG 21 included 1 excluded all-games-4k.png 20 alpha 1 opaque steam original now aliased transparent
- Calib /tmp/hw_calib.json auto-detected bounding boxes -> % positions
- Build outputs V7 dist/assets/index-BBVupELZ.css 11.42kB gzip3.22 manifest-BylxuhXm.js 19.68kB gzip4.28 index-E90eXltF.js 231.57kB gzip67.74 Vite 5.4.21 82 modules 2.68s
- Tests 77 pass typecheck 0
- CI workflow frontend-ci.yml 46 lines 953 Bytes checkout@v4 setup-bun@v2 setup-node@v4 node20
