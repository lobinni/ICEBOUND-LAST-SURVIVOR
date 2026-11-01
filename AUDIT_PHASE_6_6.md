# Phase 6.6 — Shelter Defence Balancing & System Integration audit

Scope: the Phase 6 chain (6.1 construction → 6.2 residents/settlement → 6.3
guard AI → 6.4 sieges → 6.5 command center), plus the shared economy seams it
touches: crafting/transactions, save/load, offline catch-up.

Method: source inspection + five headless harnesses in `tools/` that drive the
real tick functions (27 / 84 / 74 / 71 / 47 assertions respectively). No
browser or device runtime testing was performed for this phase.

---

## 1. Systems inspected

| Area | Files | Verdict |
| --- | --- | --- |
| Crafting & construction | `systems.ts` (`recipeStatus`, `craftRecipe`) | already sound: atomic pay, space-first result guarantee, already-built gating |
| Settlement production | `residents.ts` (`advanceProduction`) | atomic input→output, storage-first, stock-regrowth capped; cancel-safe |
| Guard combat | `guards.ts` (FSM, `performSwing`, `separateResidents`) | one-hit-per-swing latch, leash, staggered scans |
| Siege lifecycle | `siege.ts` | two real bugs found + fixed (below) |
| Command center data | `siege.ts` (`commandSnapshot`, `prepChecklist`) | all live reads; one preview-honesty bug fixed |
| Save & migration | `save.ts`, `sanitizeSettlement`, `sanitizeSiege` | additive fields, field-wise sanitisation, dedup ledgers |
| Offline & clock | `applyOfflineSettlement`, `applyOfflineSieges` | bounded, stamp-driven, rollback-safe |

## 2. Bugs found and fixed

1. **Nightly packs could re-arm inside the same night.** The roll gate checked
   only *pending* events; a resolved event is archived within the same tick,
   so the deterministic same-day roll would re-arm immediately — packs could
   chain all night. The gate now also rejects any day already present in the
   `done` ledger (and still blocks while any pack for that day exists).
   *Pinned by audit test #1: after a full resolution, 30 more in-night seconds
   produce zero new events.*
2. **Wave previews were dishonest.** Weekly/monthly wave tables hardcoded
   crawlers and bears even when the announced threat pool contained wolves
   only — and unfair species arrived under-leveled. `buildWaves` now climbs
   the announced pool only (heavies = bear → crawler → wolf; pests = crawler →
   wolf), so the Defence board's species list is exactly what spawns.
3. **The outpost hull could reach 0 integrity with no meaning.** It has no
   build flag to take offline. It now bottoms out at 1 ("breached but the
   core holds"); spikes/bunkhouse/beacon remain genuinely destroyable and
   rebuildable, per the event design.
4. **Readiness ignored hull integrity.** The Stage line now scales with the
   hull's current integrity, so breaches visibly weaken the score.

Additional issues validated as *not* bugs after inspection/harness:
- Crafting a stackable result with a full stack aborts cleanly — inputs stay,
  neighbours stay, nothing silently disappears (economy test).
- Building a built facility / crafting a duplicate stack-1 gear piece is
  refused by the pre-existing gates.
- Unequipping guard gear physically returns items to the shared pool — the
  same spear cannot arm two guards and cannot vanish.
- Guards release dead targets immediately (`isHostile` re-checks on a
  staggered scan) — dead enemies are never attacked and never attack.
- Resident wounds cannot be permanent: rest regen always lifts `downed` and
  then `injured`; there is floor-1 health, no resident death path.
- Daily upkeep consumes exactly once per day boundary through the real tick;
  direct helper calls (offline loop) are the intended per-missed-day path.
- `tasks producing resources after cancellation`: `assignTask(id, null)`
  leaves a residue-less state; verified 120 s of ticks produce nothing.

## 3. Balance adjustments this phase

- Wave species honesty (item 2) removes unfair early-game bears/crawlers and
  removes hidden power spikes from previewed hordes.
- Structure damage floors and caps: per-event total ≤ 5 points; hull ≥ 1
  always — a failed defence degrades the camp but leaves it recoverable.
- Offline resolution is gentle: ≤ 2 events, ≤ 2 points of wear, at most one
  wounded defender, and nightly packs never apply offline at all.

No numeric rebalance was *otherwise* needed: guard tiers (bare ≈ 6 dmg →
reinforced spear 24) and siege packs (night ≤ 3, weekly 4–8, tide 6–11 with a
2.1× leader) already sit inside the combat numbers the Phase 5.2 audit
verified, and readiness scaling ties size to the camp's real defences.

## 4. Save migration behaviour

- Version remains 5 (all Phase 6 data is additive by design).
- 6.2-era settlement payloads (no guard fields) migrate to valid assignments
  (`camp → shelter`, `perimeter → patrol_outer`), gain gear slots, and resume
  in `return` state with transient combat state cleared.
- Missing siege records yield a clean calendar; unknown doctrines sanitise to
  Balanced; custom routes re-validate against the waypoint table.
- A valid old save is never overwritten by a half-paylod: the write path's
  plausibility gate predates Phase 6 and still applies; corrupt payloads fall
  back to the rolling backup slot.
- Reward ledgers (`done`) persist across reloads; re-opening a save can never
  re-pay a resolved event (verified by serialize→sanitize→resolve replay).

## 5. Performance risks (mobile)

- Worst-case live entities: ≤ 7 residents + ≤ 6 siege enemies (leader exempt
  by +1) + world enemies with existing LOD. Bounded by design.
- Guard target acquisition is interval-staggered (0.3 s + per-index offset);
  per-frame work per resident is one vector move + shared collision resolve.
- HUD/Command Center recompute at the existing ~5.5 Hz UI cadence only.
- Remaining unmeasured risk: all numbers target 60/30 FPS goals from the
  engine's perf tiers; no physical Android profiling has been run.

## 6. Still incomplete (honest list)

- No browser/device runtime test of the siege phases (harnesses only).
- Free-form route drawing; Phase 6.5 routes are waypoint selection from 10
  fixed pads (consistent with fixed build sites).
- No enemy damage model for enemy-vs-structure *Health* — breakers strike
  integrity via `strikeStructure`, not via inherited HP.
- Radio/signal content does not interact with sieges (watchtower only widens
  detection).
- Armour for residents other than warriors is cosmetic-only by design.

## 7. Manual Android testing still required

- Real-device FPS during a tide with 6+1 actives + particles at snow 1.0.
- WebView: single-file inline size after Phase 6 (~3.0 MB HTML), joystick
  fall-off during horde toasts, modal dismissal mid-siege (pause correctness),
  and autosave-on-hide during an active siege.
