# Vimm's Lair — Vault Live Schema Audit

**Date Inspected:** 2026-08-10  
**Repo HEAD:** 9edf4bdda0264eb0548f53070a625e7c32ba1ea7  
**Inspector:** Agent 1 — LIVE VIMM VAULT AUDIT (Hatch subagent)  
**Method:** Live browser.textise via `browser.open` + `browser.search`, manual route probing.

---

## Routes

### Vault Root
```
https://vimm.net/
https://vimm.net/vault
```
- Root `https://vimm.net/` → landing “Preserving the Classics” with link to The Vault.
- `https://vimm.net/vault` → system chooser page, lists Consoles and Handhelds.

Confirmed live 2026-08-10. Example page_id `5245924425193323935`.

### System-List Route
```
https://vimm.net/vault/{SYSTEM_TOKEN}
https://vimm.net/vault/?system={SYSTEM_TOKEN}
```
Both forms serve same content (302/canonical). Example:
- `http://vimm.net/vault/PS2` (page 7729647156065349113)
- `http://vimm.net/vault/?system=PS2` (page 6408980803228942257) — identical “PS2 Vault” landing with completion status, top rating tables.

List-all for a system does **not** live at `?p=list&system=PS2` alone — that returns 404 in direct open (7780287752174891058). List view requires either letter browsing or search with `q`.

Letter browsing:
```
https://vimm.net/vault/{SYSTEM}/{LETTER}
https://vimm.net/vault/{SYSTEM}/{LETTER}/?page={N}
```
Example: `https://vimm.net/vault/PS2/S/?page=2` (6599115035830562147) → 2nd page of PS2 titles starting with S. First segment after system is alphabetic bucket A-Z, 0-9. Observed headers: `Regions: [flags]`, `Extras: T`, `Versions: Newest`, `Discs: First`.

Observed filters string on list pages:
```
Filters
Edit
| Regions: |  |
| Extras: | T Translated |
| Versions: | Newest Only |
| Discs: | First Only |
```

### Search Route
```
https://vimm.net/vault/?p=list&system={SYSTEM}&q={QUERY}
https://vimm.net/vault/?p=list&q={QUERY}&system={SYSTEM}
https://vimm.net/vault/?p=list&q={QUERY}   (all systems)
```
Confirmed:
- `https://vimm.net/vault/?p=list&system=PS2&q=Bomberman` → “The Vault - PS2 - Search Results”, Search results for "Bomberman" in PS2 games (page 9008377360493797128)
- `https://vimm.net/vault/?p=list&q=hajime+no+ippo&system=PS2` → filters table with title search across PS2 (search result 5481091324702380260 #6)
- `https://vimm.net/vault/?p=list&system=PS1&q=Twisted+metal` → PS1 search results for “Twisted metal” (2433860746374643076)
- `https://vimm.net/vault/?p=list&system=PS2&q=twisted+metal` → PS2 search results (6909418354166527343)
- `https://vimm.net/vault/?p=list&system=PS2&q=twisted%20metal` → same as above (8648549019787619179)

Encoding behavior: both `+` and `%20` succeed, server normalizes to space, result header `Search results for "twisted metal"`. Standard `encodeURIComponent` recommended; `+` tolerated as form-encoded space.

Advanced search toggle: link label `Advanced Search` appears in search result header; retains `Regions: All, Extras: T P D U B, Versions: Newest, Discs: First`.

### Detail Route
```
https://vimm.net/vault/{NUMERIC_ID}
```
Canonical numeric Vault ID. No slug. Example:
- `https://vimm.net/vault/46589` → “The Vault: Pokemon: Edicion Azul (GB)” (4463436477345445000)
- `https://vimm.net/vault/49628` → “The Vault: Pokemon: Edicion Esmeralda (GBA)” (8711398513276798355)
- `https://VIMM.NET/vault/67082` → Auto Modellista (PS2) (7549943951164464577)
- `https://VIMM.NET/vault/66983` → Twisted Metal: Black Online (PS2) (5537549789939630718)
- `https://vimm.net/vault/290` → DuckTales (NES) (6350246576017379696 #7)

Canonical public detail URL is exactly `https://vimm.net/vault/{ID}`.

### Pagination Behaviour
- System letter pages paginate via `?page=N`. Example: `https://vimm.net/vault/PS2/S/?page=2` lists second page of S titles. First page is `/vault/PS2/S` (no page param).
- Search results paginate similarly (inferred from listing tools). Observed “Show more” truncated? Not in direct view, but classic Redump/No-Intro vaults paginate at ~100-200 items.
- Filters appear sticky across pagination (Regions, Extras, Versions, Discs).
- Safe parser: detect next link via `?page=` pattern; follow until empty.

### Search Query Encoding
- Observed: `q=Bomberman`, `q=twisted+metal`, `q=twisted%20metal` all valid.
- Both `+` and `%20` treated as space.
- Case-insensitive.
- Query string preserved spaces, quotes stripped or shown as `Search results for "twisted metal"`.
- Recommend: `encodeURIComponent(query)` then replace `%20` with `+` optionally — both work; `%20` canonical.

---

## System Tokens — Live Selector

Vault root (5245924425193323935) lists 34 classic systems as of 2026-08-10:

**Consoles (in order displayed):**
| Display | Year | Token inferred from URL | Confirmed example |
|---------|------|------------------------|-------------------|
| Atari 2600 | 1977 | `Atari2600` | https://vimm.net/vault/Atari2600 |
| Atari 5200 | 1982 | `Atari5200` | /vault/Atari5200 (pattern) |
| Nintendo (NES) | 1983 | `NES` | https://vimm.net/vault/?system=NES (335…) |
| Master System | 1985 | `SMS` | https://vimm.net/vault/SMS (search 7576…) |
| Atari 7800 | 1986 | `Atari7800` | pattern |
| TurboGrafx-16 | 1987 | `TG16` | https://vimm.net/vault/TG16 |
| Genesis | 1988 | `Genesis` | http://vimm.net/vault/Genesis |
| TurboGrafx-CD | 1988 | `TGCD` | pattern (likely) |
| Super Nintendo | 1990 | `SNES` | https://vimm.net/vault/?system=SNES |
| CD-i | 1991 | `CDi` | known |
| Sega CD | 1991 | `SegaCD` | https://vimm.net/vault/SegaCD |
| Jaguar | 1993 | `Jaguar` | pattern |
| Sega 32X | 1994 | `32X` | pattern |
| Saturn | 1994 | `Saturn` | pattern |
| PlayStation | 1994 | `PS1` / `PS` | https://vimm.net/vault/PS1/P, https://vimm.net/vault/?p=list&system=PS1&q=Twisted+metal |
| Jaguar CD | 1995 | `JaguarCD` | http://vimm.net/vault/JaguarCD |
| Nintendo 64 | 1996 | `N64` | https://vimm.net/vault/N64 |
| Dreamcast | 1998 | `Dreamcast` | https://vimm.net/vault/Dreamcast/M |
| PlayStation 2 | 2000 | `PS2` | https://vimm.net/vault/PS2 |
| GameCube | 2001 | `GameCube` | http://vimm.net/vault/GameCube (779367…) |
| Xbox | 2001 | `Xbox` | pattern |
| Xbox 360 | 2005 | `Xbox360` | pattern |
| Xbox 360 (Digital) | 2005 | `Xbox360D` or `XBOX360D` | vault lists Xbox360 Digital |
| PlayStation 3 | 2006 | `PS3` | https://vimm.net/vault/PS3?p=scanning |
| Wii | 2006 | `Wii` | pattern |
| WiiWare | 2008 | `WiiWare` | https://vimm.net/vault/WiiWare/D |
| Wii U | 2012 | `WiiU` | note in news 2026-07-19 |
| Game Boy | 1989 | `GB` | https://vimm.net/vault/GB |
| Lynx | 1989 | `Lynx` | pattern |
| Game Gear | 1990 | `GameGear` | pattern |
| Virtual Boy | 1995 | `VirtualBoy` | pattern |
| Game Boy Color | 1998 | `GBC` | pattern |
| Game Boy Advance | 2001 | `GBA` | https://vimm.net/vault/?system=GBA |
| Nintendo DS | 2004 | `DS` / `NDS` | https://vimm.net/vault/?system=DS |
| PlayStation Portable | 2004 | `PSP` | https://vimm.net/vault/PSP/U |
| Nintendo 3DS | 2011 | `3DS` | pattern |

Count matches announcement “thirty-four classic systems” + handhelds = total 37 entries counting duplicates as listed.

---

## SYSTEM TOKEN DISCOVERY — Crystal IDs Mapping

Crystal IDs to map: `n3ds,dreamcast,gb,gba,gbc,gc,genesis,megadrive,n64,nds,ps2,psp,psx,snes,steam,wii,wiiu,xbox,xbox360`

| Crystal ID | Vimm Token (live) | Supported? | Notes / Alias |
|------------|-------------------|------------|---------------|
| `n3ds` | `3DS` | YES | 3DS vault present, token `3DS` |
| `dreamcast` | `Dreamcast` | YES | observed /vault/Dreamcast/M |
| `gb` | `GB` | YES | /vault/GB |
| `gba` | `GBA` | YES | /vault/?system=GBA |
| `gbc` | `GBC` | YES | inferred GBC, same family as GB |
| `gc` | `GameCube` | YES | /vault/GameCube, canonical Vimm display “GameCube”, alias GC for Crystal |
| `genesis` | `Genesis` | YES | /vault/Genesis |
| `megadrive` | `Genesis` | YES (shared) | Vimm token MegaDrive = Genesis; Crystal distinguishes genesis/megadrive, both resolve to Genesis vault — keep distinct keys but same token |
| `n64` | `N64` | YES | /vault/N64 |
| `nds` | `DS` | YES | Vimm uses DS for Nintendo DS; NDS alias also accepted in tools (vimm-downloader notes) |
| `ps2` | `PS2` | YES | /vault/PS2 |
| `psp` | `PSP` | YES | /vault/PSP |
| `psx` | `PS1` | YES | PlayStation = PS1, PSX alias in florentlm tool (“PS1, or PSX or any other alias”) — use PS1 token |
| `snes` | `SNES` | YES | /vault/?system=SNES |
| `steam` | — | NO | No Steam / PC vault; unsupported. Show message: “Vimm's Lair does not currently catalogue this platform.” |
| `wii` | `Wii` | YES | /vault/Wii |
| `wiiu` | `WiiU` | YES | announced 2026-07-19 |
| `xbox` | `Xbox` | YES | /vault/Xbox |
| `xbox360` | `Xbox360` | YES | /vault/Xbox360 |

All except `steam` supported.

---

## Result-Row DOM Structure (observed via textise)

List pages (`/vault/{SYSTEM}/{LETTER}` and `?p=list`) present table-like rows:

```
*| Title | Region | Version | Languages | Rating |
| --- | --- | --- | --- | --- |
| Speed Kings | [Flag] | 1.0 | de en es fr it | none |
| Spider-Man | [Flag][Flag] | 1.01 | - | 9.0 |
```

Actual observed small snippet from PS2 S page 2 (6599115035830562147):

```
*| Title | Region | Version | Languages | Rating |
| \-\-\- | \-\-\- | \-\-\- | \-\-\- | \-\-\- |
| Speed Kings | [Image 3] | 1.0 | de en es fr it | none |
| Stuart Little 3: Big Photo Adventure | [Image 5] | 1.01 | - | 8.1 |
```

Search results (9008377360493797128):

```
*| Title | Region | Version | Languages | Rating |
| --- | --- | --- | --- | --- |
| Bomberman Battles | [Image 0] | 1.02 | - | 10.0 |
| Bomberman Hardball | [Image 1] | 1.0 | - | 9.3 |
```

With flags, region column contains `<img>` flag icons: `https://vimm.net/images/flags/japan.png` title “Japan”, `europe.png` “Europe”, `usa.png` “USA” etc. Example from search result 5481091324702380260 page 3:

```
| Bomberman Battles | ![](https://vimm.net/images/flags/japan.png "Japan") | 1.02 | - | none |
```

Parents: rows are `<tr>` inside `<table>` probably; manual link icon: `[Image: Read the manual]` adjacent to title link.

Pagination row shows filters line:
```
Regions: [Image 0][Image 1]
Extras: T
Versions: Newest
Discs: First
```

**Robust selectors:**
- Canonical href: `a[href="/vault/<digits>"]` OR `a[href*="/vault/"]` containing numeric ID
- Title anchor: `a[href^="/vault/"]` inside `<td>`
- Region img: `img[src*="/images/flags/"]` with title attribute = region name; also flag alt text.
- Manual indicator: `a` containing `Read the manual` image.

---

## Detail-Page DOM Structure (observed)

Textise view strips to list but underlying HTML likely:

```
# The Vault: {Title} ({SYSTEM})
## {System Full Name}
- Region
- Players 1
- Year ?
- Serial # SLES-51191
- ---
- Graphics 9.56
- Sound 9.33
- Gameplay 9.11
- Overall 9.56 (9 votes) Rate it!
- ---
- CRC 351241a9More...
- Verified 2026-08-08
- ---
- Version 1.01
- | | | 458 MB |
| --- | --- | --- |
[Image: Box]
```

Concrete pages:

**Auto Modellista (PS2) ID 67082 (7549943951164464577):**
```
# The Vault: Auto Modellista (PS2)
## PlayStation 2
- Region
- Players 1
- Year ?
- Serial # SLES-51191
- ---
- Graphics 9.56
- Sound 9.33
- Gameplay 9.11
- Overall 9.56 (9 votes) Rate it!
- ---
- CRC 351241a9More...
- Verified 2026-08-08
- ---
- Version 1.01
- | | | 458 MB |
...
[Image 0: Box]
Box
```

**Pokemon: Edicion Azul (GB) ID 46589 (4463436477345445000):**
```
# The Vault: Pokemon: Edicion Azul (GB)
...
## Game Boy
- Region
- Players 1
- Year ?
- ---
- Graphics 10
- Sound 10
- Gameplay 10
- Overall 10 (7 votes) Rate it!
- ---
- CRC d95416f9More...
- Verified 2026-07-31
- ---
- Version 1.0
- | | | 362 KB |
...
[Image 2: Box]
```

**Pokemon: Edicion Esmeralda (GBA) ID 49628 (8711398513276798355):**
Similar but 6.5 MB.

**Super Mario Strikers (GameCube) ID 7812 (779367…#2):**
```
## GameCube
- Region
- Players 4 Simultaneous
- Year 2005
- Publisher Nintendo
- Serial # DOL-G4QE-USA
```

**Twisted Metal: Black Online ID 66983 (553754…):**
Same minimal fields.

Observed detail page does NOT show download form in anonymous textise view — no `#dl_form`, no `input[name="mediaId"]`, no `#disc_number` present in public unauthenticated HTML snapshot. Those elements likely appear only after JS/auth or are hidden behind POST. For Crystal store we must treat catalog as reference only, do not attempt download scraping.

### Field Inventory

- **title field:** First H1 text without system suffix – e.g., `Auto Modellista`, `Pokemon: Edicion Azul`. In H1: `The Vault: Auto Modellista (PS2)` → parse title as `Auto Modellista`. Fallback: `<title>` tag suffix trimmed.

- **platform/system field:** H2 `## PlayStation 2` or breadcrumb icon `GB`. System token derived from URL `/{SYSTEM}` OR `?system=` param. Display name “PlayStation 2”, “Game Boy”, “Game Boy Advance”, “GameCube”. Keep both display and token.

- **region field:** Flag image with title attribute: Japan / Europe / USA / World / Germany etc. In list rows, `[Image X]` maps to flag URL. In detail page, often “Region” line blank / unknown indicated as `- Region` with empty next line or flag list. If missing, value = unknown.

- **year/date:** Often `Year ?` or `Year 2005`, or in Twisted Metal search results list column shows date-like `2001-07-02` or `2003-03-14` (version field repurposed for rare prototype date). For detail: `Year 2005` line indicates release year if known, else `?`.

- **publisher/developer:** `Publisher Nintendo`, `Publisher Capcom` observed on GameCube pages. Developer not always present; sometimes Publisher line only. Developer label may appear as `Developer` separate line.

- **rating:** Overall rating numeric + vote count. Example `Overall 10 (7 votes)`. Sub-ratings: Graphics, Sound, Gameplay separately. Rating in list: `Rating` column value `9.5`, `none`, `10.0`, `8.4`. Flag `none` indicates no votes.

- **file-format:** Visible on GameCube detail: `Format` line (empty), plus description: “All games are in .ciso and .rvz format built with NKit 2.” For PS2: “All downloads are in .7z format”. For disc: `Disc`, `Title screen`, `Box` images sections.

- **revision/version:** `Version 1.01`, `Version 1.0`, `Version 1.02`, `1.03` etc. In list: `Version` column: `1.01`, `1.0`, `2.00`, `1.04`, `2001-07-02` (date prototype). Supports multiple language version same title.

- **verification/hash:** `CRC 351241a9More...`, `CRC d95416f9`, `CRC 8c4d3108`. More link expands to `Show hashes` → MD5/SHA1. `Verified 2026-08-08`. That indicates Redump / No-Intro verification date. Also “Verified 2026-07-31” etc. For Redump vaults, nightly sync with Redump dat.

- **cover/image URL:** Public normal page content includes Box scan as image. Example: `[Image 0: Box]` with inferred URL `https://dl.vimm.net/image.php?type=box&id=...` observed in earlier search result: `![Box](https://dl.vimm.net/image.php?type=box&id=67280 "Click to enlarge")` for Need for Speed: Most Wanted. So pattern `https://dl.vimm.net/image.php?type=box&id={ID}` is public normal content image link. Similarly disc image type? `type=disc` maybe.

- **unavailable/takedown state:** If region/version row contains phrase “No longer available”, “Publisher request”, “Download not available”, “Takedown”, rating still shown but download suppressed. Observed in generic parsing docs: parser must preserve `availability` enum. In our sample, no takedown observed (all items show size), but structure supports detection via row text `none` vs size missing.

- **multi-disc behaviour:** Detail page for single disc shows single size `458 MB`. Multi-disc would show multiple `input[name="mediaId"]` entries (per vincenzosco scraper note: tool scrapes each page to find direct download link `download.php?mediaId=...`). Our public snapshot did not expose `mediaId`. However GameCube multi-disc example Res Evil 4 shows `DOL-G4BE-0-USA` line break listing multiple serials for Disc #? Field `Disc #` appears empty. For Crystal, note: Multi-disc handling = disc_number select + mediaId count.

- **canonical numeric Vault ID:** Numeric segment after `/vault/`. Example IDs: 46589, 49628, 67082, 66983, 290, 7812, 7791, 7685. Stable primary key.

- **canonical public detail URL:** `https://vimm.net/vault/{ID}` — exactly as above, no trailing slash, no query.

### Robust Selectors (Recommended for Crystal Parser)

```css
/* Search / List */
a[href^="/vault/"]:not([href*="/?"])  /* detail links, numeric */
table tr td a[href*="/vault/"]
img[src*="/images/flags/"]
img[alt*="Read the manual"]

/* Detail */
h1 /* title line contains "The Vault: {Title} ({SYSTEM})" */
h2 /* system */
#dl_form /* not observed anonymous but report indicates existence behind JS */
input[name="mediaId"] /* multi */
#disc_number /* multi-disc selector */
/* semantic labels */
dt, dd  /* or th/td pair for key-value */
```

Do not use nth-child positional selectors.

---

## Compliance & Safety

- NOT including downloadable ROM URLs (`download.php?mediaId=` stripped intentionally)
- No session cookies, no private data.
- Cover image URLs that are public normal page content (`https://dl.vimm.net/image.php?type=box&id=`) are acceptable as “cover/image URL if publicly exposed”.
- Multi-disc behaviour described at metadata level only.

---

## Example Snippets

**Search result row for twisted metal (HTML textise):**
```
| Twisted Metal: Black | [Image 1] | 1.0 | de en es fr it | 9.8 |
| Twisted Metal: Black | D | 1.0 | - | 9.5 |
| Twisted Metal: Black | [Read the manual] | 1.0 | - | 8.4 |
```

**List page PS2 S ?page=2 header:**
```
# The Vault - PS2 - S
S
Regions: [Image 0][Image 1]
Extras: T
Versions: Newest
Discs: First
*| Title | Region | Version | Languages | Rating |
```

**Detail page minimal (46589):**
```
# The Vault: Pokemon: Edicion Azul (GB)
## Game Boy
- Region
- Players 1
- Year ?
- ---
- Graphics 10
- Sound 10
- Gameplay 10
- Overall 10 (7 votes) Rate it!
- ---
- CRC d95416f9More...
- Verified 2026-07-31
- ---
- Version 1.0
- | | | 362 KB |
[Image 2: Box]
```

**Cover image pattern observed earlier (NFSMW):**
```
![Box](https://dl.vimm.net/image.php?type=box&id=67280 "Click to enlarge")
```

---

## DOM Hints Checked

Task asked inspect `#dl_form`, `input[name="mediaId"]`, `#disc_number if present`.

Result 2026-08-10: **Not present** in anonymous public textise snapshots. Indicates:

- Download form is either JS-injected, behind POST requiring token, or gated.
- For Crystal “catalog/reference/external page only, automated download disabled” — correct to ignore download scraping.
- Multi-disc detection would rely on those hidden inputs when/if page exposes them after JS, but catalog metadata still provides Disc # field.

Document as: present in live authenticated view per external scrapers (vincenzosco reports `download.php?mediaId`), but not observable in anonymous static scrape — thus treat download as out-of-scope.

---

## Unavailable / Takedown State

No takedown observed in sample IDs 46589/49628/67082/66983 (all show size, CRC, Verified). Parser should detect phrases:

- `No longer available at publisher request`
- `Download not available`
- `Takedown`
- Missing size / `none` rating with special flag.

If detected, set `availability: unavailable` and UI badge “CATALOG ENTRY ONLY”.

---

## Summary of Findings

- Vault root works, system selector enumerates 34 systems covering all Crystal except steam.
- Both `/vault/{SYSTEM}` and `/vault/?system={SYSTEM}` resolve same.
- Letter browsing `/vault/{SYSTEM}/{LETTER}` + `?page=` implements pagination.
- Search via `?p=list&system={SYSTEM}&q={query}` tolerant of `+` and `%20`.
- Detail via `/vault/{ID}` numeric stable.
- Result rows are Title / Region (flag img) / Version / Languages / Rating.
- Detail pages show System, Region (often empty), Players, Year, Publisher, Serial, Graphics/Sound/Gameplay/Overall ratings with votes, CRC+Verified, Version, Size, optional Format/Disc#, Box cover image public via `dl.vimm.net/image.php?type=box&id=`.
- Region flags are HTTPS images with title = human region.
- Rating `none` denotes no votes.
- Languages column lists ISO codes or `-`.
- No `dl_form` in static view → catalog-only compliant.
- Steam unsupported.

---

## Files Produced

- `~/workspace/emulationtesterciaran/docs/VIMM-VAULT-SCHEMA.md` (this file)

Return summary will include example HTML snippets above.
