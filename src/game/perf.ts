// ── ICEBOUND V3: quality tiers + adaptive performance monitor ──────────────
//
// Goal: stable 30 FPS on weak devices, 60 FPS on capable ones, without
// deleting gameplay or visual identity. "auto" watches the real frame time
// and steps the tier down (and back up) on its own.

export type QualityId = "auto" | "low" | "med" | "high";
export type Tier = "low" | "med" | "high";

export interface QualityProfile {
  particles: number;    // hard cap on live particles
  burstMul: number;     // multiplier on burst counts
  flakes: number;       // base snowflake count
  lighting: boolean;    // additive light pass + darkness mask holes
  groundShadows: boolean;
  footprints: number;   // max footprint decals
  gustStreaks: boolean;
  auroraBands: number;
  hazardDetail: boolean;
  dpr: number;          // device-pixel-ratio ceiling
}

export const PROFILES: Record<Tier, QualityProfile> = {
  low:  { particles: 110, burstMul: 0.45, flakes: 46,  lighting: false, groundShadows: false, footprints: 18, gustStreaks: false, auroraBands: 1, hazardDetail: false, dpr: 1 },
  med:  { particles: 260, burstMul: 0.75, flakes: 92,  lighting: true,  groundShadows: true,  footprints: 48, gustStreaks: true,  auroraBands: 2, hazardDetail: true,  dpr: 1.5 },
  high: { particles: 460, burstMul: 1,    flakes: 140, lighting: true,  groundShadows: true,  footprints: 90, gustStreaks: true,  auroraBands: 3, hazardDetail: true,  dpr: 2 },
};

export const QUALITY_LABEL: Record<QualityId, string> = {
  auto: "Auto", low: "Performance", med: "Balanced", high: "Quality",
};

/** Rolling frame-time monitor that nudges the tier when "auto" is selected. */
export class PerfMonitor {
  fps = 60;
  tier: Tier = "high";
  private acc = 0;
  private frames = 0;
  private holdT = 0;
  private lowStreak = 0;
  private highStreak = 0;

  /** Pick a sensible starting tier from device hints (no network, no probing). */
  static initialTier(): Tier {
    if (typeof navigator === "undefined") return "high";
    const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4;
    const cores = navigator.hardwareConcurrency ?? 4;
    const coarse = typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches ?? false);
    if (mem <= 2 || cores <= 3) return "low";
    if (coarse && (mem <= 4 || cores <= 6)) return "med";
    return "high";
  }

  reset(tier: Tier) {
    this.tier = tier;
    this.lowStreak = 0;
    this.highStreak = 0;
    this.holdT = 2.5;
  }

  /** Call once per rendered frame. Returns true when the tier changed. */
  sample(dt: number, auto: boolean): boolean {
    this.acc += dt;
    this.frames++;
    if (this.acc < 0.5) return false;
    this.fps = this.frames / this.acc;
    this.acc = 0;
    this.frames = 0;
    if (!auto) return false;

    if (this.holdT > 0) { this.holdT -= 0.5; return false; }

    if (this.fps < 26) this.lowStreak++; else this.lowStreak = 0;
    if (this.fps > 56) this.highStreak++; else this.highStreak = 0;

    if (this.lowStreak >= 3 && this.tier !== "low") {
      this.tier = this.tier === "high" ? "med" : "low";
      this.lowStreak = 0;
      this.holdT = 6;
      return true;
    }
    if (this.highStreak >= 14 && this.tier !== "high") {
      this.tier = this.tier === "low" ? "med" : "high";
      this.highStreak = 0;
      this.holdT = 8;
      return true;
    }
    return false;
  }
}
