// ── ICEBOUND: fully synthesized WebAudio engine — no external audio files ────

import type { Settings } from "./types";

type AC = AudioContext;

const clamp01 = (v: number) => (typeof v === "number" && isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

export class AudioEngine {
  private ac: AC | null = null;
  private master!: GainNode;
  private musicG!: GainNode;
  private sfxG!: GainNode;
  private ambG!: GainNode;
  private noiseBuf!: AudioBuffer;
  private getSettings: () => Settings;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windSource: AudioBufferSourceNode | null = null;
  private windLfo: OscillatorNode | null = null;
  private fireGain: GainNode | null = null;
  private fireSource: AudioBufferSourceNode | null = null;
  private musicTimer: number | null = null;
  private nextChord = 0;
  private chordIdx = 0;
  private bellT = 0;
  private crackleT = 0;

  constructor(getSettings: () => Settings) {
    this.getSettings = getSettings;
  }

  get ready() { return !!this.ac && this.ac.state === "running"; }

  unlock() {
    if (this.ac) {
      if (this.ac.state === "suspended") {
        void this.ac.resume()
          .then(() => this.activateAfterGesture())
          .catch(() => { /* blocked: stay silent until another gesture */ });
      } else if (this.ac.state === "running") this.activateAfterGesture();
      return;
    }
    try {
      const Ctor: typeof AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;                     // no Web Audio support: run silent
      this.ac = new Ctor();
      this.master = this.ac.createGain();
      this.master.connect(this.ac.destination);
      this.musicG = this.ac.createGain();
      this.musicG.connect(this.master);
      this.sfxG = this.ac.createGain();
      this.sfxG.connect(this.master);
      // Ambient beds (wind, storm, fire) get their own bus so they can be
      // balanced against one-shot effects independently.
      this.ambG = this.ac.createGain();
      this.ambG.connect(this.master);
      // shared noise buffer, 2s white noise
      const len = this.ac.sampleRate * 2;
      this.noiseBuf = this.ac.createBuffer(1, len, this.ac.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
    } catch {
      // Construction or node setup failed (restricted WebView, blocked codec).
      // Clear any half-built state so `ready` stays false and the game runs
      // silently rather than throwing on every later sound call.
      this.ac = null;
      return;
    }
    if (this.ac && this.ac.state === "suspended") {
      void this.ac.resume()
        .then(() => this.activateAfterGesture())
        .catch(() => { /* autoplay policy: wait for another gesture */ });
    } else if (this.ac?.state === "running") this.activateAfterGesture();
  }

  private activateAfterGesture() {
    this.applyVolumes();
    this.startWind();
    if (this.getSettings().music > 0) this.startMusic();
  }

  applyVolumes() {
    if (!this.ac) return;   // safe before unlock(): values apply on creation
    const s = this.getSettings();
    const t = this.ac.currentTime;
    const master = clamp01(s.master ?? 1);
    // setTargetAtTime avoids the audible click a direct .value jump causes.
    this.master.gain.setTargetAtTime(master, t, 0.02);
    this.musicG.gain.setTargetAtTime(clamp01(s.music) * 0.9, t, 0.02);
    this.sfxG.gain.setTargetAtTime(clamp01(s.sfx), t, 0.02);
    this.ambG.gain.setTargetAtTime(clamp01(s.ambient ?? 0.8), t, 0.05);
  }

  /** True once the context is running — the UI uses this to show an
   *  "audio starts on first tap" hint where autoplay is blocked. */
  get unlocked() { return !!this.ac && this.ac.state === "running"; }

  // ── primitives ────────────────────────────────────────────────────────────
  private tone(freq: number, type: OscillatorType, at: number, dur: number, vol: number, slideTo?: number, dest?: GainNode) {
    if (!this.ac) return;
    const t = this.ac.currentTime + at;
    const o = this.ac.createOscillator();
    const g = this.ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfxG);
    o.start(t); o.stop(t + dur + 0.05);
  }

  private noise(at: number, dur: number, vol: number, ftype: BiquadFilterType, freq: number, q = 1, slideTo?: number) {
    if (!this.ac) return;
    const t = this.ac.currentTime + at;
    const src = this.ac.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = this.ac.createBiquadFilter();
    f.type = ftype; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (slideTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxG);
    src.start(t); src.stop(t + dur + 0.05);
  }

  // ── SFX vocabulary ────────────────────────────────────────────────────────
  ui()         { this.tone(1250, "sine", 0, 0.07, 0.1); this.tone(1750, "sine", 0.03, 0.06, 0.06); }
  open()       { this.tone(700, "sine", 0, 0.12, 0.08, 1050); }
  close()      { this.tone(900, "sine", 0, 0.1, 0.07, 620); }
  foot()       { this.noise(0, 0.08, 0.06 + Math.random() * 0.03, "lowpass", 420 + Math.random() * 220); }
  pickup()     { this.tone(880, "sine", 0, 0.09, 0.12); this.tone(1320, "sine", 0.07, 0.12, 0.1); }
  gatherWood() { this.noise(0, 0.09, 0.22, "lowpass", 900); this.tone(170, "square", 0, 0.08, 0.12, 90); }
  gatherStone(){ this.tone(330, "triangle", 0, 0.07, 0.14, 240); this.noise(0, 0.06, 0.16, "highpass", 2200); }
  gatherIce()  { this.tone(1560, "sine", 0, 0.14, 0.1, 2300); this.noise(0, 0.1, 0.08, "highpass", 4200); }
  gatherLeaf() { this.noise(0, 0.12, 0.1, "bandpass", 1600, 2); this.tone(980, "sine", 0.02, 0.1, 0.06); }
  eat()        { this.tone(520, "sine", 0, 0.09, 0.1, 380); this.tone(430, "sine", 0.1, 0.1, 0.08, 320); }
  craft()      { [660, 880, 1320].forEach((f, i) => this.tone(f, "triangle", i * 0.07, 0.22, 0.09)); }
  build()      { this.noise(0, 0.16, 0.25, "lowpass", 500); [440, 660, 990].forEach((f, i) => this.tone(f, "triangle", 0.1 + i * 0.08, 0.25, 0.09)); }
  error()      { this.tone(190, "square", 0, 0.14, 0.1, 130); }
  swing()      { this.noise(0, 0.16, 0.12, "bandpass", 1500, 1.4, 500); }
  hit()        { this.tone(150, "sine", 0, 0.14, 0.28, 55); this.noise(0, 0.1, 0.2, "lowpass", 1100); }
  wolfGrowl()  { this.tone(92, "sawtooth", 0, 0.65, 0.14, 74); this.noise(0, 0.6, 0.1, "lowpass", 300); }
  wolfBite()   { this.noise(0, 0.16, 0.26, "lowpass", 1600, 1, 300); this.tone(120, "sine", 0, 0.12, 0.2, 60); }
  wolfDie()    { this.tone(420, "sawtooth", 0, 0.6, 0.12, 140); this.tone(150, "sine", 0.4, 0.3, 0.18, 60); }
  hurt()       { this.tone(110, "sine", 0, 0.18, 0.3, 50); this.noise(0, 0.12, 0.16, "lowpass", 700); }
  dodge()      { this.noise(0, 0.18, 0.1, "bandpass", 500, 1, 2200); }
  quest()      { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, "triangle", i * 0.1, 0.4, 0.1)); }
  warn()       { this.tone(210, "sine", 0, 0.16, 0.16); this.tone(210, "sine", 0.24, 0.16, 0.13); }
  death()      { this.tone(220, "sawtooth", 0, 1.6, 0.12, 55); this.noise(0, 1.4, 0.1, "lowpass", 500, 1, 90); }
  healed()     { this.tone(620, "sine", 0, 0.2, 0.09, 940); }
  equip()      { this.noise(0, 0.08, 0.14, "bandpass", 2000, 2); this.tone(740, "triangle", 0.02, 0.1, 0.08); }
  fireLight()  { this.noise(0, 0.7, 0.22, "lowpass", 300, 1, 2600); }
  fireAdd()    { this.gatherWood(); }
  cook()       { this.noise(0, 0.5, 0.12, "highpass", 3200); }

  // ── V2: gathering & world ──
  footHard()    { this.noise(0, 0.07, 0.07, "bandpass", 900 + Math.random() * 400, 1.6); }
  gatherMetal() { this.tone(520, "square", 0, 0.08, 0.1, 300); this.noise(0, 0.12, 0.16, "bandpass", 2600, 2); }
  gatherCrystal(){ [1200, 1800, 2400].forEach((f, i) => this.tone(f, "sine", i * 0.04, 0.3, 0.07)); this.noise(0, 0.1, 0.06, "highpass", 5000); }
  rare()        { [784, 1046, 1318].forEach((f, i) => this.tone(f, "triangle", i * 0.06, 0.4, 0.08)); }
  craftRare()   { [523, 784, 1046, 1568].forEach((f, i) => this.tone(f, "triangle", i * 0.08, 0.5, 0.09)); }
  discover()    { [392, 523, 659, 880].forEach((f, i) => this.tone(f, "sine", i * 0.12, 0.7, 0.09)); }
  travel()      { this.noise(0, 0.5, 0.14, "lowpass", 600, 1, 2400); this.tone(330, "sine", 0.1, 0.4, 0.07, 660); }
  iceCrack()    { this.noise(0, 0.18, 0.2, "highpass", 2400); this.tone(240, "square", 0, 0.1, 0.1, 90); }
  caveDrip()    { this.tone(1400, "sine", 0, 0.16, 0.07, 700); }
  metalGroan()  { this.tone(78, "sawtooth", 0, 1.6, 0.09, 52); this.noise(0, 1.4, 0.05, "lowpass", 260); }
  elecBuzz()    { this.tone(120, "square", 0, 0.5, 0.05, 118); this.noise(0, 0.5, 0.04, "bandpass", 3000, 6); }
  fortressHum() { this.tone(58, "sine", 0, 2.4, 0.1, 54); this.tone(87, "sine", 0.2, 2.2, 0.05); }
  blizzard()    { this.noise(0, 2.2, 0.16, "lowpass", 500, 1, 1600); }
  aurora()      { [659, 880, 1318].forEach((f, i) => this.tone(f, "sine", i * 0.22, 1.5, 0.05)); }

  // ── V2: devices & containers ──
  crateOpen()   { this.noise(0, 0.22, 0.2, "lowpass", 800); this.tone(220, "square", 0.04, 0.12, 0.08, 150); }
  vaultOpen()   { this.tone(110, "sawtooth", 0, 0.8, 0.12, 80); [440, 660, 880].forEach((f, i) => this.tone(f, "sine", 0.3 + i * 0.1, 0.5, 0.08)); }
  resonate()    { [523, 784, 1046].forEach((f, i) => this.tone(f, "sine", i * 0.05, 1.4, 0.08)); this.tone(1568, "sine", 0.1, 1.2, 0.04); }
  switch()      { this.tone(300, "square", 0, 0.06, 0.12, 190); this.noise(0.02, 0.07, 0.1, "bandpass", 1400, 3); }
  power()       { this.tone(80, "sawtooth", 0, 1.1, 0.1, 220); [330, 440, 550].forEach((f, i) => this.tone(f, "triangle", 0.4 + i * 0.08, 0.6, 0.07)); }
  gateOpen()    { this.tone(62, "sawtooth", 0, 1.8, 0.14, 44); this.noise(0.1, 1.4, 0.14, "lowpass", 420); [220, 294].forEach((f, i) => this.tone(f, "sine", 0.6 + i * 0.2, 1.2, 0.06)); }
  logFound()    { this.tone(880, "sine", 0, 0.22, 0.08); this.tone(1174, "sine", 0.12, 0.3, 0.07); }

  // ── V2: creatures ──
  bearRoar()    { this.tone(72, "sawtooth", 0, 1.1, 0.2, 48); this.noise(0, 1.0, 0.16, "lowpass", 360, 1, 160); this.tone(145, "square", 0.05, 0.7, 0.07, 96); }
  bearSlam()    { this.tone(56, "sine", 0, 0.5, 0.34, 28); this.noise(0, 0.36, 0.3, "lowpass", 700, 1, 120); }
  bearDie()     { this.tone(180, "sawtooth", 0, 1.1, 0.16, 60); this.noise(0.2, 0.8, 0.12, "lowpass", 400); }
  crawlerHiss() { this.noise(0, 0.5, 0.14, "highpass", 3800); this.tone(1800, "sawtooth", 0, 0.3, 0.05, 900); }
  crawlerHit()  { this.noise(0, 0.14, 0.22, "bandpass", 2600, 2); this.tone(300, "square", 0, 0.1, 0.14, 120); }
  crawlerDie()  { this.tone(900, "sawtooth", 0, 0.4, 0.1, 180); this.noise(0.1, 0.4, 0.14, "highpass", 2600); }

  // ── V2: boss ──
  bossRoar()    { this.tone(48, "sawtooth", 0, 2.2, 0.26, 34); this.tone(96, "square", 0.1, 1.6, 0.12, 64); this.noise(0, 2.0, 0.16, "lowpass", 300); [196, 233].forEach((f, i) => this.tone(f, "sine", 0.5 + i * 0.3, 1.4, 0.06)); }
  bossWindup()  { this.tone(130, "sawtooth", 0, 0.8, 0.12, 320); this.noise(0, 0.7, 0.08, "bandpass", 1200, 3); }
  bossSlam()    { this.tone(44, "sine", 0, 0.7, 0.36, 22); this.noise(0, 0.5, 0.32, "lowpass", 600, 1, 90); this.tone(160, "square", 0, 0.2, 0.14, 60); }
  bossPhase()   { [110, 165, 220, 330].forEach((f, i) => this.tone(f, "sawtooth", i * 0.07, 1.0, 0.1)); this.noise(0, 0.9, 0.14, "highpass", 2200); }
  bossDie()     { this.tone(220, "sawtooth", 0, 2.6, 0.2, 40); this.noise(0.2, 2.2, 0.18, "lowpass", 800, 1, 60); [523, 392, 261].forEach((f, i) => this.tone(f, "sine", 0.8 + i * 0.3, 1.6, 0.08)); }
  shardFire()   { this.tone(1600, "sine", 0, 0.18, 0.09, 600); this.noise(0, 0.1, 0.06, "highpass", 4000); }

  // ── loops ─────────────────────────────────────────────────────────────────
  startWind() {
    const ac = this.ac;
    if (!ac || ac.state !== "running" || this.windGain) return;
    const src = ac.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 320;
    this.windFilter = f;
    const g = ac.createGain(); g.gain.value = 0.05;
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.11;
    const lfoG = ac.createGain(); lfoG.gain.value = 0.028;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    src.connect(f); f.connect(g); g.connect(this.ambG);
    src.start(); lfo.start();
    this.windSource = src;
    this.windLfo = lfo;
    this.windGain = g;
  }

  /** Blend the wind bed toward a storm. The oscillator keeps running, so this
   *  never restarts ambience during ordinary interface transitions. */
  setStorm(intensity: number) {
    if (!this.ac || !this.windGain) return;
    const t = this.ac.currentTime;
    const i = clamp01(intensity);
    this.windGain.gain.setTargetAtTime(0.05 + i * 0.09, t, 0.8);
    if (this.windFilter) this.windFilter.frequency.setTargetAtTime(320 + i * 520, t, 0.8);
  }

  setFire(on: boolean) {
    if (!this.ac) return;   // uses this.ac, not ready: fire may resume later
    if (on && !this.fireGain) {
      const src = this.ac.createBufferSource();
      src.buffer = this.noiseBuf; src.loop = true; src.playbackRate.value = 0.82;
      const f = this.ac.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1700; f.Q.value = 0.7;
      const g = this.ac.createGain(); g.gain.value = 0;
      g.gain.setTargetAtTime(0.055, this.ac.currentTime, 0.5);
      src.connect(f); f.connect(g); g.connect(this.ambG);
      src.start();
      this.fireSource = src;
      this.fireGain = g;
    } else if (!on && this.fireGain) {
      const g = this.fireGain;
      const src = this.fireSource;
      g.gain.setTargetAtTime(0, this.ac.currentTime, 0.4);
      this.fireGain = null;
      this.fireSource = null;
      // Let the fade finish, then remove the infinite noise source. Relighting
      // used to stack another source every time and leak audio nodes forever.
      window.setTimeout(() => {
        try { src?.stop(); } catch { /* already stopped */ }
        try { src?.disconnect(); g.disconnect(); } catch { /* context closed */ }
      }, 900);
    }
  }

  crackle() {
    if (!this.ac || !this.fireGain) return;
    const now = this.ac.currentTime;
    if (now < this.crackleT) return;
    this.crackleT = now + 0.1 + Math.random() * 0.3;
    this.noise(0, 0.03 + Math.random() * 0.04, 0.05 + Math.random() * 0.05, "highpass", 2600);
  }

  startMusic() {
    const ac = this.ac;
    if (!ac || ac.state !== "running" || this.musicTimer !== null) return;
    this.nextChord = ac.currentTime + 0.1;
    const tick = () => {
      if (!this.ac) return;
      const now = this.ac.currentTime;
      // slow arctic pad chords
      const chords = [
        [110, 164.8, 220, 261.6],   // Am
        [87.3, 130.8, 174.6, 220],  // F
        [98, 146.8, 196, 246.9],    // G
        [82.4, 123.5, 164.8, 207.7] // E-ish drone
      ];
      while (this.nextChord < now + 1.2) {
        const chord = chords[this.chordIdx % chords.length];
        const t0 = this.nextChord;
        chord.forEach((f, i) => {
          this.pad(f, t0 - now + i * 0.08, 7.2, 0.035);
          this.pad(f * 1.005, t0 - now + i * 0.08 + 0.06, 7.2, 0.028);
        });
        this.chordIdx++;
        this.nextChord += 7;
      }
      // sparse aurora bells
      if (now > this.bellT) {
        this.bellT = now + 2.5 + Math.random() * 4;
        const notes = [523.3, 587.3, 659.3, 784, 880];
        const n = notes[Math.floor(Math.random() * notes.length)];
        this.bell(n, 0.05);
        if (Math.random() < 0.35) this.bell(n * 1.5, 1.1);
      }
    };
    tick();
    this.musicTimer = window.setInterval(tick, 400);
  }

  private pad(freq: number, at: number, dur: number, vol: number) {
    if (!this.ac) return;
    const t = this.ac.currentTime + at;
    const o = this.ac.createOscillator(); o.type = "triangle"; o.frequency.value = freq;
    const f = this.ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 780;
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.4);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.musicG);
    o.start(t); o.stop(t + dur + 0.1);
  }

  private bell(freq: number, at: number) {
    if (!this.ac) return;
    const t = this.ac.currentTime + at;
    const o = this.ac.createOscillator(); o.type = "sine"; o.frequency.value = freq;
    const o2 = this.ac.createOscillator(); o2.type = "sine"; o2.frequency.value = freq * 2.01;
    const g = this.ac.createGain();
    const d = this.ac.createDelay(); d.delayTime.value = 0.42;
    const fb = this.ac.createGain(); fb.gain.value = 0.32;
    d.connect(fb); fb.connect(d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.045, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    o.connect(g); o2.connect(g);
    g.connect(this.musicG); g.connect(d); d.connect(this.musicG);
    o.start(t); o.stop(t + 2.8); o2.start(t); o2.stop(t + 2.8);
    // The feedback cycle d↔fb is self-referential and cannot be collected while
    // it remains connected. Disconnect it after the audible tail has ended.
    window.setTimeout(() => {
      try {
        o.disconnect(); o2.disconnect(); g.disconnect();
        d.disconnect(); fb.disconnect();
      } catch { /* audio context was closed */ }
    }, Math.ceil((at + 5.2) * 1000));
  }

  stopAll() {
    if (this.musicTimer !== null) { clearInterval(this.musicTimer); this.musicTimer = null; }
    try { this.windSource?.stop(); } catch { /* already stopped */ }
    try { this.windLfo?.stop(); } catch { /* already stopped */ }
    try { this.fireSource?.stop(); } catch { /* already stopped */ }
    this.windSource = null; this.windLfo = null; this.windGain = null; this.windFilter = null;
    this.fireSource = null; this.fireGain = null;
    const ac = this.ac;
    this.ac = null;
    if (ac && ac.state !== "closed") void ac.close().catch(() => { /* best effort */ });
  }
}
