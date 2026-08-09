# Crystal Frontend – Permanent Product Rule

This document is the authoritative creative boundary for Crystal Frontend.
It is permanent. Future agents must read and obey it before editing styling,
copy, or product references.

==================================================
BEIRT AND CRYSTAL ARE COMPLETELY DIFFERENT PRODUCTS
==================================================

## BEIRT
Private household OS for couples / flatmates.

- warm
- editorial
- lifestyle
- intimate
- human
- premium hospitality influenced
- soft materials
- domestic / lived-in presentation

Soho House / boutique-hotel type references may be appropriate THERE in Beirt.

## CRYSTAL FRONTEND
Premium next-generation GAMING OS for Windows (React → Tauri).

- premium next-generation GAMING OS
- futuristic gaming hardware
- clear / translucent technology
- glass, acrylic, crystal and transparent polymer
- graphite, black, silver, electric / cool highlights
- studio-lit console hardware
- sharp premium presentation
- cinematic motion
- high-end gaming product photography
- controller-first
- hardware-led
- screen, cartridge and disc interaction
- visually ambitious and technically polished

Visual language: cold precision, translucent depth, graphite
and silver structure, electric cyan focus, hardware silhouette
breaks overlay edge with shadow (stage), not clipped domestic
card. Typography is industrial product UI, not editorial.

## CRYSTAL IS NOT

- boutique hotel
- Soho House
- Hume
- Aesop
- Cereal
- hospitality UI
- lifestyle editorial
- crockery / domestic styling
- warm beige luxury app
- generic SaaS
- admin dashboard
- orange Vault terminal (#FF6B26 generic leftover)
- warm pastel Habit Tracking / intimate warm editorial

## PERMANENT RULE

NEVER transfer Beirt's visual language, design references,
typography assumptions or product personality into Crystal.

- Do not import Newsreader serif editorial as primary.
- Do not import warm cream #f3eee8 / #f7f3ef hospitality palette as primary.
- Do not describe Crystal goals as "boutique-hotel polish bar (Soho House + Hume + Aesop/Cereal)".
- If you work on both repos in same session, mentally firewall them.

Crystal's ambition bar is:
> Premium gaming hardware OS – reads like a Sony/Crystal console reveal,
> not a Soho House lobby.

### Compliance Check for Future PRs

- [ ] No `boutique`, `Soho`, `Hume`, `Aesop`, `Cereal`, `hospitality`, `intimate warm` in Crystal docs/CSS/TSX except inside this rule itself (as a negative example)
- [ ] Tokens reference `--crystal-*` not warm editorial
- [ ] Typography uses sharp sans / mono (Geist, Sora, Instrument Sans, Fragment Mono / JetBrains), not Newsreader serif primary
- [ ] Empty states are truthful – no fake game rows
- [ ] Real-config failure in Tauri does not silently fallback to example
