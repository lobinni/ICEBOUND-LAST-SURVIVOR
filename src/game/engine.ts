// ── ICEBOUND V2: engine — loop, regions, weather, hazards, rendering ───────

import { AudioEngine } from "./audio";
import {
  BAL, ENEMY, ITEMS, REGION_ORDER, LOGS, LOOT, NODE_INFO, REGIONS, WEATHER, WORLD, phaseOf,
} from "./config";
import { addItem, capacity, countItem, createState, removeItem, syncRegionViews, usedSlots } from "./state";
import {
  activeSideQuests, canGather, craftRecipe, currentQuest, equipItem, fireAction,
  gatherTime, forestCompletion, QUESTS, tickSurvival, useItem, type QuestDef,
} from "./systems";
import { availableTransmissions } from "./story";
import { markTipSeen, pickTutorialTip, resetTips } from "./tutorial";
import { applySave, clearSave, hasSave, readSave, writeSave } from "./save";
import { buildAllRegions, renderRegionGround } from "./regions";
import { drawPickup, drawPlayer, drawResident, setShadowQuality } from "./sprites";
import {
  drawContainer, drawDevice, drawDiscovery, drawEnemyAny, drawHazard, drawNodeAny,
  drawProjectile, drawStructAny,
} from "./sprites2";
import { collideAt, damageReduction, updatePlayer } from "./actors";
import {
  applyOfflineSettlement, broadcastCall, callStatus, rescueStatus, rescueSurvivor,
    RESCUES, setWarriorPost, setGuardPriority, assignTask, tickSettlement, togglePause,
  treatResident, poolPay, type RescueDef, type TaskId, type WarriorPost,
} from "./residents";
import { equipGuard, type GuardPriority } from "./guards";
import {
  activeSiege, applyOfflineSieges, prepAdvice, readiness, repairStructure,
  siegeSummary, tickSiege, updateSiegeSteering, timeUntil,
  assignmentHolders, assignmentIssue, commandSnapshot, prepChecklist,
  setCustomRoute, setDoctrine,
} from "./siege";
import { DOCTRINES } from "./guards";
import { PerfMonitor, PROFILES, type QualityProfile, type Tier } from "./perf";
import { updateEnemies } from "./enemies";
import { ensureDailyTasks, recordDailyEvent } from "./tasks";
import { materialGuidePoint } from "./guide";
import { DIFFICULTIES, profileOf, type DifficultyId } from "./difficulty";
import { rescaleEnemiesForDifficulty } from "./state";
import { grant } from "./tx";
import { buyUpgrade, grantXp, progMaxHp, progMaxStamina, XP, type UpgradeId } from "./progression";
import { DISCOVERY_HINT_RADIUS, DISCOVERY_RADIUS, totalDiscoveries } from "./discoveries";
import type {
  Enemy, GameState, Interact, ItemId, Modal, RegionId, ToastMsg, WeatherKind, WNode,
} from "./types";

export type QuickKind = "food" | "drink" | "heal";

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; grav: number; glow: boolean }
interface Floater { x: number; y: number; t: number; txt: string; color: string }
interface Print { x: number; y: number; a: number; ang: number }
interface Flake { x: number; y: number; z: number; drift: number }
interface Wave { x: number; y: number; r: number; max: number; t: number }

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

export class Game {
  state: GameState = createState();
  audio = new AudioEngine(() => this.state.settings);

  fx = {
    sfx: (n: string) => this.playSfx(n),
    float: (x: number, y: number, txt: string, color?: string) => this.floats.push({ x, y, t: 0, txt, color: color ?? "#fff" }),
    toast: (t: Omit<ToastMsg, "id">) => this.toast(t),
    burst: (x: number, y: number, kind: string, n?: number) => this.burst(x, y, kind, n ?? 10),
    shake: (a: number) => this.addShake(a),
    bump: () => this.bump(),
  };

  keys = new Set<string>();
  joy = { x: 0, y: 0, active: false };
  hitstop = 0;
  slowT = 0;

  private actQ: string[] = [];
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private grounds = new Map<RegionId, HTMLCanvasElement>();
  private raf = 0;
  private lastTs = 0;
  private W = 0; private H = 0; private dpr = 1; private zoom = 1;
  private cam = { x: WORLD.spawn.x, y: WORLD.spawn.y - 200 };
  private menuAng = 0;

  private particles: Particle[] = [];
  private floats: Floater[] = [];
  private prints: Print[] = [];
  private flakes: Flake[] = [];
  private waves: Wave[] = [];
  private gust = 0; private gustT = 6;

  private subs = new Set<() => void>();
  private evs = new Map<string, Set<(p?: unknown) => void>>();
  ver = 0;

  private hudAcc = 0; private saveAcc = 0; private questAcc = 0; private respawnAcc = 0;
  private lastQuestId: string | null = null;
  private warnCd = { freeze: 0, starve: 0, thirst: 0, hazard: 0 };
  private wasLit = false;
  private flashT = 0;
  private shakeMag = 0;
  private toastId = 0;
  private projId = 0;
  private destroyed = false;
  private fireAcc = 0;
  private fadeT = 0;
  private ambAcc = 0;
  perf = new PerfMonitor();
  private q: QualityProfile = PROFILES.high;
  private drawBuf: { y: number; k: number; r: unknown }[] = [];
  drawN = 0;
  loadProgress = 0;
  private attached = false;
  private lastTipAt = -99;
  private lastStormLevel = -1;
  private modalReturn: Modal = null;
  private saveErrorWarned = false;
  fatalError: string | null = null;
  bannerT = 0;
  bannerRegion: RegionId | null = null;
  private trip: { region: RegionId; gathered: number; kills: number; logs: number; containers: number; t: number } | null = null;
  private moteAcc = 0;

  // ══ lifecycle ════════════════════════════════════════════════════════════

  constructor() {
    this.state.regions = buildAllRegions();
    syncRegionViews(this.state);
    this.perf.reset(PerfMonitor.initialTier());
    this.applyQuality();
    this.state.screen = "loading";
  }

  /** Resolve the active quality profile from settings + auto monitor. */
  applyQuality() {
    const q = this.state.settings.quality;
    const tier: Tier = q === "auto" ? this.perf.tier : q;
    this.q = PROFILES[tier];
    setShadowQuality(this.q.groundShadows);
    if (this.canvas) this.onResize();
  }
  get quality() { return this.q; }
  get activeTier(): Tier {
    const q = this.state.settings.quality;
    return q === "auto" ? this.perf.tier : q;
  }

  attach(canvas: HTMLCanvasElement) {
    // Re-attaching (React remount, StrictMode double-invoke) must not
    // duplicate listeners or reset the loading pass.
    if (this.attached) {
      this.destroyed = false;
      this.canvas = canvas;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) {
        this.fatalError = "Canvas 2D is unavailable in this browser or WebView.";
        this.bump();
        return;
      }
      this.ctx = ctx;
      this.onResize();
      return;
    }
    this.attached = true;
    this.destroyed = false;
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      this.fatalError = "Canvas 2D is unavailable in this browser or WebView.";
      this.bump();
      return;
    }
    this.ctx = ctx;
    this.loadSettings();
    this.applyQuality();
    this.ground();
    this.onResize();
    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVis);
    window.addEventListener("pointerdown", this.onFirstGesture, { passive: true });
    window.addEventListener("touchstart", this.onFirstGesture, { passive: true });
    this.warmup();
    this.lastTs = performance.now();
    const loop = (ts: number) => {
      if (this.destroyed) return;
      const dt = Math.min(0.05, (ts - this.lastTs) / 1000);
      this.lastTs = ts;
      this.frame(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    // Only tear down what attach() set up; a second call is a no-op so React
    // StrictMode's mount/unmount/mount cycle cannot wedge the loop.
    this.destroyed = true;
    this.attached = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onVis);
    window.removeEventListener("pointerdown", this.onFirstGesture);
    window.removeEventListener("touchstart", this.onFirstGesture);
    this.audio.stopAll();
  }

  /** Bake every region's terrain up-front, one per frame, behind a loading screen. */
  private warmup() {
    if (this.state.screen !== "loading") return;
    const order = REGION_ORDER.slice();
    let i = 0;
    const step = () => {
      if (this.destroyed) return;
      if (i < order.length) {
        const id = order[i++];
        if (!this.grounds.has(id)) this.grounds.set(id, renderRegionGround(id));
        this.loadProgress = i / (order.length + 1);
        this.bump();
        requestAnimationFrame(step);
        return;
      }
      this.loadProgress = 1;
      this.state.screen = "menu";
      this.bump();
    };
    requestAnimationFrame(step);
  }

  private ground(): HTMLCanvasElement {
    const id = this.state.region;
    let g = this.grounds.get(id);
    if (!g) { g = renderRegionGround(id); this.grounds.set(id, g); }
    return g;
  }

  private onFirstGesture = () => {
    this.audio.unlock();
    this.audio.applyVolumes();
    this.audio.startWind();
    if (this.state.settings.music > 0) this.audio.startMusic();
    if (this.state.shelter.fire.lit && this.state.region === "forest") this.audio.setFire(true);
  };

  private onResize = () => {
    if (!this.canvas) return;
    const c = this.canvas;
    this.dpr = Math.min(this.q.dpr, window.devicePixelRatio || 1);
    this.W = c.clientWidth; this.H = c.clientHeight;
    c.width = Math.max(1, Math.floor(this.W * this.dpr));
    c.height = Math.max(1, Math.floor(this.H * this.dpr));
  };

  private onBlur = () => { this.keys.clear(); this.joy.active = false; };
  private onVis = () => { if (document.hidden && this.state.screen === "game" && !this.state.player.dead) this.saveNow(); };

  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright", "tab"].includes(k)) e.preventDefault();
    this.onFirstGesture();
    const s = this.state;
    if (s.screen !== "game") return;
    if (k === "escape") {
      if (s.modal && this.modalReturn) {
        const back = this.modalReturn;
        this.modalReturn = null;
        this.openModal(back);
      }
      else if (s.modal) this.closeModal();
      else this.openModal("pause");
      return;
    }
    if (s.modal) return;
    if (k === "i" || k === "tab") { this.openModal("inv"); return; }
    if (k === "c") { this.openModal("craft"); return; }
    if (k === "m") { this.openModal("map"); return; }
    if (k === "j") { this.openModal("journal"); return; }
    if (k === "p") { this.openModal("progress"); return; }
    if (k === "n") { this.openModal("settlement"); return; }
    if (k === "d") { this.openModal("defense"); return; }
    if (k === "g") { this.openModal("command"); return; }
    this.keys.add(k);
    if (e.repeat) return;
    if (k === "1") { this.quickUse("food"); return; }
    if (k === "2") { this.quickUse("drink"); return; }
    if (k === "3") { this.quickUse("heal"); return; }
    if (k === "e" || k === "f") this.press("interact");
    else if (k === " ") this.press("attack");
    else if (k === "q") this.press("dodge");
  };

  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.key.toLowerCase()); };

  // ══ pub/sub ═══════════════════════════════════════════════════════════════

  subscribe = (fn: () => void) => { this.subs.add(fn); return () => { this.subs.delete(fn); }; };
  getVer = () => this.ver;
  bump() { this.ver++; this.subs.forEach(fn => fn()); }
  on(ev: string, fn: (p?: unknown) => void) {
    if (!this.evs.has(ev)) this.evs.set(ev, new Set());
    this.evs.get(ev)!.add(fn);
    return () => { this.evs.get(ev)!.delete(fn); };
  }
  emitEvent(ev: string, p?: unknown) { this.evs.get(ev)?.forEach(fn => fn(p)); }

  private toast(t: Omit<ToastMsg, "id">) {
    this.emitEvent("toast", { ...t, id: ++this.toastId } as ToastMsg);
  }

  private playSfx(name: string) {
    if (!this.audio.ready || this.state.settings.sfx <= 0) return;
    const a = this.audio as unknown as Record<string, () => void>;
    if (typeof a[name] === "function") a[name]();
  }

  // ══ public API ════════════════════════════════════════════════════════════

  /** Manual navigation marker. It only highlights the destination; it never
   *  gathers, moves, fights or auto-completes anything. */
  guideTo(x: number, y: number, label: string, color = "#a5e0ff") {
    const s = this.state;
    if (s.screen !== "game") return;
    s.guide = { x, y, label, color, expiresAt: s.time + 90 };
    this.state.modal = null;
    this.state.paused = false;
    this.playSfx("ui");
    this.toast({ title: `Guide set: ${label}`, sub: "Follow the beacon and interact when you arrive.", kind: "info", icon: "compass" });
    this.bump();
  }

  /** Dedicated material shortcuts used by the outpost construction roadmap. */
  guideToMaterial(item: "ice" | "wood" | "stone") {
    const target = materialGuidePoint(this.state, item);
    if (!target) {
      this.toast({ title: "No source nearby right now", sub: "World nodes regrow over time.", kind: "warn", icon: ITEMS[item].icon });
      return;
    }
    this.guideTo(target.x, target.y, `${ITEMS[item].name} — ${target.label}`, ITEMS[item].color);
  }

  newGame() {
    const settings = this.state.settings;
    this.state = createState();
    this.state.regions = buildAllRegions();
    this.state.region = "forest";
    syncRegionViews(this.state);
    this.state.settings = settings;
    this.state.screen = "game";
    ensureDailyTasks(this.state);
    this.cam.x = this.state.player.x; this.cam.y = this.state.player.y - 60;
    this.lastQuestId = null;
    this.particles = []; this.floats = []; this.prints = []; this.waves = [];
    this.onFirstGesture();
    this.saveNow();
    this.bump();
    setTimeout(() => this.toast({ title: "Move: WASD / left stick", sub: "Head north — follow the packed trail.", kind: "info", icon: "move" }), 600);
  }

  continueGame(): boolean {
    const d = readSave();
    if (!d) { this.toast({ title: "No valid expedition found", kind: "error", icon: "warn" }); return false; }
    const settings = this.state.settings;
    let hasGlobalSettings = false;
    try { hasGlobalSettings = !!localStorage.getItem("icebound_settings"); } catch { /* use save settings */ }
    this.state = createState();
    this.state.regions = buildAllRegions();
    this.state.settings = settings;
    applySave(this.state, d);
    // Settings are device-level preferences. When a separate settings record
    // exists, it is newer/more authoritative than the snapshot inside a save.
    if (hasGlobalSettings) this.state.settings = settings;
    // World layouts can evolve between versions. Resolve the restored position
    // against current collision/bounds so an old save cannot load inside a new
    // landmark or outside the playable region.
    const restored = collideAt(
      this.state,
      this.state.player.x,
      this.state.player.y,
      BAL.playerR,
    );
    this.state.player.x = restored.x;
    this.state.player.y = restored.y;
    this.state.screen = "game";
    ensureDailyTasks(this.state);
    // Settlement catch-up ran while the game was closed: deterministic, capped,
    // computed from the persisted wall-clock stamp (clock-rollback safe).
    applyOfflineSettlement(this.state, this.fx);
    // Siege ledger catch-up resolves only events whose anchor fell inside the
    // gap, at their saved game-time — bounded, deduped, never re-rewards.
    applyOfflineSieges(this.state, this.fx);
    this.audio.applyVolumes();
    this.cam.x = this.state.player.x; this.cam.y = this.state.player.y;
    this.lastQuestId = currentQuest(this.state)?.id ?? null;
    this.particles = []; this.floats = []; this.prints = []; this.waves = [];
    this.onFirstGesture();
    const migrated = (d as { migrated?: boolean }).migrated;
    const recovered = (d as { recovered?: boolean }).recovered;
    this.toast({
      title: recovered ? "Backup save recovered" : migrated ? "Expedition save upgraded" : "Expedition restored",
      sub: recovered
        ? "The primary record was invalid; the last known-good backup was restored."
        : migrated
        ? "Your outpost, story progress, inventory and regions carried over safely."
        : `Day ${Math.floor(this.state.time / BAL.dayLength) + 1} — ${REGIONS[this.state.region].name}`,
      kind: "good", icon: "save",
    });
    if (migrated || recovered) this.saveNow();
    this.bump();
    return true;
  }

  backToMenu() {
    if (this.state.screen === "game" && !this.state.player.dead) this.saveNow();
    this.state.screen = "menu";
    this.state.modal = null;
    this.state.paused = false;
    this.bump();
  }

  hasSave() { return hasSave(); }

  /** True once the browser has allowed the audio context to start. */
  get audioReady() { return this.audio.unlocked; }

  /** Lightweight save-slot summary for the main menu. Never mutates state. */
  saveSummary(): { day: number; region: string; level: number; done: number; difficulty: string } | null {
    const d = readSave();
    if (!d) return null;
    return {
      day: Math.floor((d.time ?? 0) / BAL.dayLength) + 1,
      region: REGIONS[d.region]?.name ?? "Frozen Forest",
      level: d.progression?.level ?? 1,
      done: Array.isArray(d.questsDone) ? d.questsDone.length : 0,
      difficulty: DIFFICULTIES[d.difficulty]?.name ?? "Survival",
    };
  }

  resetSave() {
    clearSave();
    this.toast({ title: "Expedition record erased", kind: "info", icon: "trash" });
    this.bump();
  }

  /**
   * Restore every persisted setting. Each field is type-checked so a corrupt
   * value falls back to its default instead of poisoning the game state.
   */
  loadSettings() {
    try {
      const raw = localStorage.getItem("icebound_settings");
      if (!raw) return;
      const v = JSON.parse(raw) as Record<string, unknown>;
      const st = this.state.settings;

      const num = (key: keyof typeof st, lo: number, hi: number) => {
        const x = v[key];
        if (typeof x === "number" && isFinite(x)) {
          (st[key] as number) = Math.min(hi, Math.max(lo, x));
        }
      };
      const bool = (key: keyof typeof st) => {
        const x = v[key];
        if (typeof x === "boolean") (st[key] as boolean) = x;
      };

      // volumes and effects density
      num("master", 0, 1);
      num("music", 0, 1);
      num("sfx", 0, 1);
      num("ambient", 0, 1);
      num("snow", 0, 1);

      // toggles
      bool("shake");
      bool("bigText");
      bool("highContrast");
      bool("tips");

      // enumerated values are validated against their allowed set
      const q = v.quality;
      if (q === "auto" || q === "low" || q === "med" || q === "high") st.quality = q;
      const jh = v.joyHand;
      if (jh === "left" || jh === "right") st.joyHand = jh;
    } catch {
      // Corrupt or unavailable settings storage: keep the built-in defaults.
    }
  }

  setSetting(patch: Partial<GameState["settings"]>) {
    Object.assign(this.state.settings, patch);
    this.audio.applyVolumes();
    if (this.state.settings.music > 0) this.audio.startMusic();
    try { localStorage.setItem("icebound_settings", JSON.stringify(this.state.settings)); } catch { /* noop */ }
    this.bump();
  }

  openModal(m: Modal) {
    if (this.state.screen !== "game") return;
    const from = this.state.modal;
    if (from === "pause" && m && m !== "pause") this.modalReturn = "pause";
    else if (m === "pause") this.modalReturn = null;
    this.joy.x = 0; this.joy.y = 0; this.joy.active = false;
    this.actQ.length = 0;
    this.state.modal = m;
    this.state.paused = m === "pause";
    this.playSfx("open");
    this.bump();
  }

  closeModal() {
    this.modalReturn = null;
    this.state.modal = null;
    this.state.lootOpen = null;
    this.state.paused = false;
    this.playSfx("close");
    this.bump();
  }

  press(action: "attack" | "dodge" | "interact") {
    if (this.state.screen !== "game" || this.state.modal || this.state.player.dead) return;
    if (this.actQ.length < 4) this.actQ.push(action);
  }

  consumeAction(a: string): boolean {
    const i = this.actQ.indexOf(a);
    if (i >= 0) { this.actQ.splice(i, 1); return true; }
    return false;
  }

  setJoy(x: number, y: number, active: boolean) { this.joy.x = x; this.joy.y = y; this.joy.active = active; }

  craft(id: string) { if (craftRecipe(this.state, id, this.fx)) this.saveNow(); }

  get difficulty() { return profileOf(this.state.difficulty); }

  /**
   * Defeat recovery. Always available, so a player whose autosave sits inside
   * a death spiral can never be permanently trapped. Story progress, unlocks,
   * equipment, base state and survivor progression are all preserved; the cost
   * is a difficulty-scaled share of carried RAW MATERIALS only.
   */
  recoverAtOutpost(): { lost: { item: ItemId; n: number }[] } {
    const s = this.state;
    const D = profileOf(s.difficulty);
    const lost: { item: ItemId; n: number }[] = [];

    if (D.deathMaterialLoss > 0) {
      for (const [raw, qty] of Object.entries(s.inv) as [ItemId, number][]) {
        // Tools, weapons, clothing, medicine and story items are never taken.
        if (ITEMS[raw].cat !== "mat" || qty <= 0) continue;
        const take = Math.floor(qty * D.deathMaterialLoss);
        if (take <= 0) continue;
        if (removeItem(s, raw, take)) lost.push({ item: raw, n: take });
      }
    }

    // Return home, alive, with enough in the tank to act on.
    s.region = "forest";
    syncRegionViews(s);
    const spawn = collideAt(s, WORLD.shelter.x, WORLD.shelter.y + 120, BAL.playerR);
    const p = s.player;
    p.x = spawn.x; p.y = spawn.y;
    p.dead = false; p.deathT = 0;
    p.hp = Math.max(progMaxHp(s) * 0.5, 35);
    p.hunger = Math.max(p.hunger, 45);
    p.thirst = Math.max(p.thirst, 45);
    p.temp = Math.max(p.temp, 60);
    p.stamina = progMaxStamina(s);
    p.vx = 0; p.vy = 0; p.atkT = 0; p.atkCd = 0; p.dodgeT = 0; p.dodgeCd = 0;
    p.iframeT = 2.5;                       // brief grace on arrival
    p.gatherT = 0; p.gatherTarget = null;
    s.pickups = []; s.projectiles = [];
    s.cause = "";
    s.screen = "game";
    s.modal = null;
    s.paused = false;
    this.actQ.length = 0;
    this.joy.x = 0; this.joy.y = 0; this.joy.active = false;
    this.cam.x = p.x; this.cam.y = p.y;
    this.lastQuestId = null;
    this.particles = []; this.prints = []; this.waves = [];
    this.fadeT = 1;
    this.ground();

    this.playSfx("healed");
    this.toast({
      title: "Recovered at the outpost",
      sub: lost.length
        ? `Lost in the snow: ${lost.map(l => `${l.n}× ${ITEMS[l.item].name}`).join(", ")}`
        : "Nothing was lost. Rest, resupply, and head out again.",
      kind: "warn", icon: "shelter",
    });
    this.saveNow();
    this.bump();
    return { lost };
  }

  /**
   * Change difficulty. Multipliers are applied at point of use, so switching
   * cannot duplicate a reward or corrupt statistics; only living enemy health
   * is re-scaled proportionally.
   */
  setDifficulty(id: DifficultyId) {
    const s = this.state;
    if (!DIFFICULTIES[id] || s.difficulty === id) return;
    s.difficulty = id;
    rescaleEnemiesForDifficulty(s, id);
    this.playSfx("ui");
    this.toast({
      title: `Difficulty: ${DIFFICULTIES[id].name}`,
      sub: DIFFICULTIES[id].tagline,
      kind: "info", icon: "settings",
    });
    this.saveNow();
    this.bump();
  }

  /** Re-arm the contextual hints (Settings). */
  replayTips() {
    resetTips(this.state);
    this.state.settings.tips = true;
    this.lastTipAt = -99;
    this.setSetting({ tips: true });
    this.toast({ title: "Hints re-enabled", sub: "Contextual guidance will appear again.", kind: "info", icon: "help" });
    this.saveNow();
  }

  /** Spend an upgrade point. Player-initiated only. */
  buyUpgrade(id: UpgradeId) {
    if (buyUpgrade(this.state, id, this.fx)) this.saveNow();
  }
  use(id: ItemId) { useItem(this.state, id, this.fx); }
  equip(id: ItemId) { equipItem(this.state, id, this.fx); }

  // ── settlement (Phase 6.2) — one authority in residents.ts ──
  assignTask(id: string, task: TaskId | null) { if (assignTask(this.state, id, task, this.fx)) this.saveNow(); }
  warriorPost(id: string, post: WarriorPost) { if (setWarriorPost(this.state, id, post, this.fx)) this.saveNow(); }
  guardPriority(id: string, p: GuardPriority) { setGuardPriority(this.state, id, p, this.fx); this.saveNow(); }
  guardEquip(id: string, slot: "weapon" | "armor", item: ItemId | null) {
    if (equipGuard(this.state, id, slot, item, this.fx)) this.saveNow();
  }
  pauseResident(id: string) { togglePause(this.state, id, this.fx); this.saveNow(); }
  treatResidentById(id: string) { if (treatResident(this.state, id, this.fx)) this.saveNow(); }
  callRescue() { if (broadcastCall(this.state, this.fx)) this.saveNow(); }
  beaconCallStatus() { return callStatus(this.state); }
  rescueCheck(def: RescueDef) { return rescueStatus(this.state, def); }

  // ── sieges (Phase 6.4) — one authority in siege.ts ──
  siegeReadiness() { return readiness(this.state); }
  siegeNextIn(kind: import("./siege").SiegeKind) { return timeUntil(this.state, kind); }
  siegeSummary() { return siegeSummary(this.state); }
  siegeIsActive() { return activeSiege(this.state); }
  siegePrepFor(ev: import("./siege").SiegeEvent) { return prepAdvice(this.state, ev); }
  /** Repair one point of structure damage; paid atomically from the shared pool. */
  repairStructure(id: string) {
    if (repairStructure(this.state, id, this.fx, needs => poolPay(this.state, needs))) this.saveNow();
  }

  // ── command center (Phase 6.5) ──
  command() { return commandSnapshot(this.state); }
  checklist() { return prepChecklist(this.state); }
  setDoctrine(id: import("./guards").DoctrineId) {
    setDoctrine(this.state, id);
    this.playSfx("ui");
    this.toast({ title: DOCTRINES[id].name, sub: DOCTRINES[id].desc, kind: "info", icon: "bunks" });
    this.saveNow();
    this.bump();
  }
  setPatrolRoute(ids: string[]) {
    setCustomRoute(this.state, ids);
    this.playSfx("ui");
    this.saveNow();
    this.bump();
  }
  assignmentIssue(post: string) { return assignmentIssue(this.state, post); }
  assignmentHolders(post: string) { return assignmentHolders(this.state, post); }
  fire(kind: "add" | "light" | "cook" | "melt" | "stew") { fireAction(this.state, kind, this.fx); }
  interactNow() { this.press("interact"); }

  /** Order of preference for each belt slot — the player's deliberate choice of
   *  which item goes on the belt; unsafe raw meat is never auto-eaten. */
  static readonly BELT: Record<QuickKind, { items: readonly ItemId[]; empty: string; emptySub: string }> = {
    food: {
      items: ["stew", "cookedmeat", "glowcap", "berry"] as const,
      empty: "No rations",
      emptySub: "Pick berries, hunt, or cook meat at the fire.",
    },
    drink: {
      items: ["meltwater", "ice"] as const,
      empty: "Nothing to drink",
      emptySub: "Melt ice at the fire — eating ice raw costs warmth.",
    },
    heal: {
      items: ["medkit", "salve"] as const,
      empty: "No medicine",
      emptySub: "Craft Herbal Salves from frostleaf.",
    },
  };

  /** The consumable the belt slot would use right now, if any. */
  beltItem(kind: QuickKind): { id: ItemId; count: number } | null {
    for (const id of Game.BELT[kind].items) {
      const n = countItem(this.state, id);
      if (n > 0) return { id, count: n };
    }
    return null;
  }

  /** One-tap consume for the HUD belt and the 1/2/3 keys. */
  quickUse(kind: QuickKind) {
    const s = this.state;
    if (s.screen !== "game" || s.modal || s.player.dead) return;
    const pick = this.beltItem(kind);
    if (!pick) {
      const info = Game.BELT[kind];
      this.toast({ title: info.empty, sub: info.emptySub, kind: "warn", icon: "warn" });
      this.playSfx("error");
      return;
    }
    useItem(s, pick.id, this.fx);
  }

  transfer(id: ItemId, toStorage: boolean) {
    if (toStorage) {
      if (countItem(this.state, id) <= 0) return;
      if (addItem(this.state, id, 1, "storage") > 0) removeItem(this.state, id, 1);
    } else {
      if (countItem(this.state, id, "storage") <= 0) return;
      if (addItem(this.state, id, 1, "inv") > 0) removeItem(this.state, id, 1, "storage");
      else { this.toast({ title: "Pack full", kind: "warn", icon: "backpack" }); this.playSfx("error"); return; }
    }
    this.playSfx("pickup");
    this.bump();
  }

  // ── region travel ──
  canTravel(to: RegionId): { ok: boolean; reason?: string } {
    const s = this.state;
    const def = REGIONS[to];
    if (to === s.region) return { ok: false, reason: "You are already here" };
    if (!s.unlocked.includes(to)) return { ok: false, reason: "Not yet discovered" };
    if (def.reqItem && countItem(s, def.reqItem) <= 0) return { ok: false, reason: `Requires ${def.reqLabel}` };
    if (def.reqItem === "thermalsuit" && s.equip.armor !== "thermalsuit") {
      return { ok: false, reason: "Equip the Thermal Suit first" };
    }
    return { ok: true };
  }

  travelTo(to: RegionId) {
    const chk = this.canTravel(to);
    if (!chk.ok) {
      this.toast({ title: chk.reason ?? "Cannot travel", kind: "warn", icon: "warn" });
      this.playSfx("error");
      return;
    }
    const s = this.state;
    const def = REGIONS[to];
    const from = s.region;
    this.saveNow();
    s.region = to;
    syncRegionViews(s);
    // Resolve the spawn point against real collision so the player can never
    // arrive inside a solid prop or outside the region bounds.
    const spawn = collideAt(s, def.entry.x, def.entry.y, BAL.playerR);
    s.player.x = spawn.x; s.player.y = spawn.y;
    // Reset every transient action so nothing bleeds across the transition.
    const pl = s.player;
    pl.gatherT = 0; pl.gatherTarget = null;
    pl.atkT = 0; pl.atkCd = 0; pl.atkHit = false;
    pl.dodgeT = 0; pl.dodgeCd = 0; pl.vx = 0; pl.vy = 0;
    pl.sprint = false; pl.moving = false;
    s.pickups = []; s.projectiles = [];
    this.actQ.length = 0;
    this.particles = []; this.prints = []; this.waves = [];
    this.cam.x = s.player.x; this.cam.y = s.player.y;
    this.ground();
    this.fadeT = 1;
    this.closeModal();
    this.audio.setFire(false); this.wasLit = false;

    // expedition bookkeeping: leaving home starts a trip, returning closes it
    if (from !== "forest" && to === "forest" && this.trip) {
      const tr = this.trip;
      const summary = {
        region: tr.region,
        gathered: s.stats.gathered - tr.gathered,
        kills: s.stats.kills - tr.kills,
        logs: s.logs.length - tr.logs,
        containers: s.stats.containers - tr.containers,
        minutes: Math.max(1, Math.round((s.time - tr.t) / 60)),
      };
      this.trip = null;
      if (summary.gathered + summary.kills + summary.logs + summary.containers > 0) {
        setTimeout(() => this.emitEvent("expedition", summary), 700);
      }
    } else if (to !== "forest") {
      this.trip = {
        region: to,
        gathered: s.stats.gathered, kills: s.stats.kills,
        logs: s.logs.length, containers: s.stats.containers, t: s.time,
      };
    }

    const first = !s.regions[to].discovered;
    s.regions[to].discovered = true;
    // visiting a region teaches you what can be made from its materials
    s.flags[`r_${to}`] = true;
    this.bannerT = 3.4;
    this.bannerRegion = to;
    this.playSfx(first ? "discover" : "travel");
    if (first) {
      this.toast({ title: `Discovered: ${def.name}`, sub: def.desc, kind: "discovery", icon: def.icon });
      grantXp(s, XP.regionFirstVisit, this.fx);
      this.emitEvent("discover", to);
      const unlockedRecipes: Record<string, string> = {
        ship: "Crowbar · Storm Lantern · Salvaged Axe · Reinforced Spear",
        cave: "Insulated Coat · Crystal Pick · Heat Core · Research Station",
        station: "Crystal Blade · Thermal Suit",
      };
      if (unlockedRecipes[to]) {
        setTimeout(() => this.toast({
          title: "New recipes unlocked",
          sub: unlockedRecipes[to], kind: "good", icon: "hammer",
        }), 1600);
      }
    }
    if (to === "forest") this.toast({ title: "Home again", sub: "The outpost stands.", kind: "good", icon: "shelter" });
    recordDailyEvent(s, { type: "travel", region: to }, this.fx);
    // Save the arrived state too: without this, a crash in the next autosave
    // window (up to 20s) would put the player back in the previous region.
    this.saveNow();
    this.bump();
    this.bump();
  }

  unlockRegion(id: RegionId) {
    const s = this.state;
    if (s.unlocked.includes(id)) return;
    s.unlocked.push(id);
    this.playSfx("discover");
    this.toast({
      title: `New region available: ${REGIONS[id].name}`,
      sub: "Travel from the expedition gate.",
      kind: "discovery", icon: REGIONS[id].icon,
    });
    this.bump();
  }

  saveNow(manual = false) {
    if (this.state.screen !== "game" || this.state.player.dead) return;
    if (writeSave(this.state)) {
      this.saveErrorWarned = false;
      this.state.savedFlash = 1;
      if (manual) this.toast({ title: "Progress saved", kind: "info", icon: "save" });
      this.emitEvent("saved");
      this.bump();
    } else if (manual || !this.saveErrorWarned) {
      this.saveErrorWarned = true;
      this.toast({
        title: "Save unavailable",
        sub: "Storage may be full or disabled. Your current session can continue, but progress is not being written.",
        kind: "error", icon: "warn",
      });
      console.warn("[ICEBOUND] local save write failed; session state was not overwritten.");
    }
  }

  damagePlayer(dmg: number, cause: string, chill = 0) {
    const p = this.state.player;
    if (p.hp > progMaxHp(this.state)) p.hp = progMaxHp(this.state);
    if (p.dead || p.iframeT > 0) return;
    const final = Math.max(1, dmg * (1 - damageReduction(this.state)));
    p.hp -= final;
    if (chill > 0) p.temp = Math.max(0, p.temp - chill);
    p.hurtT = 0.55;
    p.iframeT = 0.9;
    this.flashT = 0.6;
    this.addShake(7);
    this.playSfx("hurt");
    this.fx.float(p.x, p.y - 70, `-${Math.round(final)}`, "#ff8a70");
    this.emitEvent("flash");
    if (navigator.vibrate) { try { navigator.vibrate(60); } catch { /* noop */ } }
    if (p.hp <= 0) {
      p.hp = 0; p.dead = true; p.deathT = 0;
      this.state.cause = cause;
      this.playSfx("death");
    }
  }

  onEnemyKilled(e: Enemy) {
    const s = this.state;
    e.dead = true; e.deadT = 0; e.hp = 0;
    e.respawnAt = s.time + ENEMY[e.kind].respawn;
    const boss = e.kind === "guardian";
    if (e.kind !== "hare") {
      s.stats.kills++;
      recordDailyEvent(s, { type: "kill", n: 1 }, this.fx);
    }
    grantXp(s, XP.kill[e.kind] ?? 10, this.fx, "kill");
    if (boss) {
      s.stats.bosses++;
      s.flags.bossDead = true;
      this.playSfx("bossDie");
      this.addShake(18);
      this.burst(e.x, e.y - 60, "craft", 48);
      this.shockwave(e.x, e.y, 300);
      this.emitEvent("boss", false);
      this.toast({ title: "THE FROST GUARDIAN FALLS", sub: "The yard goes quiet for the first time in years.", kind: "quest", icon: "core" });
    } else {
      this.playSfx(e.kind === "bear" ? "bearDie" : e.kind === "crawler" ? "crawlerDie" : "wolfDie");
      this.addShake(e.kind === "bear" ? 9 : 6);
      this.fx.float(e.x, e.y - 60, `${ENEMY[e.kind].name} defeated`, "#a5e0ff");
    }
    // loot
    for (const l of LOOT[e.kind]) {
      if (Math.random() > l.chance) continue;
      const a = Math.random() * TAU;
      s.pickups.push({
        id: `loot_${s.time}_${Math.random().toString(36).slice(2, 7)}`,
        item: l.item, n: l.n,
        x: e.x + Math.cos(a) * 26, y: e.y + Math.sin(a) * 16, t: Math.random() * 9,
      });
    }
    this.saveNow();
    this.bump();
  }

  shockwave(x: number, y: number, max: number) {
    this.waves.push({ x, y, r: 10, max, t: 0 });
  }

  spawnProjectile(x: number, y: number, ang: number, spd: number, dmg: number) {
    this.state.projectiles.push({
      id: ++this.projId, x, y,
      vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
      life: 3.2, dmg, r: 9, kind: "shard",
    });
  }

  addFootprint(x: number, y: number, ang: number) {
    this.prints.push({ x, y, a: 0.32, ang });
    while (this.prints.length > this.q.footprints) this.prints.shift();
  }

  spawnPuff(x: number, y: number) {
    for (let i = 0; i < 3; i++) {
      this.particles.push({
        x, y, vx: 6 + Math.random() * 10, vy: -8 - Math.random() * 8,
        life: 0, max: 0.9 + Math.random() * 0.5, size: 3 + Math.random() * 4,
        color: "rgba(220,240,255,0.5)", grav: -8, glow: false,
      });
    }
  }

  private addShake(a: number) {
    if (!this.state.settings.shake) return;
    this.shakeMag = Math.min(16, this.shakeMag + a);
  }

  // ══ frame ═════════════════════════════════════════════════════════════════

  private frame(dt: number) {
    const s = this.state;
    if (this.hitstop > 0) { this.hitstop -= dt; this.render(dt); return; }
    const inGame = s.screen === "game" && !s.modal && !s.paused;

    if (inGame) {
      s.time += dt;
      // Assignments follow the in-game day and only advance during active play.
      ensureDailyTasks(s, this.fx);
      if (s.guide) {
        if (s.time > s.guide.expiresAt) s.guide = null;
        else if (Math.hypot(s.player.x - s.guide.x, s.player.y - s.guide.y) < 80) {
          s.guide = null;
          this.playSfx("rare");
          this.toast({ title: "Guide marker reached", sub: "Interact with the resource when it is in range.", kind: "good", icon: "compass" });
        }
      }
      this.slowT = Math.max(0, this.slowT - dt);
      updatePlayer(this, dt);
      updateEnemies(this, dt);
      this.updateSurvival(dt);
      tickSettlement(this, dt);
      tickSiege(this, dt);
      updateSiegeSteering(this, dt);
      this.updateWeather(dt);
      this.updateHazards(dt);
      this.updateProjectiles(dt);
      this.updateInteract();
      if (this.consumeAction("interact")) this.doInteract();
      this.updatePickups(dt);
      this.updateQuests(dt);
      this.updateTutorial();
      this.updateDiscoveries();
      this.updateAmbience(dt);
      this.updateMotes(dt);

      this.respawnAcc += dt;
      if (this.respawnAcc > 0.5) {
        this.respawnAcc = 0;
        for (const reg of Object.values(s.regions)) {
          for (const n of reg.nodes) {
            if (n.amount <= 0 && n.respawnAt > 0 && s.time > n.respawnAt) { n.amount = n.max; n.respawnAt = 0; }
          }
        }
      }
      for (const n of s.nodes) if (n.shake > 0) n.shake = Math.max(0, n.shake - dt * 2.2);

      // campfire
      if (s.region === "forest" && s.shelter.fire.lit) {
        this.audio.crackle();
        this.fireAcc += dt;
        if (this.fireAcc > 0.12) {
          this.fireAcc = 0;
          this.particles.push({
            x: WORLD.firepit.x + (Math.random() - 0.5) * 16, y: WORLD.firepit.y - 12,
            vx: (Math.random() - 0.5) * 14, vy: -26 - Math.random() * 26,
            life: 0, max: 0.9 + Math.random() * 0.7, size: 1.4 + Math.random() * 2,
            color: Math.random() > 0.4 ? "#ffb063" : "#ff8f3d", grav: -30, glow: true,
          });
        }
      }
      const shouldFire = s.region === "forest" && s.shelter.fire.lit;
      if (shouldFire !== this.wasLit) { this.wasLit = shouldFire; this.audio.setFire(shouldFire); }

      // Ambient wind follows the weather. The source keeps running; only its
      // gain and filter move, so menus and region changes never restart it.
      const stormTarget = s.region === "cave" ? 0.05
        : s.weather.kind === "blizzard" ? 0.65 + 0.35 * s.weather.intensity
        : s.weather.kind === "snow" ? 0.35
        : 0.15;
      if (Math.abs(stormTarget - this.lastStormLevel) > 0.04) {
        this.lastStormLevel = stormTarget;
        this.audio.setStorm(stormTarget);
      }

      this.saveAcc += dt;
      if (this.saveAcc > BAL.autosaveEvery) { this.saveAcc = 0; this.saveNow(); }

      this.warnCd.freeze = Math.max(0, this.warnCd.freeze - dt);
      this.warnCd.starve = Math.max(0, this.warnCd.starve - dt);
      this.warnCd.thirst = Math.max(0, this.warnCd.thirst - dt);
      this.warnCd.hazard = Math.max(0, this.warnCd.hazard - dt);

      if (s.player.dead && s.player.deathT > 1.7) { s.screen = "over"; this.bump(); }

      const tx = s.player.x, ty = s.player.y - 30;
      const kk = 1 - Math.pow(0.0001, dt);
      this.cam.x += (tx - this.cam.x) * kk;
      this.cam.y += (ty - this.cam.y) * kk;

      s.savedFlash = Math.max(0, s.savedFlash - dt);
      this.flashT = Math.max(0, this.flashT - dt * 1.6);
      this.bannerT = Math.max(0, this.bannerT - dt);

      this.gustT -= dt;
      if (this.gustT <= 0) { this.gustT = 7 + Math.random() * 9; this.gust = 1.4 + Math.random() * 1.4; }
      this.gust = Math.max(0, this.gust - dt * 0.35);

      this.hudAcc += dt;
      if (this.hudAcc > 0.18) { this.hudAcc = 0; this.bump(); }
    } else if (s.screen === "menu" || s.screen === "intro") {
      this.menuAng += dt * 0.06;
      this.cam.x = -20 + Math.cos(this.menuAng) * 330;
      this.cam.y = -80 + Math.sin(this.menuAng) * 210;
      updateEnemies(this, dt);
    }

    this.fadeT = Math.max(0, this.fadeT - dt * 1.4);
    this.updateParticles(dt);
    this.render(dt);
    if (this.perf.sample(dt, this.state.settings.quality === "auto")) this.applyQuality();
  }

  private updateSurvival(dt: number) {
    const ev = tickSurvival(this.state, dt);
    if (ev.frozeWarn && this.warnCd.freeze <= 0) {
      this.warnCd.freeze = 9;
      this.toast({ title: "You are freezing", sub: "Find firelight or shelter — soon.", kind: "warn", icon: "temp" });
      this.playSfx("warn");
    }
    if (ev.starveWarn && this.warnCd.starve <= 0) {
      this.warnCd.starve = 9;
      this.toast({ title: "Starving", sub: "Eat berries, cooked meat or stew.", kind: "warn", icon: "hunger" });
      this.playSfx("warn");
    }
    if (ev.thirstWarn && this.warnCd.thirst <= 0) {
      this.warnCd.thirst = 9;
      this.toast({ title: "Dehydrated", sub: "Melt ice at the fire — or eat it raw at a cost.", kind: "warn", icon: "thirst" });
      this.playSfx("warn");
    }
    if (ev.fireDied) this.toast({ title: "The campfire died", sub: "Add wood and relight it.", kind: "warn", icon: "fire" });
    if (ev.deathCause) { this.state.cause = ev.deathCause; this.playSfx("death"); }
  }

  private updateWeather(dt: number) {
    const s = this.state;
    const w = s.weather;
    w.t -= dt;
    if (w.t <= 0) {
      const night = phaseOf(s.time) >= BAL.nightStart && phaseOf(s.time) <= BAL.nightEnd;
      const pool: WeatherKind[] = night
        ? ["clear", "snow", "snow", "aurora", "blizzard"]
        : ["clear", "clear", "snow", "snow", "blizzard"];
      const next = pool[Math.floor(Math.random() * pool.length)];
      w.kind = next;
      w.t = BAL.weatherMin + Math.random() * (BAL.weatherMax - BAL.weatherMin);
      w.target = 1;
      this.playSfx(next === "blizzard" ? "blizzard" : next === "aurora" ? "aurora" : "ui");
      const def = WEATHER[next];
      this.toast({
        title: `Weather: ${def.name}`, sub: def.desc,
        kind: next === "blizzard" ? "warn" : "info", icon: def.icon,
      });
    }
    w.intensity += (w.target - w.intensity) * Math.min(1, dt * 0.6);
  }

  private updateHazards(dt: number) {
    const s = this.state;
    const p = s.player;
    if (p.dead) return;
    const t = s.time;
    const HZ = profileOf(s.difficulty).hazardMul;
    for (const h of s.hazards) {
      const d = dist(p.x, p.y, h.x, h.y);
      if (d > h.r) continue;
      const cycle = h.period ? ((t + (h.phase ?? 0)) % h.period) / h.period : 0;
      const active = h.period ? cycle > 0.72 : true;
      switch (h.kind) {
        case "cold":
          p.temp = Math.max(0, p.temp - 3.4 * HZ * dt);
          break;
        case "thinice":
          this.slowT = 0.2;
          if (Math.random() < dt * 0.7) this.fx.burst(p.x, p.y, "ice", 2);
          if (this.warnCd.hazard <= 0) {
            this.warnCd.hazard = 12;
            this.toast({ title: "Thin ice", sub: "It groans under your weight. Move carefully.", kind: "warn", icon: "warn" });
            this.playSfx("iceCrack");
          }
          break;
        case "steam":
          if (active && d < h.r * 0.75) this.damagePlayer(9 * HZ, "Scalded by a steam vent.", 0);
          break;
        case "shock":
          if (active && d < h.r * 0.8) this.damagePlayer(12 * HZ, "Electrocuted in the station yard.", 0);
          break;
        case "spike":
          if (active && d < h.r * 0.7) this.damagePlayer(14 * HZ, "Impaled by rising ice spikes.", 6);
          break;
      }
    }
  }

  private updateProjectiles(dt: number) {
    const s = this.state;
    const p = s.player;
    for (let i = s.projectiles.length - 1; i >= 0; i--) {
      const pr = s.projectiles[i];
      pr.life -= dt;
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      if (Math.random() < dt * 20) {
        this.particles.push({
          x: pr.x, y: pr.y, vx: 0, vy: 0, life: 0, max: 0.4,
          size: 2, color: "#8be8ff", grav: 0, glow: true,
        });
      }
      const B = REGIONS[s.region].bounds;
      const hitPlayer = !p.dead && dist(pr.x, pr.y, p.x, p.y - 20) < 26;
      if (hitPlayer) {
        this.damagePlayer(pr.dmg, "Shredded by the Guardian's shards.", 4);
        this.fx.burst(pr.x, pr.y, "ice", 10);
        s.projectiles.splice(i, 1);
        continue;
      }
      if (pr.life <= 0 || pr.x < B.minX || pr.x > B.maxX || pr.y < B.minY || pr.y > B.maxY) {
        this.fx.burst(pr.x, pr.y, "ice", 5);
        s.projectiles.splice(i, 1);
      }
    }
  }

  /** Drifting region motes: cave spores, fortress resonance, station sparks, sea mist. */
  private updateMotes(dt: number) {
    if (!this.q.lighting) return;
    const s = this.state;
    const r = s.region;
    if (r === "forest") return;
    this.moteAcc -= dt;
    if (this.moteAcc > 0) return;
    this.moteAcc = r === "cave" ? 0.16 : r === "fortress" ? 0.2 : 0.4;
    if (this.particles.length > this.q.particles * 0.7) return;
    const p = s.player;
    const a = Math.random() * TAU;
    const d = 120 + Math.random() * 380;
    const x = p.x + Math.cos(a) * d;
    const y = p.y + Math.sin(a) * d * 0.7;
    const spec = r === "cave"
      ? { color: Math.random() > 0.5 ? "#8be8ff" : "#9be2b5", grav: -6, size: 1.2 + Math.random() * 1.6, max: 3.2 }
      : r === "fortress"
      ? { color: Math.random() > 0.4 ? "#b48cff" : "#8ea6ff", grav: -16, size: 1.4 + Math.random() * 1.8, max: 2.6 }
      : r === "station"
      ? { color: Math.random() > 0.6 ? "#ffb063" : "#cddbea", grav: -4, size: 1.1 + Math.random() * 1.4, max: 2.4 }
      : { color: "#dbe7f2", grav: -3, size: 2 + Math.random() * 2.4, max: 3 };
    this.particles.push({
      x, y, vx: (Math.random() - 0.5) * 12, vy: -4 - Math.random() * 10,
      life: 0, max: spec.max, size: spec.size, color: spec.color, grav: spec.grav, glow: true,
    });
  }

  /** Surface at most one contextual hint at a time, never repeating one. */
  private updateTutorial() {
    const s = this.state;
    const tip = pickTutorialTip(s, this.lastTipAt);
    if (!tip) return;
    markTipSeen(s, tip.id);
    this.lastTipAt = s.time;
    this.playSfx("ui");
    this.emitEvent("tip", tip);
  }

  /** Register hand-placed points of interest when the player physically
   *  reaches them. Walking there is the only way to trigger a discovery. */
  private updateDiscoveries() {
    const s = this.state;
    const p = s.player;
    if (p.dead) return;
    for (const d of s.discoveries) {
      if (d.found) continue;
      if (Math.hypot(p.x - d.x, p.y - d.y) > DISCOVERY_RADIUS) continue;
      d.found = true;
      s.stats.discoveries++;

      const got: { item: ItemId; n: number }[] = [];
      for (const l of d.loot) {
        const res = grant(s, l.item, l.n, {
          pickup: dropped => s.pickups.push({
            id: `disc_${d.id}_${l.item}`, item: l.item, n: dropped,
            x: d.x + 26, y: d.y + 16, t: 0,
          }),
        });
        const held = res.packed + res.stored;
        if (held > 0) got.push({ item: l.item, n: held });
      }

      this.playSfx("discover");
      this.burst(d.x, d.y - 16, "craft", 20);
      grantXp(s, XP.discovery, this.fx);
      const rewardTxt = got.length
        ? got.map(g => `${g.n}× ${ITEMS[g.item].name}`).join(", ")
        : undefined;
      this.toast({
        title: `Discovered: ${d.name}`,
        sub: rewardTxt ? `Recovered ${rewardTxt}` : d.note.slice(0, 90),
        kind: "discovery", icon: "compass",
      });
      this.emitEvent("discovery", d);
      const found = s.discoveries.filter(x => x.found).length;
      const total = totalDiscoveries(s.region);
      if (found === total) {
        setTimeout(() => this.toast({
          title: `${REGIONS[s.region].name} fully surveyed`,
          sub: `All ${total} sites recorded on the expedition map.`,
          kind: "quest", icon: "map",
        }), 1100);
        grantXp(s, XP.discovery, this.fx);
      }
      this.saveNow();
      this.bump();
    }
  }

  private updateAmbience(dt: number) {
    this.ambAcc -= dt;
    if (this.ambAcc > 0) return;
    this.ambAcc = 7 + Math.random() * 11;
    const r = this.state.region;
    if (r === "cave" && Math.random() < 0.6) this.playSfx("caveDrip");
    else if (r === "ship" && Math.random() < 0.6) this.playSfx("metalGroan");
    else if (r === "station" && Math.random() < 0.5) this.playSfx("elecBuzz");
    else if (r === "fortress" && Math.random() < 0.6) this.playSfx("fortressHum");
  }

  private updateInteract() {
    const s = this.state;
    const p = s.player;
    if (p.dead) { s.interact = null; return; }
    let best: Interact | null = null;
    let bestD = BAL.interactR + 30;

    for (const n of s.nodes) {
      const d = dist(p.x, p.y, n.x, n.y);
      const reach = BAL.interactR + (n.kind === "tree" ? 16 : 0);
      if (d > reach || d >= bestD) continue;
      const info = NODE_INFO[n.kind];
      const chk = canGather(s, n);
      best = {
        kind: "node", id: n.id, x: n.x, y: n.y,
        label: n.amount <= 0 ? `${info.name} (depleted)` : `${info.verb} ${info.name}`,
        sub: chk.ok ? (n.max > 1 ? `${n.amount}/${n.max} remaining` : undefined) : chk.reason,
        ok: chk.ok,
        tag: n.amount <= 0 ? "used" : chk.ok ? "gather" : "tool",
        icon: ITEMS[NODE_INFO[n.kind].yieldItem].icon,
      };
      bestD = d;
    }

    for (const c of s.containers) {
      const d = dist(p.x, p.y, c.x, c.y);
      if (d > BAL.interactR + 20 || d >= bestD) continue;
      // stranded survivor pods are recruitment rescues, not loot boxes
      if (c.kind === "survivor") {
        const def = RESCUES.find(r => r.containerId === c.id);
        const chk = def ? rescueStatus(s, def) : null;
        best = {
          kind: "container", id: c.id, x: c.x, y: c.y,
          label: c.opened ? "Rescue pod (empty)" : def ? `Rescue ${def.resident.name}` : "Rescue pod",
          sub: c.opened ? "the pod is cold now" : chk?.ok ? `bring: ${def!.costLabel}` : chk?.reasons[0] ?? "inspect",
          ok: !c.opened,
          tag: c.opened ? "used" : chk?.ok ? "quest" : "locked",
          icon: "residents",
        };
        bestD = d;
        continue;
      }
      const locked = !!c.needs && !c.opened && !this.containerUnlocked(c.id, c.needs);
      best = {
        kind: "container", id: c.id, x: c.x, y: c.y,
        label: c.opened ? "Empty container" : locked ? `Locked — needs ${c.needsLabel ?? ITEMS[c.needs!].name}` : "Open container",
        sub: c.opened ? "already searched" : locked ? "find the right tool or key" : "salvage the contents",
        ok: !c.opened && !locked,
        tag: c.opened ? "used" : locked ? "locked" : c.log ? "quest" : "action",
        icon: c.opened ? "box" : locked ? "keycard" : "crate",
      };
      bestD = d;
    }

    // wounded residents can be treated in person at the camp
    if (s.region === "forest") {
      for (const r of s.settlement.residents) {
        if (!r.injured && !r.downed) continue;
        const d = dist(p.x, p.y, r.x, r.y);
        if (d > BAL.interactR - 6 || d >= bestD) continue;
        best = {
          kind: "resident", id: r.id, x: r.x, y: r.y,
          label: `Treat ${r.name}`,
          sub: r.downed ? "downed — needs a Medkit or Salve" : `${Math.round(r.hp)}/${r.maxHp} hp — medicine speeds recovery`,
          ok: true, tag: "action", icon: "salve",
        };
        bestD = d;
      }
    }

    for (const dv of s.devices) {
      const d = dist(p.x, p.y, dv.x, dv.y);
      if (d > BAL.interactR + 40 || d >= bestD) continue;
      const st = this.deviceStatus(dv.id);
      best = {
        kind: "device", id: dv.id, x: dv.x, y: dv.y, label: st.label, sub: st.sub, ok: st.ok,
        tag: st.ok ? "quest" : dv.on ? "used" : "locked",
        icon: dv.kind === "resonator" ? "crystal" : dv.kind === "breaker" || dv.kind === "terminal" ? "bolt"
          : dv.kind === "sigilgate" ? "sigil" : "keycard",
      };
      bestD = d;
    }

    for (const st of s.structs) {
      const d = dist(p.x, p.y, st.x, st.y);
      if (d > st.r + 76 || d >= bestD + 20) continue;
      const label = this.structLabel(st.kind, st.id);
      if (!label) continue;
      best = {
        kind: "struct", id: st.id, x: st.x, y: st.y, label: label.label, sub: label.sub, ok: label.ok,
        tag: st.kind === "gate" ? "travel" : st.kind === "den" ? "danger" : label.ok ? "action" : "locked",
        icon: st.kind === "gate" ? "map" : st.kind === "shelter" ? "shelter" : st.kind === "firepit" ? "fire"
          : st.kind === "storage" ? "crate" : st.kind === "station" ? "hammer" : st.kind === "research" ? "research"
          : st.kind === "cookpot" ? "stew" : st.kind === "wreck" ? "journal" : st.kind === "pod" ? "pod"
          : st.kind === "bunks" ? "bunks" : st.kind === "beacon" ? "beacon" : "compass",
      };
      bestD = d;
    }

    s.interact = best;
  }

  private containerUnlocked(id: string, needs: ItemId): boolean {
    const s = this.state;
    if (id === "cave_vault") return s.devices.filter(d => d.kind === "resonator" && d.on).length >= 3;
    if (id === "st_lab") return !!s.flags.labOpen;
    return countItem(s, needs) > 0;
  }

  private deviceStatus(id: string): { label: string; sub?: string; ok: boolean } {
    const s = this.state;
    const dv = s.devices.find(d => d.id === id)!;
    switch (dv.kind) {
      case "resonator":
        return dv.on
          ? { label: `${dv.label} — attuned`, sub: "resonating", ok: false }
          : { label: dv.label, sub: "strike to attune", ok: true };
      case "breaker":
        return dv.on
          ? { label: `${dv.label} — engaged`, ok: false }
          : { label: dv.label, sub: "throw the switch", ok: true };
      case "terminal": {
        const breakers = s.devices.filter(d => d.kind === "breaker" && d.on).length;
        if (dv.on) return { label: "Grid Terminal — online", ok: false };
        return breakers >= 2
          ? { label: "Grid Terminal", sub: "power available — restore the grid", ok: true }
          : { label: "Grid Terminal", sub: `needs both breakers (${breakers}/2)`, ok: false };
      }
      case "labdoor":
        return dv.on
          ? { label: "Laboratory — open", ok: false }
          : { label: "Sealed Laboratory", sub: "restore grid power first", ok: false };
      case "sigilgate": {
        if (dv.on) return { label: "Inner Gate — open", ok: false };
        const have = countItem(s, "sigil");
        return have >= 2
          ? { label: "Inner Gate", sub: "place two Frost Sigils", ok: true }
          : { label: "Inner Gate", sub: `sealed — Frost Sigils ${have}/2`, ok: false };
      }
      default:
        return { label: dv.label, ok: false };
    }
  }

  private structLabel(kind: string, id: string): { label: string; sub?: string; ok: boolean } | null {
    const s = this.state;
    switch (kind) {
      case "shelter": return { label: `Outpost — Stage ${s.shelter.stage}`, sub: "repairs & upgrades", ok: true };
      case "firepit": return s.shelter.fire.built
        ? { label: "Campfire", sub: s.shelter.fire.lit ? "cook · melt · fuel" : "unlit — add wood", ok: true }
        : { label: "Fire site", sub: "build via outpost", ok: true };
      case "gate": {
        if (s.region === "forest") {
          const map1 = forestCompletion(s);
          return map1.done
            ? { label: "Expedition Gate — Map 2 ready", sub: "reveal the Frozen Shipwreck route", ok: true }
            : { label: `Expedition Gate — Map 1 ${map1.complete}/${map1.total}`, sub: "restore the outpost to unlock new regions", ok: true };
        }
        return { label: "Expedition Gate", sub: "travel between regions", ok: true };
      }
      case "storage": return s.shelter.stage >= 3
        ? { label: "Supply Cache", sub: "store items", ok: true }
        : { label: "Supply Cache", sub: "requires Stage 3", ok: false };
      case "station": return s.shelter.stage >= 3
        ? { label: "Workbench", sub: "mid-tier crafting", ok: true }
        : { label: "Workbench", sub: "requires Stage 3", ok: false };
      case "research": {
        if (!s.build.research) return { label: "Research Station site", sub: "build via outpost menu", ok: false };
        if (countItem(s, "core") > 0 && !s.flags.finale) return { label: "Research Station", sub: "deliver the Guardian Core", ok: true };
        if (s.flags.finale && !s.flags.broadcast) return { label: "Research Station", sub: "send the last transmission", ok: true };
        return { label: "Research Station", sub: "late-tier crafting & logs", ok: true };
      }
      case "cookpot": return s.build.cookpot
        ? { label: "Cooking Pot", sub: "prepare Hot Stew", ok: true }
        : { label: "Cooking Pot site", sub: "build via outpost menu", ok: false };
      case "lamp": case "spikes": case "banner": {
        const built = !!s.build[kind];
        const name = kind === "lamp" ? "Lamp Posts" : kind === "spikes" ? "Spike Barricade" : "Expedition Banner";
        return { label: built ? name : `${name} site`, sub: built ? "operational" : "build via outpost menu", ok: false };
      }
      case "bunks": {
        const res = s.settlement.residents.length;
        if (!s.build.bunks) return { label: "Bunkhouse site", sub: "build via outpost menu — houses 3 residents", ok: false };
        return { label: "Bunkhouse", sub: `Settlement quarters — ${res} resident${res === 1 ? "" : "s"}`, ok: true };
      }
      case "beacon": {
        if (!s.build.beacon) return { label: "Signal Beacon site", sub: "build via outpost menu — recruit by radio", ok: false };
        const chk = callStatus(s);
        return { label: "Signal Beacon", sub: chk.ok ? "broadcast a recruitment call" : chk.reasons[0], ok: true };
      }
      case "wreck": return s.flags.journal
        ? { label: "Crash Site", sub: "already searched", ok: false }
        : { label: "Search the wreckage", sub: "something glints inside", ok: true };
      case "pod": return { label: "Escape Pod", sub: "beyond repair", ok: true };
      case "den": return { label: "Wolf Den", sub: "bones. best keep moving.", ok: false };
      case "throne": return { label: "The Throne", sub: "it sat here, waiting", ok: false };
      case "landmark": {
        const txt: Record<string, [string, string]> = {
          forest:  ["The Frozen Falls", "the river stopped mid-fall that night"],
          ship:    ["Channel Beacon 4", "dark since the freeze — nobody was warned"],
          cave:    ["The Crystal Heart", "the survey team marked it: do not cut"],
          station: ["Evacuation Helicopter", "rotors iced solid. nobody lifted off"],
          fortress:["Containment Marker", "sealed by the last team alive"],
        };
        const e = txt[s.region] ?? ["Landmark", ""];
        return { label: e[0], sub: e[1], ok: false };
      }
      case "shiphull": return { label: id.includes("bow") ? "Ship's Bow" : "Ship's Stern", sub: "crushed by the ice", ok: false };
      default: return null;
    }
  }

  private doInteract() {
    const s = this.state;
    const it = s.interact;
    if (!it || s.player.dead) return;
    const p = s.player;

    if (it.kind === "node") {
      const n = s.nodes.find(n => n.id === it.id) as WNode | undefined;
      if (!n) return;
      const chk = canGather(s, n);
      if (!chk.ok) {
        this.toast({ title: chk.reason ?? "Unavailable", kind: "warn", icon: "warn" });
        this.playSfx("error");
        return;
      }
      p.gatherT = gatherTime(s, n.kind);
      p.gatherLen = p.gatherT;
      p.gatherTarget = n.id;
      p.face = Math.atan2(n.y - p.y, n.x - p.x);
      p.attackTool = s.equip.tool && (n.kind === "tree" || n.kind === "stone" || n.kind === "crystal") ? "axe" : null;
      return;
    }

    if (it.kind === "resident") { this.treatResidentById(it.id); return; }

    if (it.kind === "container") {
      // stranded survivor pods recruit instead of looting; the container's
      // `opened` flag is saved, so a rescue can never pay out twice.
      const c = s.containers.find(c => c.id === it.id);
      const def = c ? RESCUES.find(r => r.containerId === c.id) : null;
      if (c && def && c.kind === "survivor") {
        if (!c.opened && rescueSurvivor(s, def, this.fx)) c.opened = true;
        this.burst(c.x, c.y - 16, "craft", 12);
        this.saveNow();
        this.bump();
        return;
      }
      this.openContainer(it.id);
      return;
    }
    if (it.kind === "device") { this.useDevice(it.id); return; }

    switch (it.id) {
      case "shelter": this.openModal("outpost"); break;
      case "site_bunks":
        if (s.build.bunks) this.openModal("settlement");
        else this.openModal("outpost");
        break;
      case "site_beacon":
        if (s.build.beacon) this.openModal("settlement");
        else this.openModal("outpost");
        break;
      case "firepit": this.openModal(s.shelter.fire.built ? "fire" : "outpost"); break;
      case "storage":
        if (s.shelter.stage >= 3) this.openModal("storage");
        else { this.toast({ title: "Locked", sub: "Restore the outpost to Stage 3.", kind: "warn", icon: "crate" }); this.playSfx("error"); }
        break;
      case "station":
        if (s.shelter.stage >= 3) this.openModal("craft");
        else { this.toast({ title: "Locked", sub: "Restore the outpost to Stage 3.", kind: "warn", icon: "hammer" }); this.playSfx("error"); }
        break;
      case "site_research":
        if (s.build.research) {
          if (countItem(s, "core") > 0 && !s.flags.finale) { this.finale(); break; }
          // Core delivered: the station can now reach past the storm.
          if (s.flags.finale && !s.flags.broadcast) { this.broadcast(); break; }
          this.openModal("craft");
        } else this.openModal("outpost");
        break;
      case "site_cookpot":
        if (s.build.cookpot) this.openModal("fire");
        else this.openModal("outpost");
        break;
      case "site_lamp": case "site_spikes": case "site_banner":
        this.openModal("outpost");
        break;
      default:
        if (it.id.startsWith("gate_")) {
          s.flags.sawGate = true;
          s.flags.atGate = true;
          if (s.region === "forest") {
            const map1 = forestCompletion(s);
            if (map1.done) {
              s.flags.forestComplete = true;
              this.unlockRegion("ship");
            } else {
              this.toast({
                title: `Map 1 incomplete — ${map1.complete}/${map1.total}`,
                sub: "Repair the hull, build the campfire, then complete Outpost Stages 2 and 3.",
                kind: "info", icon: "shelter",
              });
            }
          }
          this.openModal("map");
          break;
        }
        if (it.id === "wreck" && !s.flags.journal) {
          s.flags.journal = true;
          s.flags.parka = true;
          this.playSfx("quest");
          this.burst(p.x, p.y - 20, "craft", 14);
          this.addLog("log_wreck");
          this.toast({ title: "Recipe unlocked: Fur-lined Parka", sub: "Craft it at the outpost workbench.", kind: "good", icon: "parka" });
          this.saveNow();
          break;
        }
        if (it.id === "pod") {
          this.toast({ title: "Your escape pod", sub: "Dead systems. The outpost is your only future now.", kind: "info", icon: "pod" });
          this.addLog("log_pod");
          break;
        }
        break;
    }
    this.bump();
  }

  private openContainer(id: string) {
    const s = this.state;
    const c = s.containers.find(c => c.id === id);
    if (!c || c.opened) return;
    if (c.needs && !this.containerUnlocked(c.id, c.needs)) {
      this.toast({ title: "Locked", sub: `Requires ${c.needsLabel ?? ITEMS[c.needs].name}.`, kind: "warn", icon: "warn" });
      this.playSfx("error");
      return;
    }
    c.opened = true;
    s.stats.containers++;
    grantXp(s, XP.container, this.fx);
    recordDailyEvent(s, { type: "container", n: 1 }, this.fx);
    this.playSfx(c.kind === "vault" || c.kind === "labcase" ? "vaultOpen" : "crateOpen");
    this.burst(c.x, c.y - 16, "craft", 16);

    const got: { item: ItemId; n: number }[] = [];
    for (const l of c.loot) {
      const res = grant(s, l.item, l.n, {
        pickup: dropped => s.pickups.push({
          id: `drop_${c.id}_${l.item}`, item: l.item, n: dropped,
          x: c.x + 30, y: c.y + 20, t: 0,
        }),
      });
      if (res.packed + res.stored > 0) got.push({ item: l.item, n: res.packed + res.stored });
    }
    if (c.log) this.addLog(c.log);
    if (c.id === "ship_hold") s.flags.shipCargo = true;
    if (c.id === "cave_vault") s.flags.caveVault = true;

    s.lootOpen = c.id;
    this.emitEvent("loot", { container: c, got });
    this.openModal("loot");
    this.saveNow();
  }

  private useDevice(id: string) {
    const s = this.state;
    const dv = s.devices.find(d => d.id === id);
    if (!dv) return;
    const st = this.deviceStatus(id);
    if (!st.ok) { this.playSfx("error"); this.toast({ title: st.label, sub: st.sub, kind: "warn", icon: "warn" }); return; }

    switch (dv.kind) {
      case "resonator": {
        dv.on = true;
        this.playSfx("resonate");
        this.burst(dv.x, dv.y - 40, "ice", 18);
        const n = s.devices.filter(d => d.kind === "resonator" && d.on).length;
        this.toast({
          title: `Crystal attuned (${n}/3)`,
          sub: n >= 3 ? "The vault at the north chamber grinds open." : "A deep tone rolls through the cave.",
          kind: n >= 3 ? "quest" : "info", icon: "crystal",
        });
        if (n >= 3) { this.playSfx("quest"); this.addShake(8); }
        break;
      }
      case "breaker": {
        dv.on = true;
        this.playSfx("switch");
        this.burst(dv.x, dv.y - 30, "hit", 8);
        const n = s.devices.filter(d => d.kind === "breaker" && d.on).length;
        this.toast({ title: `Breaker engaged (${n}/2)`, sub: n >= 2 ? "Use the grid terminal." : "One more remains.", kind: "info", icon: "bolt" });
        break;
      }
      case "terminal": {
        dv.on = true;
        const door = s.devices.find(d => d.kind === "labdoor");
        if (door) door.on = true;
        s.flags.labOpen = true;
        this.playSfx("power");
        this.addShake(7);
        this.toast({ title: "Grid restored", sub: "The laboratory seal releases.", kind: "quest", icon: "bolt" });
        break;
      }
      case "sigilgate": {
        if (!removeItem(s, "sigil", 2)) { this.playSfx("error"); return; }
        dv.on = true;
        s.flags.sigilGate = true;
        this.playSfx("gateOpen");
        this.addShake(12);
        this.burst(dv.x, dv.y - 60, "craft", 30);
        this.toast({ title: "The inner gate opens", sub: "Something very large is awake in the yard.", kind: "quest", icon: "sigil" });
        break;
      }
      default: break;
    }
    this.saveNow();
    this.bump();
  }

  private addLog(id: string) {
    const s = this.state;
    if (s.logs.includes(id)) return;
    s.logs.push(id);
    grantXp(s, XP.log, this.fx);
    const l = LOGS[id];
    if (!l) return;
    this.playSfx("logFound");
    this.toast({ title: `Research log: ${l.title}`, sub: l.text.slice(0, 96) + "…", kind: "discovery", icon: "journal" });
    this.emitEvent("log", id);
  }

  /** Final story beat: send the warning out and roll the ending. */
  private broadcast() {
    const s = this.state;
    if (s.flags.broadcast) return;                 // once only
    if (!s.questsDone.includes("q_finale")) {
      this.toast({ title: "The Core is not contained yet", kind: "warn", icon: "core" });
      return;
    }
    s.flags.broadcast = true;
    this.playSfx("power");
    this.addShake(8);
    this.burst(WORLD.sites.research.x, WORLD.sites.research.y - 30, "craft", 40);
    this.toast({
      title: "Transmission sent",
      sub: "Someone, somewhere, now knows what the aurora woke at KVESTA-9.",
      kind: "quest", icon: "bolt",
    });
    // Record the final objective before the summary reads the quest totals.
    const finalQuest = QUESTS.find(q => q.id === "q_broadcast");
    if (finalQuest) this.completeQuest(finalQuest);

    // The ending is a reading state: stop survival, enemies and input until
    // the player explicitly chooses to continue exploring.
    s.paused = true;
    this.joy.x = 0; this.joy.y = 0; this.joy.active = false;
    this.actQ.length = 0;
    this.emitEvent("ending");
    this.saveNow();
    this.bump();
  }

  resumeAfterEnding() {
    const s = this.state;
    if (s.screen !== "game") return;
    s.paused = false;
    s.modal = null;
    this.lastTs = performance.now();
    this.bump();
  }

  private finale() {
    const s = this.state;
    s.flags.finale = true;
    this.playSfx("quest");
    this.burst(s.player.x, s.player.y - 30, "craft", 36);
    this.toast({
      title: "The Core is contained",
      sub: "You know what happened here now. And you are still alive.",
      kind: "quest", icon: "core",
    });
    this.emitEvent("finale");
    this.saveNow();
  }

  private updatePickups(dt: number) {
    const s = this.state;
    const p = s.player;
    if (s.pickups.length > 40) s.pickups.splice(0, s.pickups.length - 40);
    for (let i = s.pickups.length - 1; i >= 0; i--) {
      const pk = s.pickups[i];
      pk.t += dt;
      const d = dist(p.x, p.y, pk.x, pk.y);
      if (d < 120) {
        pk.x += ((p.x - pk.x) / d) * 130 * dt;
        pk.y += ((p.y - pk.y) / d) * 130 * dt;
      }
      if (d < 34) {
        const got = addItem(s, pk.item, pk.n);
        if (got > 0) {
          this.fx.float(pk.x, pk.y - 30, `+${got} ${ITEMS[pk.item].name}`, ITEMS[pk.item].color);
          this.playSfx("pickup");
          s.stats.gathered += got;
          s.pickups.splice(i, 1);
          this.bump();
        } else {
          pk.x += ((pk.x - p.x) / d) * 40 * dt;
          if (this.warnCd.hazard <= 0 && usedSlots(s) >= capacity(s)) {
            this.warnCd.hazard = 10;
            this.toast({ title: "Pack full", sub: "Store items in the cache or craft the Expedition Pack.", kind: "warn", icon: "backpack" });
          }
        }
      }
    }
  }

  /**
   * Complete one objective exactly once: record it, pay the reward through the
   * safe grant path, award XP and fire the unlock. Shared by main and side
   * quests so neither can double-reward.
   */
  private completeQuest(q: QuestDef) {
    const s = this.state;
    if (s.questsDone.includes(q.id)) return;      // hard guard against re-entry
    s.questsDone.push(q.id);
    this.playSfx("quest");

    const rewardTxt = q.reward
      ? Object.entries(q.reward).map(([i, n]) => `${n}× ${ITEMS[i as ItemId].name}`).join(", ")
      : undefined;
    for (const [rawId, rawN] of Object.entries(q.reward ?? {})) {
      const item = rawId as ItemId;
      grant(s, item, rawN as number, {
        pickup: dropped => s.pickups.push({
          id: `quest_${q.id}_${item}`,
          item, n: dropped, x: s.player.x + 28, y: s.player.y + 12, t: 0,
        }),
      });
    }

    grantXp(s, q.side ? 60 : (XP.questChapter[q.chapter] ?? 55), this.fx);
    this.emitEvent("quest", q);
    this.toast({
      title: `${q.side ? "Side objective" : "Objective"} complete: ${q.title}`,
      sub: rewardTxt ? `Received: ${rewardTxt}` : undefined,
      kind: "quest", icon: "done",
    });
    if (q.unlocks) this.unlockRegion(q.unlocks);
    this.releaseTransmissions();
    this.saveNow();
    this.bump();
  }

  /** Release any radio fragments unlocked by the quests completed so far. */
  private releaseTransmissions() {
    const s = this.state;
    for (const tx of availableTransmissions(s.questsDone)) {
      if (s.logs.includes(tx.id)) continue;
      s.logs.push(tx.id);
      this.playSfx("logFound");
      this.toast({
        title: `Signal recovered: ${tx.title}`,
        sub: tx.text.slice(0, 92) + "…",
        kind: "discovery", icon: "bolt",
      });
      this.emitEvent("log", tx.id);
    }
  }

  private updateQuests(dt: number) {
    this.questAcc += dt;
    if (this.questAcc < 0.25) return;
    this.questAcc = 0;
    const s = this.state;
    const q = currentQuest(s);
    const id = q?.id ?? null;

    // Test the active objective directly every tick: waiting for the quest id
    // to change can never work, because the id only changes once it completes.
    if (q && q.done(s)) {
      this.completeQuest(q);
      this.lastQuestId = null;
      s.questActive = currentQuest(s)?.id ?? null;
      return; // announce the next objective on the following tick
    }

    // Optional objectives resolve on the same path, so they also pay out once.
    for (const sq of activeSideQuests(s)) {
      if (!s.questsDone.includes(sq.id) && sq.done(s)) {
        this.completeQuest(sq);
        break; // at most one completion per tick keeps the toasts readable
      }
    }

    if (id !== this.lastQuestId) {
      this.lastQuestId = id;
      if (q) {
        this.emitEvent("questStart", q);
        this.toast({ title: "New objective", sub: q.title, kind: "info", icon: "flag" });
      }
    }
    s.questActive = id;

    // quest wolf (V1 arc) — spawns in the forest near the camp
    if (!s.flags.questWolfSpawned && id === "q_howl" && s.region === "forest") {
      s.flags.questWolfSpawned = true;
      const w = this.state.regions.forest.enemies;
      const qw = w.find(e => e.kind === "wolf" && e.dead === false);
      if (qw) {
        qw.home = { x: WORLD.questWolf.x, y: WORLD.questWolf.y };
        qw.x = WORLD.questWolf.x; qw.y = WORLD.questWolf.y;
        qw.quest = true;
        qw.state = "patrol";
        this.toast({ title: "A howl cuts through the wind…", sub: "Something is circling the camp.", kind: "warn", icon: "wolf" });
        this.playSfx("wolfGrowl");
      }
    }
  }

  // ══ particles ═════════════════════════════════════════════════════════════

  burst(x: number, y: number, kind: string, n = 10) {
    const palette: Record<string, string[]> = {
      branch: ["#8a6a45", "#5a4531", "#c98d5a"], tree: ["#2a5546", "#8a6a45", "#e2eef8"],
      stone: ["#9fb0c4", "#6b7e96", "#dbe4ec"], ice: ["#a5e0ff", "#67c8f4", "#e8f7ff"],
      berry: ["#ff7d6b", "#2e5a4a", "#c43b43"], herb: ["#7fd6a4", "#4d9a72", "#a8f0c8"],
      frostbloom: ["#d9f2ff", "#a5d8ff", "#ffffff"],
      scrap: ["#c3b49c", "#7d6f5e", "#e8dcc8"], crystal: ["#8be8ff", "#b48cff", "#ffffff"],
      fungus: ["#9be2b5", "#5fbd8c", "#d6ffe8"],
      hit: ["#ffd2a0", "#ff8f6b", "#ffffff"], craft: ["#ffb063", "#a5e0ff", "#ffe9c4"],
      fire: ["#ffb063", "#ff8f3d", "#ffe9c4"], snow: ["#e8f2fa", "#cddbea"],
    };
    const colors = palette[kind] ?? palette.snow;
    n = Math.max(2, Math.round(n * this.q.burstMul));
    if (this.particles.length + n > this.q.particles) n = Math.max(0, this.q.particles - this.particles.length);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = 30 + Math.random() * 90;
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7 - 40,
        life: 0, max: 0.5 + Math.random() * 0.55, size: 1.6 + Math.random() * 2.6,
        color: colors[Math.floor(Math.random() * colors.length)],
        grav: kind === "fire" ? -40 : 210,
        glow: kind === "fire" || kind === "craft" || kind === "hit" || kind === "crystal",
      });
    }
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.max) { this.particles.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    if (this.particles.length > this.q.particles) this.particles.splice(0, this.particles.length - this.q.particles);

    if (this.floats.length > 24) this.floats.splice(0, this.floats.length - 24);
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t += dt; f.y -= 26 * dt;
      if (f.t > 1.25) this.floats.splice(i, 1);
    }
    for (let i = this.prints.length - 1; i >= 0; i--) {
      const pr = this.prints[i];
      pr.a -= dt * 0.055;
      if (pr.a <= 0) this.prints.splice(i, 1);
    }
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.t += dt;
      w.r += (w.max - w.r) * Math.min(1, dt * 7);
      if (w.t > 0.6) this.waves.splice(i, 1);
    }

    // snow density follows region + weather
    const reg = REGIONS[this.state.region];
    const wk = WEATHER[this.state.weather.kind];
    const want = Math.round(this.q.flakes * this.state.settings.snow * reg.snowMul * wk.snow);
    while (this.flakes.length < want) this.flakes.push({ x: Math.random() * this.W, y: Math.random() * this.H, z: 0.4 + Math.random() * 0.9, drift: Math.random() * TAU });
    if (this.flakes.length > want) this.flakes.length = want;
    const bliz = this.state.weather.kind === "blizzard" ? 2.6 : 1;
    for (const f of this.flakes) {
      f.y += (34 + f.z * 60) * bliz * dt;
      f.x += (Math.sin(f.drift + f.y * 0.01) * 12 - (14 * this.gust + 40 * (bliz - 1)) * f.z - 8 * f.z) * dt;
      if (f.y > this.H + 6) { f.y = -6; f.x = Math.random() * (this.W + 80); }
      if (f.x < -10) f.x = this.W + 8; else if (f.x > this.W + 10) f.x = -8;
    }
    this.shakeMag = Math.max(0, this.shakeMag - dt * 26);
  }

  // ══ render ════════════════════════════════════════════════════════════════

  private render(dt: number) {
    const c = this.canvas, ctx = this.ctx;
    if (!c || !ctx) return;
    const s = this.state;
    const t = performance.now() / 1000;
    const reg = REGIONS[s.region];
    const B = reg.bounds;

    this.zoom = clamp(Math.min(this.W / 1020, this.H / 660), 0.58, 1.14);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = s.region === "cave" ? "#070d18" : "#0d1622";
    ctx.fillRect(0, 0, this.W, this.H);

    const halfW = this.W / 2 / this.zoom;
    const halfH = this.H / 2 / this.zoom;
    const cx = clamp(this.cam.x, B.minX - 60 + halfW, B.maxX + 60 - halfW);
    const cy = clamp(this.cam.y, B.minY - 60 + halfH, B.maxY + 60 - halfH);
    const shx = this.shakeMag > 0 ? (Math.random() - 0.5) * this.shakeMag : 0;
    const shy = this.shakeMag > 0 ? (Math.random() - 0.5) * this.shakeMag : 0;

    ctx.save();
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(halfW - cx + shx, halfH - cy + shy);

    ctx.drawImage(this.ground(), B.minX, B.minY, B.maxX - B.minX, B.maxY - B.minY);

    for (const pr of this.prints) {
      ctx.save();
      ctx.translate(pr.x, pr.y);
      ctx.rotate(pr.ang);
      ctx.fillStyle = `rgba(120,145,175,${pr.a})`;
      ctx.beginPath(); ctx.ellipse(0, 0, 4.4, 2.4, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // discovery markers sit on the floor with the hazards
    for (const d of s.discoveries) {
      if (Math.abs(d.x - cx) > halfW + 160 || Math.abs(d.y - cy) > halfH + 200) continue;
      const dp = Math.hypot(d.x - s.player.x, d.y - s.player.y);
      const hint = d.found ? 0 : Math.max(0, 1 - dp / DISCOVERY_HINT_RADIUS);
      drawDiscovery(ctx, d, t, hint);
    }

    // hazards sit on the floor, under everything
    for (const h of s.hazards) {
      if (Math.abs(h.x - cx) > halfW + h.r + 80 || Math.abs(h.y - cy) > halfH + h.r + 80) continue;
      drawHazard(ctx, h, s.time, this.q.hazardDetail);
    }

    this.drawBounds(ctx, B);

    // ── depth-sorted draw pass: reusable buffer + viewport culling ──
    const padX = halfW + 260, padY = halfH + 320;
    const vis = (x: number, y: number) => Math.abs(x - cx) < padX && Math.abs(y - cy) < padY;
    const buf = this.drawBuf;
    let n = 0;
    const push = (y: number, k: number, r: unknown) => {
      const slot = buf[n];
      if (slot) { slot.y = y; slot.k = k; slot.r = r; }
      else buf[n] = { y, k, r };
      n++;
    };
    for (const o of s.nodes) if (vis(o.x, o.y)) push(o.y, 0, o);
    for (const o of s.structs) if (vis(o.x, o.y)) push(o.y + (o.kind === "shelter" ? 6 : 0), 1, o);
    for (const o of s.containers) if (vis(o.x, o.y)) push(o.y, 2, o);
    for (const o of s.devices) if (vis(o.x, o.y)) push(o.y, 3, o);
    for (const o of s.pickups) if (vis(o.x, o.y)) push(o.y, 4, o);
    for (const o of s.enemies) if (!(o.dead && o.deadT > 4) && vis(o.x, o.y)) push(o.y, 5, o);
    if (s.screen !== "menu" && s.screen !== "intro") push(s.player.y, 6, s.player);
    // settlement residents only exist at the home camp
    if (s.region === "forest" && s.screen === "game") {
      for (const o of s.settlement.residents) if (vis(o.x, o.y)) push(o.y, 7, o);
    }
    this.drawN = n;
    buf.length = n;                 // reuse the same array; no per-frame allocation
    buf.sort((a, b) => a.y - b.y);
    for (let i = 0; i < n; i++) {
      const d = buf[i];
      switch (d.k) {
        case 0: drawNodeAny(ctx, d.r as never, t); break;
        case 1: drawStructAny(ctx, d.r as never, s, t); break;
        case 2: drawContainer(ctx, d.r as never, t); break;
        case 3: drawDevice(ctx, d.r as never, t); break;
        case 4: drawPickup(ctx, d.r as never, t); break;
        case 5: drawEnemyAny(ctx, d.r as never, t); break;
        case 6: drawPlayer(ctx, s.player, t, !!s.equip.armor); break;
        case 7: drawResident(ctx, d.r as never, t); break;
      }
    }

    for (const pr of s.projectiles) drawProjectile(ctx, pr);

    // shockwaves
    for (const w of this.waves) {
      const a = Math.max(0, 1 - w.t / 0.6);
      ctx.strokeStyle = `rgba(226,240,252,${a * 0.75})`;
      ctx.lineWidth = 5 * a + 1;
      ctx.beginPath(); ctx.ellipse(w.x, w.y, w.r, w.r * 0.4, 0, 0, TAU); ctx.stroke();
    }

    if (s.screen === "game" && s.player.gatherT > 0) {
      const pl = s.player;
      const pr = 1 - pl.gatherT / Math.max(0.001, pl.gatherLen);
      ctx.strokeStyle = "rgba(6,12,22,0.7)";
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(pl.x, pl.y - 32, 17, 0, TAU); ctx.stroke();
      ctx.strokeStyle = "#a5e0ff";
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(pl.x, pl.y - 32, 17, -Math.PI / 2, -Math.PI / 2 + TAU * pr); ctx.stroke();
    }

    if (s.interact && s.screen === "game") {
      const it = s.interact;
      const pulse = 0.5 + Math.sin(t * 5) * 0.25;
      ctx.strokeStyle = it.ok ? `rgba(165,224,255,${pulse})` : `rgba(255,157,138,${pulse})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(it.x, it.y + 2, 24 + Math.sin(t * 5) * 3, 10 + Math.sin(t * 5) * 1.4, 0, 0, TAU);
      ctx.stroke();
    }

    for (const p of this.particles) {
      if (p.glow) continue;
      ctx.globalAlpha = 1 - p.life / p.max;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ── darkness: night + region + weather ──
    const night = this.nightFactor();
    const dark = Math.min(0.92, reg.darkness + night * (s.region === "cave" ? 0.05 : 0.42) + (s.weather.kind === "blizzard" ? 0.1 : 0));
    if (dark > 0.01) {
      const vw = halfW * 2 + 80, vh = halfH * 2 + 80;
      ctx.save();
      ctx.fillStyle = s.region === "cave" ? `rgba(4,10,22,${dark})`
        : s.region === "fortress" ? `rgba(14,16,42,${dark * 0.8})`
        : `rgba(8,18,38,${dark * 0.75})`;
      ctx.fillRect(cx - vw / 2, cy - vh / 2, vw, vh);
      // lantern / light sources cut holes in the dark
      ctx.globalCompositeOperation = "destination-out";
      void 0;
      const lanternR = s.equip.gear === "lantern" ? 300 : 170;
      if (dark > 0.3) {
        const lg = ctx.createRadialGradient(s.player.x, s.player.y - 20, 10, s.player.x, s.player.y - 20, lanternR);
        lg.addColorStop(0, "rgba(0,0,0,0.96)");
        lg.addColorStop(0.55, "rgba(0,0,0,0.5)");
        lg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = lg;
        ctx.beginPath(); ctx.arc(s.player.x, s.player.y - 20, lanternR, 0, TAU); ctx.fill();
      }
      if (s.region === "forest" && s.shelter.fire.lit) {
        const fg = ctx.createRadialGradient(WORLD.firepit.x, WORLD.firepit.y, 10, WORLD.firepit.x, WORLD.firepit.y, 280);
        fg.addColorStop(0, "rgba(0,0,0,0.95)"); fg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = fg;
        ctx.beginPath(); ctx.arc(WORLD.firepit.x, WORLD.firepit.y, 280, 0, TAU); ctx.fill();
      }
      if (s.region === "cave") {
        for (const st of s.structs) {
          if (st.kind !== "crystalpillar") continue;
          const pg = ctx.createRadialGradient(st.x, st.y - 50, 4, st.x, st.y - 50, 190);
          pg.addColorStop(0, "rgba(0,0,0,0.8)"); pg.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = pg;
          ctx.beginPath(); ctx.arc(st.x, st.y - 50, 190, 0, TAU); ctx.fill();
        }
      }
      ctx.restore();
    }

    // ── additive light pass ──
    ctx.save();
    if (this.q.lighting) {
    ctx.globalCompositeOperation = "lighter";
    if (s.region === "forest") {
      if (s.shelter.fire.lit && s.shelter.fire.fuel > 0) {
        const fl = 1 + Math.sin(t * 11) * 0.05 + Math.sin(t * 27) * 0.04;
        const R = BAL.tempFireR * 0.92 * fl;
        const g = ctx.createRadialGradient(WORLD.firepit.x, WORLD.firepit.y - 8, 12, WORLD.firepit.x, WORLD.firepit.y - 8, R);
        g.addColorStop(0, `rgba(255,166,80,${0.34 + night * 0.3})`);
        g.addColorStop(0.55, `rgba(255,143,61,${0.1 + night * 0.14})`);
        g.addColorStop(1, "rgba(255,143,61,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(WORLD.firepit.x, WORLD.firepit.y - 8, R, 0, TAU); ctx.fill();
      }
      if (s.shelter.stage >= 2 && night > 0.05) {
        const g2 = ctx.createRadialGradient(WORLD.shelter.x - 52, WORLD.shelter.y - 40, 4, WORLD.shelter.x - 52, WORLD.shelter.y - 40, 120);
        g2.addColorStop(0, `rgba(255,176,99,${night * 0.3})`); g2.addColorStop(1, "rgba(255,176,99,0)");
        ctx.fillStyle = g2;
        ctx.beginPath(); ctx.arc(WORLD.shelter.x - 52, WORLD.shelter.y - 40, 120, 0, TAU); ctx.fill();
      }
      if (s.build.lamp) {
        const L = WORLD.sites.lamp;
        const g3 = ctx.createRadialGradient(L.x + 20, L.y - 80, 4, L.x + 20, L.y - 80, 200);
        g3.addColorStop(0, `rgba(255,200,130,${0.18 + night * 0.3})`); g3.addColorStop(1, "rgba(255,200,130,0)");
        ctx.fillStyle = g3;
        ctx.beginPath(); ctx.arc(L.x + 20, L.y - 80, 200, 0, TAU); ctx.fill();
      }
    }
    }
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.particles) {
      if (!p.glow) continue;
      ctx.globalAlpha = 1 - p.life / p.max;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    // prompt pill
    if (s.interact && s.screen === "game" && !s.modal) {
      const it = s.interact;
      ctx.font = "700 15px Rajdhani, sans-serif";
      const wTxt = ctx.measureText(it.label).width;
      const px = it.x, py = it.y - this.promptOffset(it);
      const pw = wTxt + 26, ph = 26;
      ctx.fillStyle = "rgba(6,12,22,0.82)";
      ctx.strokeStyle = it.ok ? "rgba(165,224,255,0.55)" : "rgba(255,157,138,0.5)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(px - pw / 2 + 8, py - ph);
      ctx.lineTo(px + pw / 2, py - ph);
      ctx.lineTo(px + pw / 2, py - 6);
      ctx.lineTo(px - pw / 2, py - 6);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = it.ok ? "#d9f2ff" : "#ffb0a0";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(it.label, px, py - ph / 2 - 3);
      if (it.sub) {
        ctx.font = "600 11px 'Exo 2', sans-serif";
        ctx.fillStyle = "rgba(165,224,255,0.75)";
        ctx.fillText(it.sub, px, py + 4);
      }
    }

    // enemy health bars (boss uses the HUD bar instead)
    for (const e of s.enemies) {
      if (e.dead || e.hp >= e.max || e.kind === "guardian" || e.state === "hidden") continue;
      const pct = clamp(e.hp / e.max, 0, 1);
      const w = e.kind === "bear" ? 58 : 44;
      const yOff = e.kind === "bear" ? 96 : 58;
      ctx.fillStyle = "rgba(6,12,22,0.75)";
      ctx.fillRect(e.x - w / 2, e.y - yOff, w, 5);
      ctx.fillStyle = e.kind === "bear" ? "#ffb063" : "#ff7d6b";
      ctx.fillRect(e.x - w / 2 + 1, e.y - yOff + 1, (w - 2) * pct, 3);
    }

    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const f of this.floats) {
      const a = 1 - f.t / 1.25;
      ctx.font = "700 15px Rajdhani, sans-serif";
      ctx.globalAlpha = a;
      ctx.fillStyle = "rgba(6,12,22,0.7)";
      ctx.fillText(f.txt, f.x + 1, f.y + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.txt, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // ── screen space ──
    this.drawSnow(ctx);
    if (s.weather.kind === "aurora") this.drawAurora(ctx, t);
    if (s.weather.kind === "blizzard") {
      ctx.fillStyle = `rgba(226,240,252,${0.1 * s.weather.intensity})`;
      ctx.fillRect(0, 0, this.W, this.H);
    }
    if (reg.ambient !== "rgba(120,160,200,0)") {
      ctx.fillStyle = reg.ambient;
      ctx.fillRect(0, 0, this.W, this.H);
    }
    this.drawQuestArrow(ctx, cx, cy);
    this.drawVignette(ctx);
    if (this.flashT > 0) {
      ctx.fillStyle = `rgba(200,30,30,${this.flashT * 0.25})`;
      ctx.fillRect(0, 0, this.W, this.H);
    }
    if (this.fadeT > 0) {
      ctx.fillStyle = `rgba(4,9,17,${this.fadeT})`;
      ctx.fillRect(0, 0, this.W, this.H);
    }
    void dt;
  }

  private promptOffset(it: Interact): number {
    const s = this.state;
    if (it.kind === "node") {
      const n = s.nodes.find(n => n.id === it.id);
      if (!n) return 60;
      if (n.kind === "tree") return 116;
      if (n.kind === "crystal") return 72;
      if (n.kind === "stone") return 48;
      return 58;
    }
    if (it.kind === "container") {
      const c = s.containers.find(c => c.id === it.id);
      return c?.kind === "cargo" ? 92 : c?.kind === "vault" ? 100 : c?.kind === "locker" ? 74 : 52;
    }
    if (it.kind === "device") {
      const d = s.devices.find(d => d.id === it.id);
      return d?.kind === "sigilgate" ? 190 : d?.kind === "labdoor" ? 110 : d?.kind === "resonator" ? 92 : 72;
    }
    const st = s.structs.find(st => st.id === it.id);
    if (!st) return 70;
    return st.kind === "shelter" ? 150 : st.kind === "wreck" ? 110 : st.kind === "gate" ? 134
      : st.kind === "research" ? 96 : st.kind === "den" ? 84 : 66;
  }

  private drawBounds(ctx: CanvasRenderingContext2D, B: { minX: number; maxX: number; minY: number; maxY: number }) {
    ctx.save();
    ctx.fillStyle = this.state.region === "cave" ? "rgba(4,8,16,0.92)" : "rgba(10,20,32,0.6)";
    const m = 42;
    ctx.fillRect(B.minX - 400, B.minY - 400, B.maxX - B.minX + 800, m + 400);
    ctx.fillRect(B.minX - 400, B.maxY - m, B.maxX - B.minX + 800, 400 + m);
    ctx.fillRect(B.minX - 400, B.minY - 400, m + 400, B.maxY - B.minY + 800);
    ctx.fillRect(B.maxX - m, B.minY - 400, 400 + m, B.maxY - B.minY + 800);
    ctx.restore();
  }

  private drawSnow(ctx: CanvasRenderingContext2D) {
    if (this.state.region === "cave") return;
    ctx.fillStyle = "rgba(226,240,252,0.85)";
    for (const f of this.flakes) {
      ctx.globalAlpha = 0.25 + f.z * 0.5;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.z * 2.2, 0, TAU); ctx.fill();
    }
    const bliz = this.state.weather.kind === "blizzard";
    if ((this.gust > 0.4 || bliz) && this.q.gustStreaks) {
      ctx.strokeStyle = `rgba(226,240,252,${bliz ? 0.2 : Math.min(0.16, (this.gust - 0.4) * 0.09)})`;
      ctx.lineWidth = 1.4;
      for (let i = 0; i < (bliz ? 24 : 10); i++) {
        const y = ((i * 97 + performance.now() * (bliz ? 0.6 : 0.25)) % (this.H + 80)) - 40;
        const x = (i * 173 + performance.now() * (bliz ? 1.2 : 0.5)) % (this.W + 160);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 70, y - 8, x + 150, y - 4);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawAurora(ctx: CanvasRenderingContext2D, t: number) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < this.q.auroraBands; i++) {
      const y = 40 + i * 54;
      const g = ctx.createLinearGradient(0, y - 60, 0, y + 90);
      const hue = i === 0 ? "127,214,164" : i === 1 ? "103,200,244" : "180,140,255";
      g.addColorStop(0, `rgba(${hue},0)`);
      g.addColorStop(0.5, `rgba(${hue},${0.1 + Math.sin(t * 0.5 + i) * 0.04})`);
      g.addColorStop(1, `rgba(${hue},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= this.W; x += 40) {
        ctx.lineTo(x, y + Math.sin(x * 0.004 + t * 0.6 + i) * 26);
      }
      ctx.lineTo(this.W, y + 130);
      for (let x = this.W; x >= 0; x -= 40) {
        ctx.lineTo(x, y + 110 + Math.sin(x * 0.004 + t * 0.6 + i) * 26);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private nightFactor(): number {
    const p = phaseOf(this.state.time);
    if (p < BAL.nightStart - 0.08) return 0;
    if (p < BAL.nightStart) return (p - (BAL.nightStart - 0.08)) / 0.08;
    if (p <= BAL.nightEnd) return 1;
    if (p <= BAL.nightEnd + 0.05) return 1 - (p - BAL.nightEnd) / 0.05;
    return 0;
  }

  private drawQuestArrow(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
    const s = this.state;
    if (s.screen !== "game" || s.modal) return;

    // Manual material/navigation guides visually replace ordinary quest arrows.
    if (s.guide) {
      this.drawGuideMarker(ctx, cx, cy);
      return;
    }

    const q = currentQuest(s);
    if (!q) return;
    // objectives in another region guide you to this region's expedition gate
    let goingToGate = false;
    if (q.region && q.region !== s.region) {
      const gate = s.structs.find(st => st.id.startsWith("gate_"));
      if (!gate) return;
      goingToGate = true;
    }
    let goal = goingToGate
      ? s.structs.filter(st => st.id.startsWith("gate_")).map(st => ({ x: st.x, y: st.y }))[0]
      : q.target ? q.target(s) : null;
    if (!goal && q.id === "q_boss") {
      const b = s.enemies.find(e => e.kind === "guardian" && !e.dead);
      if (b) goal = { x: b.x, y: b.y };
    }
    if (!goal) return;

    const sx = (goal.x - cx) * this.zoom + this.W / 2;
    const sy = (goal.y - cy) * this.zoom + this.H / 2;
    const margin = 64;
    const onScreen = sx > margin && sx < this.W - margin && sy > margin && sy < this.H - margin - 90;
    if (onScreen) {
      const t = performance.now() / 1000;
      const g = ctx.createLinearGradient(0, sy - 130 * this.zoom, 0, sy);
      g.addColorStop(0, "rgba(165,224,255,0)");
      g.addColorStop(1, `rgba(165,224,255,${0.24 + Math.sin(t * 3) * 0.08})`);
      ctx.fillStyle = g;
      ctx.fillRect(sx - 4 * this.zoom, sy - 130 * this.zoom, 8 * this.zoom, 130 * this.zoom);
      return;
    }
    const ang = Math.atan2(sy - this.H / 2, sx - this.W / 2);
    const ex = clamp(sx, margin, this.W - margin);
    const ey = clamp(sy, margin, this.H - margin - 90);
    const dMeters = Math.round(dist(goal.x, goal.y, s.player.x, s.player.y) / 40);
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(ang);
    ctx.fillStyle = "rgba(6,12,22,0.8)";
    ctx.strokeStyle = "rgba(165,224,255,0.6)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(16, 0); ctx.lineTo(-10, -11); ctx.lineTo(-4, 0); ctx.lineTo(-10, 11);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.font = "700 11px Rajdhani, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#a5e0ff";
    ctx.fillText(`${dMeters}m`, ex, ey + 26);
    if (goingToGate) {
      ctx.fillStyle = "rgba(255,176,99,0.9)";
      ctx.fillText("GATE", ex, ey - 20);
    }
  }

  private drawGuideMarker(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
    const s = this.state;
    const g = s.guide;
    if (!g) return;
    const sx = (g.x - cx) * this.zoom + this.W / 2;
    const sy = (g.y - cy) * this.zoom + this.H / 2;
    const margin = 64;
    const onScreen = sx > margin && sx < this.W - margin && sy > margin && sy < this.H - margin - 90;
    const t = performance.now() / 1000;

    if (onScreen) {
      const beam = ctx.createLinearGradient(0, sy - 220 * this.zoom, 0, sy);
      beam.addColorStop(0, `${g.color}00`);
      beam.addColorStop(1, `${g.color}66`);
      ctx.fillStyle = beam;
      ctx.fillRect(sx - 5 * this.zoom, sy - 220 * this.zoom, 10 * this.zoom, 220 * this.zoom);
      ctx.strokeStyle = `${g.color}`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(sx, sy, 20 + Math.sin(t * 6) * 4, 8, 0, 0, TAU);
      ctx.stroke();
      ctx.font = "700 12px Rajdhani, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = g.color;
      ctx.fillText(g.label, sx, sy - 18 * this.zoom);
      return;
    }

    const ang = Math.atan2(sy - this.H / 2, sx - this.W / 2);
    const ex = clamp(sx, margin, this.W - margin);
    const ey = clamp(sy, margin, this.H - margin - 90);
    const dMeters = Math.round(dist(g.x, g.y, s.player.x, s.player.y) / 40);
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(ang);
    ctx.fillStyle = "rgba(6,12,22,0.85)";
    ctx.strokeStyle = g.color;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(18, 0); ctx.lineTo(-11, -11); ctx.lineTo(-4, 0); ctx.lineTo(-11, 11);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.font = "700 11px Rajdhani, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = g.color;
    ctx.fillText(`${dMeters}m`, ex, ey + 26);
    ctx.font = "700 10px Rajdhani, sans-serif";
    ctx.fillText("GUIDE", ex, ey - 20);
  }

  private drawVignette(ctx: CanvasRenderingContext2D) {
    const g = ctx.createRadialGradient(this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.36, this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.72);
    g.addColorStop(0, "rgba(5,10,18,0)");
    g.addColorStop(1, "rgba(5,10,18,0.5)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.W, this.H);
  }

  // helper used by the collision module for enemies spawned at runtime
  collide(x: number, y: number, r: number) { return collideAt(this.state, x, y, r); }
}
