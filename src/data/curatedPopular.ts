/**
 * Curated Popular – hand-curated titles top 20 per system for 19 systems.
 * No trademarked logos, just string titles (generic recognizable titles, plausible).
 * Used for Most Played fallback & Trending cross-system.
 * V3.1 Track 2/3/5
 */

export const SYSTEM_IDS = [
  'n3ds','dreamcast','gb','gba','gbc','gc','genesis','megadrive','n64','nds','ps2','psp','psx','snes','steam','wii','wiiu','xbox','xbox360'
] as const

export type SystemId = typeof SYSTEM_IDS[number]

export const CURATED_POPULAR: Record<SystemId, string[]> = {
  n3ds: [
    'Monster Hunter Stories','Fire Herald Tactics','CastleVania: Mirror Shadows','Sky Racers 3D','Kart Racers Ultimate','Animal Village Life','Puzzle Quest Legends','Dragon Academy','Fossil Frontier','Eternal Odyssey','Rune Factory Frontier','Star Link Tactics','Rhythm Samba','Super Smash Clash','Detective Agency X','Alchemist Adventure','Samurai Warriors Chronicles','Epic Yarn World','Island Resort Deluxe','Yo-kai Hunters'
  ],
  dreamcast: [
    'Shenmue Chronicles','Crazy Taxicab','Jet Racer Future','Skies of Aether','Soul Edge 2','Power Smash 3','Sonic Dash Adventure','Virtua Tennis Pro','Soul Collectors','Phantasy Star Online Ver.2','Crazy Climber','Samba Parade','Seaman Whisperer','Grand Boxing','Rez Vibes','Time Stalkers','Ikaruga Star','Berserk Bloodline','Hydro Thunder Surge','Toy Racers'
  ],
  gb: [
    'Pocket Monsters Red','Pocket Monsters Blue','Link Awakening DX','Super Lad','Kirby Dream Land','Metroid II Return','Donkey Kong Land','Wario Land Shuffle','Castlevania Adventure','Tetris Master','Final Tactics','Balloon Kid','Gargoyle Quest','Mario Land 2','Kid Dracula','Mega Force','Star Soccer','Racing Fever','Bubble Ghost','Alleyway Plus'
  ],
  gba: [
    'Advance Wars Duty','Golden Solar','Metroid Fusion','Castlevania Aria','Mario Advance 3','Zelda Mini Cap','Fire Emblem Sword','Mother 3 Fan','Wario Twisted','Rhythm Heaven','Kirby Mirror','Mario Kart Circuit','Advance Tactics','Final Fantasy Tactics Adv','Drill Harvest','Gun Star Heroes','Mario & Luigi Saga','Pokemon Emerald Isle','F-Zero Climax','Super Dodge Ball'
  ],
  gbc: [
    'Zelda Oracle Seasons','Zelda Oracle Ages','Shantae Risky','Mario Tennis Pocket','Pokemon Crystal Clear','Dragon Quest I+II','Harvest Moon 2','Tales of Phantasia','Metal Gear Solid Ghost','Wario Land 2','Bomberman Quest','Resident Shadows','Rockman X Cyber','Pop n Twins','Tetris DX','Croc Legend','Bionic Ops','Survival Kids','Dragon Warrior Monsters','Golf Adventure'
  ],
  gc: [
    'Smash Melee HD','Wind Walker','Sunshine Islands','Double Dasher','Metroid Primary','Pikmin Grove','Luigi Mansion Night','F-Zero GX','Fire Emblem Path','Tales of Symphonia','Baten Kaitos Origins','Skies of Arcadia Legends','Mario Strikers Charged','Super Monkey Balls','Eternal Darkness Sanity','Viewtiful Star','Resident Crisis Zero','Chibi Robot','Paper Tale Door','Kirby Air Ride'
  ],
  genesis: [
    'Sonic Hedgehog 2','Streets of Rage 2','Gunstar Heroes','Thunder Crossing IV','Phantasy Star IV','Castle of Illusion','Shining Force 2','Golden Axe','Contra Hard Corps','Ranger-X','Streets Bare Knuckle 3','Beyond Oasis','Soleil Legend','Rocket Knight Dash','Alien Soldier','Vectorman Pulse','Comix Zone','Land Stalker','Mortal Kombat 3','Super Shinobi II'
  ],
  megadrive: [
    'Sonic Spin Dash','Road Rush 2','Mercs Assault','Altered Beast Revival','Kid Chameleon','Alex Kidd Castle','Space Harrier','OutRun 2019','Columns Cascade','Wonder Boy Monster','Shadow Dancer','Sparkster Blast','Castle Illusion Remix','Street Thunder II','Desert Striker','Golden Axe II','Light Crusader','Mortal Tournament','Sonic Charge 3','Strider Returns'
  ],
  n64: [
    'Kart Racer 64','Smash Bros Clash','Golden Eye 007','Zelda Ocarina Echo','Mario 64 Stars','Banjo Kazoo Duo','Perfect Darker','Conker Uncut','Donkey Jam 64','Paper Mario Quest','Star Fox Lylat','Mario Tennis Ace','Wave Racer Blue','F-Zero X Sprint','Zelda Mask Maroon','Major League 64','Pokemon Stadium Tactics','Turok Dinosaur','Bomberman Hero','Mario Party 3'
  ],
  nds: [
    'Phantom Hourglass','Spirit Tracks','Pokemon Diamond Pearl','Mario 64 DS','Kart DS Velocity','New Mario Bros U','Animal Crossing Wild','Brain Train Deluxe','Castlevania Dawn Sorrow','Elite Beat Cadets','Ghost Detective','Mario & Luigi Bowser','Kirby Canvas Cry','Metroid Hunters','Final Fantasy III Remake','Advance Wars Days','Hotel Dusky','Phoenix Ace 1','Rune Factory frontier','Bleach Blade Battles'
  ],
  ps2: [
    'Grand Wagon Theft','Shadow Beast Colossus','Metal Gear Stealth 3','Godlike Wars 2','Persona Shin 4','Final Dawn X','Kingdom Hearts Beta','Gran Touring 4','Devil Cry 3','San Andreas Stories','Okami Brush','Ratchet Clank Up','Jak X Adventure','Sly Cooper Band','Burnout Takedown','Tekken Five','Silent Hill 2 Restless','Onimusha Warlords','SSX Tricky','Katamari Rolls'
  ],
  psp: [
    'Godlike Chains Olympus','Monster Hunt Freedom','Grand Auto Liberty','Crisis Core Final','Patapon Pulse','Loco Roco World','Persona Chained','Daxter Freedom','Metal Gear Ops','Wipeout Pure Pulse','Gran Touring Portable','Tekken Dark Resurrection','Dissidia War','Kingdom Hearts Birth','Lumines Spark','Ratchet Size Matters','Silent Ghost Origins','GTA Vice Towns','Tactics Ogre Knight','Killzone Freedom'
  ],
  psx: [
    'Final Fantasy VII Remake','Metal Gear Solid Tactics','Castlevania Night','Resident Evil Raccoon','Tomb Raider Legends','Gran Turismo Race','Silent Hills','Crazy Pony Racer','Tekken Three','Crash Bandi Rally','Spyro Dragon Flight','Vagrant Story Arc','Chrono Cross Worlds','Breath of Fire IV','Alundra Quest','Driver Streets','Soul Edge','Parasite Eve','Kart Nitro','Tony Hawk Pro'
  ],
  snes: [
    'Chrono Arrows','Final Fantasy VI Legacy','Zelda Link Worlds','Super Metroid Prime','Mario World 2','Donkey Kong Country','F-Zero Boost','Mario Kart Circuit','Mega X Hunter','Super Castlevania IV','Secret of Mana','Earth Bound','Star Fox Wings','Kirby Super Star','Yoshi Island Tale','Street Fighter II Turbo','Contra III Alien','Super Punch Tour','Act Raiser Legend','Pilot Wings Plus'
  ],
  steam: [
    'Hollow Knight Void','Celeste Summit','Stardew Valley Life','Hades Escape','Undertake Tale','Portal Laboratory','Terraria Depths','Ori Will Wisp','Dead Cells Prison','Cuphead Ink','Hollow Townfall','Baldur Gate Three','Elden Circle','Disco Elysium Case','Vampire Survivors','The Witcher Wilds','Firewatch Lookout','Star Factory','Slay Spire Climb','Among Crewmates'
  ],
  wii: [
    'Galaxy Starstruck 2','Skyward Sword Legend','Mario Kart Nitro','Brawl Clash Unlimited','Metroid Prime Corruption','Donkey Kong Returns','Punch Out Championship','Zelda Twilight Mirror','Kirby Epic Thread','Xenoblade Chronicles','No More Heroes Boost','Monster Hunt Tri','Super Paper Journey','House Dead Overkill','Mad World City','Tatsunoko Versus','Wii Sports Resort','Sonic Black Knight','Castle Shikigami','Fire Emblem Radiance'
  ],
  wiiu: [
    'Kart 8 Drift','Smash 4 Duel','Mario Maker World','Splatoon Ink','Zelda Wind HD','Pikmin 3 Bloom','Wonder World','Bayonetta Second','Mario 3D World','Donkey Tropical Chill','Monster Hunt Ultimate','Yoshi Wool Thread','Captain Toad Tracks','Hyrule Warriors Rush','Xeno Cross World','Wii Fit U','LEGO City Under','Sonic Lost Worlds','Zombified U','Tank Tank Tanks'
  ],
  xbox: [
    'Halo Combat Evolved','Fable Legacy','Ninja Gaiden Black','Morrowind Scrolls','Jet Set Radio Future','Psychonauts Mind','Kotor Knights','Obsidian Chronicles','Mech Assault Gear','Project Gotham 2','Panzer Dragoon Saga','Quantum Fusion','Forza Motorsport OG','Crimson Skies Grove','Star Wars Battlefront II','Prince Time Sands','Beyond Good & Evil Eye','Panzer Orta','Halo Two Combat','Jade Empire Quest'
  ],
  xbox360: [
    'Halo Three Prophet','Gears War Day','Mass Effect Galaxy','Bio Shock Drowned','Red Dead Revolver Redemption','Oblivion Shivering','Forza Horizon Dawn','Elder Skyrim','Dark Souls Ashes','Assassin Creed Two','Fallout Vegas Wasteland','Bayonetta Climax','Dead Rising Mall','Lost Odyssey Journey','Tales Vesperia','Blue Dragon Realm','Halo Reach Noble','Alan Wake Night','Forza Motorsport 4 Turf','Alan Spinoff Chronicles'
  ],
}

export function getCuratedForSystem(systemId: string): string[] {
  const key = systemId.toLowerCase() as SystemId
  return CURATED_POPULAR[key] ?? CURATED_POPULAR['snes']
}

export function getCuratedCrossSystemTop(count = 20): Array<{ systemId: string; title: string }> {
  const out: Array<{ systemId: string; title: string }> = []
  for (const sys of SYSTEM_IDS) {
    const titles = CURATED_POPULAR[sys].slice(0, 2) // top 2 each = 38
    for (const t of titles) out.push({ systemId: sys, title: t })
  }
  // shuffle deterministic simple: interleave already cross-system; limit
  return out.slice(0, count)
}
