# ICEBOUND: LAST SURVIVOR — v3.0

A complete offline single-player arctic survival adventure: exploration, gathering,
survival management, crafting, equipment progression, base building, combat,
distinct enemies, a boss encounter, quests, five regions, story discoveries and
persistent local saves.

Runs in desktop and mobile browsers. No account, no network calls, no ads.

---

## Running the game

```bash
npm install     # once
npm run dev     # local dev server (Vite prints the URL)
```

## Production build

```bash
npm run build
```

Release validation:

```bash
npm run typecheck
npm run check     # typecheck + production build
```

**Output directory: `dist/`** — and it contains exactly one file:

```
dist/index.html
```

`vite-plugin-singlefile` inlines the JavaScript, CSS, fonts (`@fontsource`,
base64) and both key-art images into that single HTML document. There are **no
external asset requests at runtime and no CDN dependencies**, so the build does
not care what path or origin it is served from — which is what makes it safe to
drop into a native WebView.

`npm run preview` serves the built output for a final check.

---

## Source structure

```
index.html              # app shell (viewport, theme colour, title)
src/
  main.tsx              # React entry; bundles fonts + global stylesheet
  App.tsx               # screen router: canvas + HUD + overlays + menus
  index.css             # design system: panels, buttons, bars, slots, animations
  assets/               # keyart.jpg, gameover.jpg (inlined at build time)

  game/                 # engine & simulation (framework-free, Canvas 2D)
    config.ts           # ALL balance + content data: items, recipes, enemies,
                        #   regions, weather, logs, tuning constants
    types.ts            # shared type definitions
    state.ts            # state factory, region views, inventory helpers
    world.ts            # forest generator + painted terrain (seeded)
    regions.ts          # the five region layouts + per-region terrain painting
    engine.ts           # game loop, camera, culling, rendering, travel,
                        #   weather, hazards, interaction, quests, save glue
    actors.ts           # player controller, shared collision, damage math
    enemies.ts          # wolf / hare / bear / crawler AI + Guardian boss FSM
    systems.ts          # survival tick, gathering, crafting, campfire, quests
    sprites.ts          # V1 procedural art (player, wolf, forest props, base)
    sprites2.ts         # V2/V3 art (creatures, regions, containers, landmarks)
    audio.ts            # fully synthesized WebAudio (music + ~45 SFX)
    perf.ts             # quality tiers + adaptive FPS monitor
    save.ts             # versioned save, V1→V5 migration, backup recovery
    residents.ts        # settlement: recruitment, capacity, worker posts,
                        #   upkeep, injuries, offline catch-up
    guards.ts           # guard FSM: assignments & patrol routes, detection +
                        #   line of sight, target priority, combat, equipment
    siege.ts            # calendar, nightly/weekly/monthly sieges, waves,
                        #   readiness, structure damage, resolution, offline,
                        #   command-center snapshot + preparation checklist

  ui/                   # React interface layer
    hooks.ts            # useSyncExternalStore bridge to engine state
    icons.tsx           # single lucide-react icon registry
    HUD.tsx             # vitals, status effects, objective, interact prompt
    Modals.tsx          # inventory, crafting, outpost, fire, storage, map,
                        #   loot, journal, quests, pause, settings, help
    Menus.tsx           # main menu, intro, game over
    Boot.tsx            # loading screen + orientation hint
    RegionUI.tsx        # region banner, boss bar, expedition summary
    TouchControls.tsx   # virtual joystick + action cluster
    Toasts.tsx          # transient notifications
```

Balance and content live in `src/game/config.ts`; rendering lives in the
`sprites*.ts` files. Neither needs the other to change.

---

## What v3 added on top of v2

- **Performance layer** (`perf.ts`): Performance / Balanced / Quality tiers plus
  an **Auto** mode that samples real frame time and steps the tier up or down.
  Tiers scale particle caps, burst sizes, snowfall, lighting passes, ground
  shadows, footprint decals, aurora bands and the device-pixel-ratio ceiling.
- **Render cost control**: viewport culling for every drawable and hazard, a
  reused zero-allocation depth-sort buffer, enemy update LOD (distant unalerted
  creatures tick at ¼ rate), and hard caps on particles, floaters and ground loot.
- **Loading screen**: all five region terrains are baked up-front behind a
  progress screen, so travelling between regions no longer hitches.
- **Animation polish**: counter-swinging back arm, sprint-scaled gait, lean into
  movement, dodge roll lean, hurt recoil, and a real repeating chop cycle while
  gathering.
- **Interaction clarity**: every prompt is tagged (`gather / tool / locked /
  quest / used / action / travel / danger`) with a matching icon and colour, on
  both the desktop prompt and the mobile action button.
- **Status effects HUD**: Freezing, Cold, Starving, Hungry, Dehydrated, Thirsty,
  Exhausted, Wounded, Blizzard, Warm, Sheltered, Heat Core.
- **Expedition summary**: returning home through the gate reports what the trip
  earned and offers a one-tap jump to crafting, closing the core loop.
- **Region landmarks**: Frozen Falls (forest), Channel Beacon (shipwreck),
  Crystal Heart (cave), Evacuation Helicopter (station) — each with a lore line.
- **Region ambience**: drifting motes tuned per region (cave spores, fortress
  resonance, station sparks, sea mist).
- **Mobile options**: left/right joystick side, larger interface text, bigger
  touch targets, safe-area insets, and joystick release on blur/visibility loss.
- **Save hardening**: payloads are validated before writing (a valid save is
  never replaced by an incomplete one), a rolling backup slot is kept, and a
  corrupt primary slot falls back to the backup instead of starting over.

---

## Phase 4.1 — progression & exploration

- **Survivor progression** (`src/game/progression.ts`, `src/ui/Progression.tsx`):
  an XP/level system driven purely by deliberate play — gathering, crafting,
  building, combat, opening containers, recovering logs, finding sites and
  completing objectives. Levels (max 20) grant one upgrade point each, spent
  across seven tracks that change real numbers: Vitality (max health),
  Endurance (max stamina), Cold Adaptation (temperature drain), Porter
  (inventory slots), Harvester (gather speed + bonus yield), Combat Training
  (weapon damage) and Field Rationing (hunger/thirst drain). Ranks are
  level-gated, so 19 points cannot buy all 32 ranks — the build is a choice.
  Open with **P** or the HUD award button; the HUD shows a live level/XP bar.
- **Exploration discoveries** (`src/game/discoveries.ts`): 16 hand-placed points
  of interest across the five regions — caches, wrecked equipment, a comms
  relay, survey camps, a second dormant Guardian. They are found by physically
  walking to them (undiscovered sites only shimmer faintly within ~300 units),
  give one-time loot plus XP, and are permanently recorded with their note in
  the Expedition Map and the Survivor Record's survey tracker.
- **Save v4**: adds `progression` and per-region found-site ids. V3/V2/V1 saves
  migrate forward untouched, and a migrated veteran is credited retroactive XP
  for quests, kills, logs, containers, crafting and gathering already done
  (a typical late-V3 save arrives around Level 5 with points to spend) rather
  than being reset to a blank record. Corrupt payloads still fall back to the
  backup slot instead of starting a new game.

## Phase 4.3 — integration & save reliability

- **Single transaction authority** (`src/game/tx.ts`): every path that moves
  items now shares one implementation. `pay()` validates the full cost and
  never partially consumes; `grant()` overflows to the Supply Cache and then to
  a ground pickup instead of losing items; `spaceFor()` respects both the slot
  count *and* the per-item stack ceiling. Crafting, building, quest rewards,
  daily rewards, container loot, discovery loot, gathering and storage transfer
  all route through it.
- **Bugs fixed by that migration** (each reproduced before fixing):
  crafting a stackable item when its stack was already full **silently
  destroyed the materials** while reporting success; an equipped item could be
  consumed, leaving a phantom equipment reference that kept applying its stats;
  unknown item ids in a save produced an inventory slot that crashed the first
  `ITEMS[id].stack` lookup.
- **Automatic equipment reconciliation**: removing the last of an equipped item
  clears the slot, and `applySave` re-checks every slot on load, so a migrated
  save can never ship a phantom.
- **Region transition hardening**: the spawn point is resolved against real
  collision (the player can no longer arrive inside a solid prop or out of
  bounds), all transient combat state (`atkT`, `dodgeT`, `iframeT`, velocity,
  sprint, action queue) is reset, and the arrived state is saved so a crash in
  the autosave window no longer puts the player back in the previous region.
- **Engine attach/destroy is idempotent**, so a React remount or StrictMode
  double-invoke cannot duplicate listeners or wedge the render loop.
- **`gatherCandidates` no longer crashes** when an unlocked region is missing
  from the region map, which previously aborted *any* craft or gather action.
- **Save sanitisation** now whitelists known item ids, clamps quantities to the
  ceiling of the bag they came from, and drops negatives, floats and unknown
  keys.

## Phase 5.1 — story, side content and onboarding

- **Six-chapter main story** (`src/game/story.ts`): the 21 existing quests were
  regrouped into *The Last Survivor · Signal in the Snow · Beneath the Ice ·
  The Silent Station · The Frost Fortress · The Last Transmission*. **Quest ids
  were not changed**, so a save from any earlier phase keeps every completed
  objective. Each chapter contains real objectives — none is a placeholder.
- **New Chapter 6 objective** `q_broadcast`: after the Guardian Core is brought
  home, the Research Station can reach past the storm. Sending the warning is a
  real interaction with its own prerequisite, and it rolls the ending.
- **Radio transmissions**: four signal fragments (distress loop, Nilsen's
  objection, the evacuation net, Hoffmann's last words) release at story
  milestones and read in the existing journal alongside the research logs, so
  the disaster resolves through play rather than one exposition dump.
- **Seven side quests**, implemented by extending `QuestDef` with `side: true`
  rather than building a parallel system. They gate on real state (surveying a
  region, opening containers, hunting, recovering every log, full tier-3 kit,
  mapping all 16 sites, completing every outpost facility), appear in their own
  Expedition Log tab, and never block the main route — `currentQuest` ignores
  them entirely.
- **Contextual onboarding** (`src/game/tutorial.ts`): 13 situational hints that
  each fire at most once, one at a time, with a cooldown so they never stack.
  Fully dismissible and replayable from Settings; state is saved per-save.
- **Ending sequence** (`src/ui/Ending.tsx`): story resolution followed by an
  expedition record (level, days, main/side objectives, regions, sites, records,
  kills, bosses, containers). Continuing is explicit and **resets nothing**.
- **Once-only rewards**: main and side quests now complete through one shared
  `completeQuest()` path with a re-entry guard, so neither can double-pay.

## Phase 5.2 — difficulty and economy

- **Three difficulty modes** (`src/game/difficulty.ts`): Story, Survival,
  Hardcore. Each is a *coherent* profile of 17 multipliers — survival drain,
  recovery rates, enemy damage/health/detection/telegraphs, hazard severity,
  gather yield, node regrowth and the defeat penalty — not an enemy-health
  slider. Selectable on the intro screen and changeable any time in Settings.
- **Combined effects were verified numerically**, as the brief requires, rather
  than tuning each modifier in isolation: time-to-starve/freeze, hits-to-kill
  for every weapon×enemy×mode, enemy hits-to-kill-player with and without
  armour, telegraph windows, and medkit value late-game. Monotonicity and
  fairness floors are asserted (e.g. Hardcore still gives >8 min to starve and
  needs ≥3 wolf hits to kill a full-health player).
- **Readable telegraphs are protected by a floor** (`MIN_WINDUP` 0.45 s) so
  Hardcore shortens warnings without ever making an attack unavoidable.
- **Defeat can no longer trap you.** "Recover at the outpost" is always
  available: it restores survivable vitals, returns you home, and keeps story
  progress, unlocks, equipment, base state and survivor level. The only cost is
  carried **raw materials** (0% Story / 25% Survival / 50% Hardcore) — tools,
  clothing, medicine and story items are never taken. This removes the
  death-loop risk of reloading an autosave made mid-spiral.
- **Economy fixes found by audit**, not guesswork:
  - *Bear hide* was the hardest gate — 5 needed across recipes, **0 guaranteed
    in the world**, and only 2 bears (7-minute respawns). The mandatory Thermal
    Suit therefore depended on respawn grinding. Added three guaranteed sources
    (Trapper's Cache, station crate, fortress Siege Cache) and raised the bear's
    second-hide chance to 50%: the mandatory path is now satisfiable from fixed
    loot alone.
  - *Key-item soft-lock (critical)*: exactly two Frost Sigils exist and the
    fortress gate needs both. An overflowing sigil became a ground pickup, and
    region travel deletes ground pickups — permanently blocking the main story.
    Key items now bypass capacity entirely.
  - Verified **no circular dependency**: the Crystal Pick needs 3 crystal while
    crystal veins require the Pick — 25 crystal are reachable from fixed loot.
- **Equipment statistics are now displayed** (`src/game/gear.ts`) in both the
  inventory and the crafting list *before* you spend resources: damage with a
  concrete "N hits to kill" reference, cold resistance, damage reduction, tool
  tier and gather speed, capacity, and difficulty-adjusted consumable values —
  with a delta against what you currently have equipped.

## Phase 5.3 — UI/UX, audio and comfort

- **Four audio buses**: Master, Music, Sound effects and a new **Ambience** bus.
  Wind, storm and campfire beds previously ran through the SFX bus, so they
  could not be balanced separately — they now have their own gain path. All
  volume changes ramp with `setTargetAtTime` instead of jumping, removing the
  click a direct `.value` write caused.
- **Storm-reactive ambience**: the wind bed's gain and filter blend toward a
  blizzard with the weather and fall quiet underground. The oscillator keeps
  running, so ambience never restarts when you open a menu or change region.
- **Credits screen** reachable from the main menu, plus a **save-slot summary**
  under Continue (day, region, survivor level, objectives, difficulty) so the
  button reflects a real save rather than just being enabled.
- **Autoplay honesty**: where the browser blocks sound until interaction, the
  menu and Settings say so instead of appearing broken (`game.audioReady`).
- **HUD visual hierarchy**: Health and Temperature are life-critical and render
  at full weight; Food, Water and Stamina sit back at reduced opacity and a
  thinner bar until they approach a warning threshold. A stronger scrim keeps
  the panel legible over both bright snow and dark cave interiors.
- **State is never communicated by colour alone** (spec 4): blocked recipes
  gain a warning icon and the word "Locked", material chips carry ✓/✕ glyphs
  plus a tooltip stating exactly how many more are needed, and locked map
  regions are labelled "locked" in text.
- **High-contrast mode** in Settings: denser panels, brighter body text and
  stronger borders, while keeping semantic colours distinguishable.
- **Layout fix**: the objective tracker sat at `bottom-left` — directly inside
  the virtual joystick's 48%×46% touch zone. On touch it now moves to the
  opposite side of the stick and lifts above it. The ration belt and action
  cluster were re-anchored to `env(safe-area-inset-*)` on every edge.
- **Touch hardening**: added `onPointerLeave` / `onLostPointerCapture` as a
  final guard against stuck movement, a 90 ms debounce so a synthesised mouse
  event cannot double-fire an attack, `stopPropagation` so action buttons never
  leak into the movement zone, and a visible pressed state on every button.
- **Notifications** cap at three on screen; story and discovery toasts linger
  longer, and their content always remains readable afterwards in the Journal.

## Phase 5.5 — final logic audit

- **P0 save hardening**: finite X/Y/HP validation, backup recovery when the
  primary key is missing, and collision-corrected restored positions.
- **P1 consistency fixes**: difficulty-scaled enemy health restores before HP
  records; stack-1 gear cannot be duplicated through storage; ending pauses the
  simulation; device settings override stale snapshots in game saves; nested
  Escape returns Settings to Pause before resuming gameplay.
- **P2 leak fixes**: campfire noise sources and bell feedback graphs now
  disconnect, audio context resources release on engine destruction, and both
  audio-activation listeners are removed on unmount.
- **Input/resource hardening**: zero, negative, non-finite and unknown-item
  operations are rejected; transaction validation honours the requested bag.
- Package identity is now `icebound-last-survivor@5.5.0`; `npm run typecheck`
  and `npm run check` are available. Vite was patch-updated to 7.3.7 and esbuild
  to 0.28.2 to resolve the dependency audit; `npm audit` reports 0 findings.
- See `AUDIT_PHASE_5_5.md` for the transparent completeness table, exact fixes,
  verification performed, known risks and recommended Android test plan.

## Phase 6.2 — resident recruitment and settlement management

- **Recruitment** (`src/game/residents.ts`): two honest routes, both gated by
  housing. (1) Four **rescue pods** (new `survivor` container kind, one per
  expedition region) hold named survivors — Maren the Deckhand, Ilya the
  Surveyor, Dr. Vishnev the Medic (sealed lab), Jorah the Warden. Rescue costs
  supplies (paid from camp storage first, then the pack) and the container's
  saved `opened` flag makes the reward physically impossible to double. (2)
  The **Signal Beacon** (new buildable, Stage 3, scrap/crystal/wood, needs the
  Map-2 reveal) broadcasts calls: 2 Hot Stew + 1 Field Medkit each, a
  cooldown, and a fixed six-voice roster that never repeats — no unlimited
  residents, no real money anywhere.
- **Housing capacity**: Stage 2 houses 2, Stage 3 houses 4, the new
  **Bunkhouse** (Stage 2+, 14 wood / 6 stone / 4 ice) adds 3 → 7 total. The
  recruitment UI lists exactly which reason blocks a recruit (no housing,
  full houses, cooldown, missing supplies).
- **Workers**: eight permanent camp posts (timber, stone, ice, foraging,
  water tender, camp cook, field medic, fire tender), each with a real post
  location residents walk to. One worker per post prevents conflicting
  assignments; posts can be assigned, changed and paused from the Work tab.
  Gathering posts carry depletable camp stock that regrows on timers —
  residents never strip world nodes or re-collect a reward. Conversion posts
  consume stored inputs (ice → meltwater, raw meat → cooked meat, frostleaf →
  salve, wood → fire fuel). Everything lands in the Supply Cache through the
  same tx/state helpers the pack uses; a full cache, missing input or a
  missing building blocks the cycle and the UI says why. Residents that
  cannot reach their post stop and report a blocked path instead of grinding
  against collision.
- **Warriors**: two specialisations inside the real combat model — Spear
  Guard (110 hp, heavier hit, holds Gate Watch or Camp Guard) and Kite Scout
  (faster, wider interception ring, Perimeter Patrol). They engage
  wolves/bears/crawlers that close on their post, deal real damage, take real
  clash damage scaled by the difficulty profile, and retreat below 35% hp.
- **Upkeep**: residents eat ~22 food and ~18 drink value per in-game day from
  the Supply Cache (Story mode scales it down with the difficulty profile).
  Missed rations are gradual: hungry residents work at half pace, two-day
  unfed residents rest — nobody starves, nobody is silently deleted, and a
  dawn toast plus the Supplies tab warn before stores run dry.
- **Injury & recovery**: wounded and downed residents recover passively at
  camp (the Medic doubles it), or quickly with stored/held Medkits and Salves
  via the Treat buttons or by walking up to them (E). Residents cannot die
  and cannot be lost — by design, and the UI says so.
- **UI**: the Settlement modal (HUD people icon, `N`, or the Bunkhouse/Beacon
  in the world) has five working tabs — Overview (housing + defence readiness
  + production snapshot), Residents (identity, role, health, task, trait,
  equipment, condition, pause/treat, recruitment panel with live requirement
  chips and expedition guides), Work (assignment with conflict prevention,
  live progress bars, input/output chips, camp stock and exact blocked
  reasons), Warriors (posts and combat numbers) and Supplies (larder, daily
  demand, days of rations, offline rules). Fully usable on touch layouts.
- **Offline progress is deterministic**: a wall-clock stamp saved with every
  write drives a single load-time catch-up (≤40 units per post, ≤3 missed
  upkeep days, 8-hour accrual ceiling, backwards clocks earn nothing).
  Reloading cannot duplicate production because the stamp persists with the
  save.
- **Save v5**: adds the settlement record (resident identities, roles,
  health, injuries, tasks, posts, production progress, camp stock, roster
  pointer, cooldown, upkeep day, offline stamp). V1–V4 saves migrate forward
  to an empty settlement; resident payloads are sanitised field by field.

## Phase 6.3 — autonomous guard AI and base defense

- **Explicit state machine** (`src/game/guards.ts`): `idle · patrol · guard ·
  alert · pursue · attack · recover · retreat · injured · return`. Every
  transition lives in one `updateGuard` switch with documented entry/exit
  conditions, and three separate hysteresis bands stop state thrash: a
  **0.45 s sighting confirmation** before committing, a **2 s lost-target
  grace** before forgetting, and an **attack range entered at `reach` but only
  left past `reach × 1.35`**. Measured: 200 ticks of a wolf jittering straight
  across a guard's detection boundary produce 11 state changes, not hundreds.
- **Assignments and patrol routes**: eight fixed, collision-safe defensive
  positions — Gate Watch, Shelter Guard, Cache Guard, Bunkhouse Guard, Beacon
  **Watchtower** (longer sightlines, needs the beacon built), Rally Point, and
  **Inner / Outer patrol routes** of six waypoints each. Movement reuses the
  existing `collideAt` world, so guards cannot walk through walls; a blocked
  waypoint is skipped rather than ground against, and a guard that cannot
  reach its post falls back to a safe idle instead of shoving scenery.
- **Detection has real rules**: a guard only sees inside its assignment's
  watch radius (scouts +60, the Watchful trait +70, lamps +10%, blizzards
  −25%), and **sightlines are blocked by solid structures** — no guard is
  omniscient. Dead beasts, prey hares and still-buried crawlers are never
  targets. Alarms are **local, not global**: clashes and attacks on residents
  shout within 520 units, so distant guards stay at their posts.
- **Target priority** implements the required ladder — attacking this guard ›
  attacking a civilian (roused beasts only; standing nearby is not an attack) ›
  threatening a critical structure › any other hostile in the area — with
  distance as a tiebreaker and **sticky targeting** so two equidistant wolves
  cannot cause oscillation. Three player-selectable policies per guard:
  *Balanced*, *Protect People*, *Hold the Line*.
- **A hard leash per assignment** (240–520 units) means a guard never abandons
  a critical position to chase across the map; an out-of-leash target is
  dropped and the guard walks back.
- **Combat reuses the game's systems**: guards damage the same `Enemy`
  objects the player fights, knock them back, wake them, and route kills
  through the single `onEnemyKilled` path (loot, XP, stats, respawn). Each
  swing is windup → **exactly one damage application, latched by `hitDone`** →
  recovery, so an attack can never double-hit and an interrupted swing cannot
  resume mid-strike. Clashes wound the guard back, reduced by real armour.
- **Equipment is real inventory**: weapons (Stone/Salvaged Axe, Hunting and
  Reinforced Spear, Crystal Blade) and armour (Parka, Insulated Coat, Thermal
  Suit) are *moved out of* the shared settlement pool onto the guard, so the
  same spear cannot arm two guards and unequipping returns it. Spears add
  reach, better weapons add damage, armour adds damage reduction, and
  cold-rated kit reduces the blizzard speed penalty. **No bow or ammunition
  exists in this game, so no archer specialisation was invented** — the Kite
  Scout instead harries: it strikes and gives ground between blows.
- **Injury and recovery** use a wide anti-flip-flop band: a guard disengages
  below **35%** health and only returns to duty above **70%**, resting at the
  rally point (the Medic doubles recovery) or treated instantly with stored
  Medkits/Salves. Residents still cannot die.
- **Friendly fire is impossible** (residents are never acquired as targets)
  and a pairwise separation pass keeps units from stacking or plugging the
  gate mouth — including the degenerate case of perfectly overlapping units
  after a load.
- **Performance**: the expensive step (target acquisition with sightline
  tests) runs on a **staggered 0.3 s interval per guard**, never per frame;
  movement is one vector plus the shared collision resolve. Guard numbers are
  bounded by housing capacity (max 7 residents).
- **Save/load**: identity, role, specialisation, assignment, patrol progress,
  equipment, health, injury, recovery, priority policy and defensive kills all
  persist. **Transient combat state is deliberately not restored** — swing
  timers, hit latches, current target, cooldowns and the camp alarm are
  cleared, and every guard resumes in a valid state (`return`, or `injured`
  when hurt). Phase 6.2 posts (`camp`, `perimeter`) migrate to the new
  assignments; unknown posts, non-equipment items and bad policies are
  rejected on load.
- **Verification**: 81 assertions in `tools/phase63.test.ts` plus 27 Phase 6.2
  regression assertions in `tools/phase62.test.ts` exercise the real
  settlement tick (these are developer harnesses, not in-game autoplay). They
  found three genuine bugs during development — a module-initialisation crash
  from the residents⇄guards import cycle, an operator-precedence error in the
  threat term, and units stacked at identical coordinates never separating.
  See the Phase 6.3 completion notes for the honest testing scope.

## Phase 6.4 — nightly attacks, the weekly horde and the Great Beast Tide

- **One calendar, one clock** (`src/game/siege.ts`): every schedule derives
  from the existing game clock (`s.time` / `BAL.dayLength`) — weeks are
  7-day multiples, the Tide is 28. There is no second clock, no wall-clock
  login coupling; pausing the game pauses the calendar, and the saved anchors
  ride the normal versioned save.
- **Fair timing, honest preview**: the nightly pack rolls in during the night
  window with a short warn; the weekly horde is visible counting down most of
  a day ahead; the Tide telegraphs nearly half a day out. The Defence board
  (HUD shield / `D`) shows time-to-impact, threat band, exact planned pack
  size, the species present (from the real plan), prep advice from live
  readiness weaknesses, and the wave plan before the first beast spawns.
  Major events **only fire while the player is home**, so nothing ever begins
  while nobody can answer.
- **Nightly** attacks: a deterministic-per-night roll (30% + level scaling,
  after a two-night grace), 1–3 wolves/crawlers from one direction, hard live
  cap 6, retreat deadline 90 s; an unanswered pack **melts away at dawn** —
  no reward, no penalty.
- **Weekly horde**: two waves — a front push, then a swing from the flank
  with **bears as wall-breakers** (when survivor level ≥ 7). Waves spawn from
  the periphery ring (they walk in; nothing teleports), breakers beeline for
  the nearest standing structure and hit it for real integrity damage.
- **Monthly Great Beast Tide**: three timed pushes (prowlers → flanked
  heavies → the announced **Tide-Mother**, a genuinely buffed bear that always
  walks on even at the live cap), a readable warning per wave, retreat after
  220 s so nothing attacks forever.
- **Resolution is graded from the actual fight**: *full / partial / heavy
  damage / attackers retreat / overrun*, with the live ledger — beasts
  defeated, defender casualties, structure damage, spike procs — and a
  completion report. Outcome-scaled rewards (full pays best, failed almost
  nothing), XP, and **exactly-once rewards**: the event id locks before any
  grant, the `done` ledger persists, and a mid-fight reload can never re-pay.
- **Structure damage is persistent, bounded and repairable**: siege strikes
  chip integrity (spikes/outpost/bunkhouse/beacon); zero integrity takes the
  facility offline until rebuilt. Repairs cost real wood + stone per point
  from the shared pool. Offline resolution never drops a structure to zero.
- **Defence readiness is real state only** — fit armed guards on assignment,
  spikes standing (and repaired), shelter stage, housing coverage, cached
  rations, carpentry stock, watchtower sightlines — 0–100 with per-line
  weakness breakdown, and it feeds both the event sizes and the offline
  outcome estimate.
- **Offline, safely** (per the spec's "safer approach"): no enemies spawn
  while closed; only events that were **armed with their warning and reached
  their anchor in game-time** resolve — at most two, deduped by the ledger,
  with bounded damage that can't erase anything and at most one wounded
  guard; nightly packs announced but never answered dissolve; the calendar
  advances past consumed anchors once; a backwards device clock yields
  nothing; the same save re-loaded re-runs nothing. A single report summarises
  the gap on the Defence board.
- **Performance**: live attackers capped at six (leader exempt by one), waves
  on timers, spikes throttled to two procs per event, no per-frame scanning
  added — the ticker only reads small arrays already maintained by the
  settlement loop.
- **Save**: the `siege` record is appended to the existing version-5 save
  (calendar anchors, live events, the reward ledger, history, structure wear);
  older saves migrate forward untouched; corrupt payloads sanitise field by
  field.
- **Testing**: 74 assertions in `tools/phase64.test.ts` drive the real ticker
  headlessly (calendar, nightly rules, wave limits, leader, resolution grades,
  reward deduplication across a simulated reload, offline bounds, rollback
  safety, structure repair economy, readiness sensitivity). 27 + 81 earlier
  assertions in `tools/phase62.test.ts` / `tools/phase63.test.ts` still pass —
  the settlement and guard AI were not regressed. Developer harnesses only;
  nothing enters the shipped bundle, and no browser play-testing is claimed.

## Phase 6.5 — Command Center and defence strategy

- **One board that connects everything** (`src/ui/Command.tsx`, `G` or the HUD
  gauge): four tabs — Status, Checklist, Orders, Reports. Every figure comes
  from `commandSnapshot()` reading live state; there are no placeholder
  numbers (verified by mutating state and re-reading: wood 7→12, idle workers
  1→0, readiness falling when the spikes break).
- **Status** shows the real game day and daylight phase, shelter readiness
  with its failing lines spelled out, countdowns for all three siege tiers
  (a passed anchor honestly reads *due now*), fit-vs-total guards, unassigned
  workers, injured/downed residents, damaged structures with inline repair,
  repair stock against the outstanding carpentry bill, ration days, medicine,
  housing occupancy and outpost stage.
- **Preparation checklist** (`prepChecklist()`): nine derived, inspectable
  recommendations — repair damaged structures (quoting the real material
  bill), fix or build the spike trap, recruit/resume guards, arm bare-handed
  warriors (and whether a spare weapon is already in the cache), treat the
  wounded, stock rations, stock medicine, clear **blocked patrol routes**
  (read from the guard FSM's real stuck detector) and post idle workers. Each
  expands to an explanation and a **navigation** button. Nothing on this
  screen spends resources or builds anything — asserted in the test suite.
- **Defence priorities that actually work** (`DOCTRINES` in `guards.ts`):
  Balanced · Protect the Shelter · Protect the Stores · Protect the Residents
  · Hold the Main Gate · Kill the Wall-Breakers. The doctrine re-weights the
  asset term inside `scoreTarget`, which is exactly what `acquireTarget`
  ranks by, so changing it changes real target selection on the next scan —
  verified by flipping the ranking of two equidistant beasts and by proving
  *Kill the Wall-Breakers* hunts a tagged breaker over a closer wolf.
- **Editable patrol routes**: a new **Custom Route** assignment whose circuit
  the player builds from ten real camp waypoints (max 6 stops, ordered,
  de-duplicated, validated). `liveAssignment()` resolves it at runtime, so
  guards genuinely walk the authored circuit; a route shorter than two stops
  falls back to a valid circuit and the UI reports why it is unusable.
- **Assignment conflicts and unreachable posts**: the Orders tab lists which
  guards share a post, and flags posts that cannot be taken — unbuilt
  Bunkhouse/Beacon, a **destroyed** building, or an under-length custom route
  — with the disabled options greyed out in the picker.
- **Event reports**: date, type, outcome, defeated/total, structural damage,
  destroyed buildings, casualties, rewards granted and the recovery cost at
  the time, newest first, **bounded to 24 entries** through both the live
  ledger and the save round-trip.
- **Player control preserved**: the Command Center only reads state and issues
  orders (doctrine, assignment, route, and explicit per-point repairs).
  Residents and guards keep doing their existing assigned routine work. No
  AFK progression, no auto-play, no automated gameplay simulator.
- **Mobile UI**: scrollable tab rail, two/three-column metric grids that
  collapse to two on narrow screens, collapsible checklist rows, full-width
  touch targets, and the existing safe-area-aware modal shell. The board is a
  modal, so the core HUD and controls are never permanently obscured.
- **Save**: `doctrine` and `customRoute` are appended to the existing siege
  record; pre-6.5 saves default to Balanced with a valid starter circuit, and
  corrupt values sanitise back to safe defaults.
- **Verification**: 71 new assertions in `tools/phase65.test.ts`; the 6.2 /
  6.3 / 6.4 suites still pass (27 / 84 / 74) after updating two Phase 6.3
  expectations that legitimately changed when the ninth (custom) assignment
  was added. Developer harnesses only — excluded from the shipped bundle.

## Phase 6.6 — shelter defence balancing & system integration (audit)

A review-and-hardening pass over the whole Phase 6 chain, pinned by a fifth
harness (`tools/phase66.test.ts`, 47 assertions). Full detail lives in
`AUDIT_PHASE_6_6.md`; the short version:

- **Fixed — nightly re-arm bug**: a resolved night pack could re-roll inside
  the same night because the roll gate only looked at pending events; the
  `done` ledger now blocks same-day re-arms.
- **Fixed — dishonest wave previews**: weekly/monthly waves no longer spawn
  species the plan never advertised; escalation climbs only the announced
  threat pool, so low-level tides are wolves and the preview is exact.
- **Fixed — meaningless hull destruction**: the outpost hull now bottoms out
  at 1 integrity ("breached — core holds") instead of a state nothing reads;
  spikes/bunkhouse/beacon stay genuinely destroyable and rebuildable.
- **Fixed — readiness vs holes**: hull integrity feeds the readiness score.
- **Verified, not bugs**: atomic crafting with full-step aborts, already-built
  blocks, stack-1 gear duplication refusal, guard one-hit/swim lanes, leash,
  pause-safe AI, residents' floor-1 health + guaranteed recovery, per-day
  upkeep dedupe, offline stamp/rollup safety, and reward ledgers that survive
  reload-without-repay.
- **Balance unchanged numerically** beyond the fixes: sizes and damage sit
  inside the Phase 5.2 audited numbers, with sizes keyed to survivor level AND
  the camp's real readiness.

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Move | WASD / arrows | Virtual joystick (side configurable) |
| Sprint | Hold Shift | Push stick to the rim |
| Eat / Drink / Heal (ration belt) | 1 / 2 / 3 | Belt icons (bottom centre) |
| Survivor Record | P | HUD award button |
| Settlement | N | HUD people button · Bunkhouse/Beacon |
| Defense board | D | HUD shield button |
| Command Center | G | HUD gauge button |
| Interact / gather | E or F | Context action button |
| Attack | Space | Sword button |
| Dodge | Q | Wind button |
| Inventory / Craft | I / C | HUD buttons |
| Map / Logs | M / J | HUD buttons |
| Pause | Esc | HUD button |

Every action is reachable by touch alone; nothing depends on hover or keyboard.

## Post-v3 polish additions

- **Ration belt** (`src/ui/QuickBelt.tsx`): persistent one-tap Eat / Drink / Heal
  slots that read the inventory live. Priority is fixed and safe — stew → cooked
  meat → glowcap → berries; meltwater → ice; medkit → salve. Raw meat is never
  auto-eaten. Buttons show live counts, pulse when the matching attribute is
  critical, and explain themselves via toast when empty. Integrated with the
  existing `useItem` path, the 1/2/3 keys, the Help screen and the inventory's
  item detail panel. No new save fields: the belt derives from `inv`, so it
  survives loads for free.
- **Gate guidance**: when the active objective lives in another region, the
  on-screen quest arrow now points at the local expedition gate and labels it
  `GATE`, instead of rendering nothing.
- **Guided Expedition Log** (`src/ui/TaskLog.tsx`, `src/game/tasks.ts`): every
  story objective now expands into exact live requirements (for example Wood
  4/8, Stone 3/6, Campfire 0/1), where to go, how to perform the interaction,
  required recipes/tools, and the reward/unlock. The engine's V2 quest loop was
  also repaired: it now tests and completes the active quest directly instead
  of waiting for an impossible quest-ID change.
- **Daily Tasks**: three deterministic, progression-aware field assignments per
  in-game day. Only deliberate gather/craft/cook/kill/container/travel events
  advance them; there is no AFK progress, login streak, wall-clock timer or
  online service. Rewards are delivered immediately; overflow goes to the
  Supply Cache (or is dropped beside the player if both stacks are full), and
  all task progress persists in the version-3 local save.
- **Map 1 restoration roadmap**: the Research Outpost now presents one explicit
  construction route instead of four unrelated disabled recipes: Repair Hull
  (8 Wood, 6 Stone) → Campfire (5 Wood, 3 Stone) → Warm Quarters / Stage 2
  (6 Wood, 4 Stone, 2 Ice) → Operational Outpost / Stage 3 (12 Wood, 8 Stone,
  4 Ice). Each milestone shows its gameplay benefit, exact materials, source
  shortcuts to the Field Handbook, and only the valid next build action.
  Construction prerequisites are recipe metadata (`upgradeTo`, `minStage`,
  `requiresCampfire`) rather than hard-coded recipe IDs. Completing all four
  milestones marks Map 1 complete; interacting with the Expedition Gate then
  reveals the Frozen Shipwreck route. The Map screen previews this locked route
  and its live 0/4 restoration checklist instead of hiding why it is locked.
- **Field Handbook** (`src/ui/Handbook.tsx`, opened from How to play / Field
  Handbook on the menu and pause screens): a three-tab guide whose content is
  derived from the live game data, so it cannot drift out of sync — a Controls
  tab (keys + survival basics), a Resources tab (every gather source with its
  verb, strikes, respawn, the tool tier it needs, which regions contain it,
  which recipes consume it, plus creature drop tables) and a Regions tab (the
  expedition map explained: threat, dangers, resources, entry requirements and
  which objective reveals each region). Locked regions stay hidden until
  revealed, matching the travel map.

---

## Known limitations

- **Base building uses fixed, marked build sites** rather than free placement.
  This is deliberate: it guarantees the paths to the shelter, fire and gate can
  never be blocked. Each site shows a dashed "BUILD SITE" preview until built.
- **No equipment durability.** Progression is expressed through tool/weapon/
  armour tiers instead, to avoid repetitive maintenance chores.
- **Ordinary creatures respawn** on a timer so pelts, hide and chitin stay
  farmable late game. The Frost Guardian does not respawn.
- **Performance targets are goals, not measurements.** The adaptive monitor aims
  at 30 FPS on weak hardware and 60 FPS on capable hardware; actual numbers have
  not been profiled on physical Android devices.
- **Android/WebView behaviour is unverified.** The build is WebView-shaped (one
  self-contained file, no absolute asset paths, touch-first input, safe-area
  padding, `user-scalable=no`), but it has not been run inside Android Studio
  from here.
- **No Capacitor project, no App Bundle, no signing keys** are included, per
  scope. To integrate later: `npm run build`, then point Capacitor's `webDir` at
  `dist`. Because the output is a single self-contained `index.html`, no asset
  path rewriting should be required.
- Audio is fully synthesized at runtime (WebAudio). Browsers require a user
  gesture before sound starts; the first tap or key press unlocks it.
