/**
 * Procedural F1 V6 turbo-hybrid engine synth.
 * High-RPM scream, turbo whistle, firing pulse, lift-off crackle.
 * Unlock on first user gesture (browser autoplay policy).
 */

function makeSaturationCurve(amount = 0.35) {
  const n = 256;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = Math.tanh(x * (1 + amount * 6)) / Math.tanh(1 + amount * 6);
  }
  return curve;
}

export class EngineAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.unlocked = false;
    this.enabled = true;
    this.rpm = 0.14;
    this.targetRpm = 0.14;
    this.prevThrottle = 0;
    this.crackleCooldown = 0;
    this.synth = null;
  }

  async unlock() {
    if (this.unlocked) return;
    try {
      this.ctx = new AudioContext();

      this.master = this.ctx.createGain();
      this.master.gain.value = 0.38;

      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -22;
      this.compressor.knee.value = 8;
      this.compressor.ratio.value = 3.5;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.12;
      this.compressor.connect(this.master);
      this.master.connect(this.ctx.destination);

      this._initSynth();
      this.unlocked = true;
    } catch (err) {
      console.warn('Engine audio failed to start:', err);
    }
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) {
      this.master.gain.setTargetAtTime(on ? 0.38 : 0, this.ctx?.currentTime ?? 0, 0.05);
    }
  }

  _initSynth() {
    const ctx = this.ctx;
    const bus = this.compressor;

    const saturator = ctx.createWaveShaper();
    saturator.curve = makeSaturationCurve(0.42);
    saturator.oversample = '2x';
    saturator.connect(bus);

    // --- Core scream: detuned saws through sweeping bandpass ---
    const screamFilter = ctx.createBiquadFilter();
    screamFilter.type = 'bandpass';
    screamFilter.frequency.value = 900;
    screamFilter.Q.value = 1.4;

    const screamGain = ctx.createGain();
    screamGain.gain.value = 0;
    screamFilter.connect(screamGain);
    screamGain.connect(saturator);

    const screamOscs = [];
    for (let i = 0; i < 4; i++) {
      const osc = ctx.createOscillator();
      osc.type = i < 2 ? 'sawtooth' : 'square';
      osc.frequency.value = 110;
      osc.detune.value = (i - 1.5) * 14 + (i % 2) * 7;
      osc.connect(screamFilter);
      osc.start();
      screamOscs.push(osc);
    }

    // V6 firing pulse modulates scream amplitude
    const pulseOsc = ctx.createOscillator();
    pulseOsc.type = 'sine';
    pulseOsc.frequency.value = 45;
    const pulseDepth = ctx.createGain();
    pulseDepth.gain.value = 0.12;
    pulseOsc.connect(pulseDepth);
    pulseOsc.start();
    pulseDepth.connect(screamGain.gain);

    // --- High harmonic layer (the "F1 bite") ---
    const biteFilter = ctx.createBiquadFilter();
    biteFilter.type = 'highpass';
    biteFilter.frequency.value = 1800;
    biteFilter.Q.value = 0.7;

    const biteGain = ctx.createGain();
    biteGain.gain.value = 0;
    biteFilter.connect(biteGain);
    biteGain.connect(saturator);

    const biteOsc = ctx.createOscillator();
    biteOsc.type = 'sawtooth';
    biteOsc.frequency.value = 220;
    biteOsc.connect(biteFilter);
    biteOsc.start();

    // --- Turbo whistle ---
    const turboFilter = ctx.createBiquadFilter();
    turboFilter.type = 'bandpass';
    turboFilter.frequency.value = 4200;
    turboFilter.Q.value = 8;

    const turboGain = ctx.createGain();
    turboGain.gain.value = 0;
    turboFilter.connect(turboGain);
    turboGain.connect(bus);

    const turboOsc = ctx.createOscillator();
    turboOsc.type = 'sine';
    turboOsc.frequency.value = 3200;
    turboOsc.connect(turboFilter);
    turboOsc.start();

    const turboHarm = ctx.createOscillator();
    turboHarm.type = 'sine';
    turboHarm.frequency.value = 6400;
    turboHarm.connect(turboFilter);
    turboHarm.start();

    // --- Low throat / exhaust body ---
    const throatGain = ctx.createGain();
    throatGain.gain.value = 0;
    throatGain.connect(saturator);

    const throatOsc = ctx.createOscillator();
    throatOsc.type = 'triangle';
    throatOsc.frequency.value = 62;
    throatOsc.connect(throatGain);
    throatOsc.start();

    const throatSub = ctx.createOscillator();
    throatSub.type = 'sine';
    throatSub.frequency.value = 31;
    throatSub.connect(throatGain);
    throatSub.start();

    // --- Noise buffer for crackle ---
    const noiseLen = ctx.sampleRate * 2;
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) data[i] = Math.random() * 2 - 1;

    this.synth = {
      screamOscs,
      screamFilter,
      screamGain,
      biteOsc,
      biteGain,
      turboOsc,
      turboHarm,
      turboFilter,
      turboGain,
      throatOsc,
      throatSub,
      throatGain,
      pulseOsc,
      pulseDepth,
      noiseBuf,
    };
  }

  _fundHz(rpm) {
    // F1 idle ~5k / max ~12k — nonlinear pitch curve for top-end scream
    return 88 + Math.pow(rpm, 1.18) * 340;
  }

  _playCrackle(intensity) {
    if (!this.synth || this.crackleCooldown > 0) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.synth.noiseBuf;
    src.loop = true;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1200 + Math.random() * 2800;
    bp.Q.value = 2.5 + Math.random() * 3;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.18 * intensity, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04 + Math.random() * 0.06);

    src.connect(bp);
    bp.connect(g);
    g.connect(this.compressor);
    src.start(t);
    src.stop(t + 0.12);

    this.crackleCooldown = 0.06 + Math.random() * 0.08;
  }

  update(dt, { speed = 0, maxSpeed = 88, throttle = 0, brake = 0, steer = 0, curvature = 0, racing = false }) {
    if (!this.unlocked || !this.enabled || !this.synth) return;

    const speedRatio = Math.min(1, speed / Math.max(maxSpeed, 1));
    const inCorner = curvature > 0.0012;
    const cornerLoad = inCorner ? Math.min(1, curvature * 9000) : 0;
    const steerLoad = Math.abs(steer);

    if (!racing) {
      this.targetRpm = 0.14 + throttle * 0.1;
    } else {
      // Throttle-driven like real F1 — speed sets floor, throttle drives revs hard
      const speedFloor = 0.18 + speedRatio * 0.42;
      const throttlePush = throttle * (0.38 + speedRatio * 0.22);
      const brakeDrop = brake * (0.22 + cornerLoad * 0.12);
      const cornerTrim = inCorner && steerLoad > 0.15 ? cornerLoad * 0.14 : 0;

      this.targetRpm = Math.max(0.12, speedFloor + throttlePush - brakeDrop - cornerTrim);
    }

    // Fast attack, slower release — snap revs on throttle, hang on overrun
    const rising = this.targetRpm > this.rpm;
    const rate = rising ? 22 : throttle > 0.1 ? 14 : 9;
    this.rpm += (this.targetRpm - this.rpm) * Math.min(1, dt * rate);

    // Lift-off crackle when coming off throttle at high revs
    if (
      racing
      && this.prevThrottle > 0.55
      && throttle < 0.12
      && this.rpm > 0.42
      && speedRatio > 0.25
    ) {
      const pops = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < pops; i++) {
        setTimeout(() => this._playCrackle(this.rpm * (0.7 + Math.random() * 0.3)), i * 45);
      }
    }
    this.prevThrottle = throttle;
    this.crackleCooldown = Math.max(0, this.crackleCooldown - dt);

    const rpm = this.rpm;
    const fund = this._fundHz(rpm);
    const t = this.ctx.currentTime;
    const s = this.synth;

    // Scream oscillators — spread harmonics
    s.screamOscs.forEach((osc, i) => {
      osc.frequency.setTargetAtTime(fund * (1 + i * 0.5), t, 0.025);
    });

    const screamCenter = 380 + Math.pow(rpm, 1.3) * 5200;
    s.screamFilter.frequency.setTargetAtTime(screamCenter, t, 0.04);
    s.screamFilter.Q.setTargetAtTime(0.9 + rpm * 2.8 + throttle * 1.2, t, 0.06);

    const screamVol = racing
      ? 0.08 + Math.pow(rpm, 1.4) * 0.38 + throttle * 0.12
      : 0.04 + rpm * 0.08;
    s.screamGain.gain.setTargetAtTime(screamVol, t, 0.03);

    // High bite layer — dominant at high RPM
    s.biteOsc.frequency.setTargetAtTime(fund * 2.8, t, 0.03);
    s.biteGain.gain.setTargetAtTime(
      racing ? Math.pow(Math.max(0, rpm - 0.25), 2) * 0.55 + throttle * rpm * 0.15 : rpm * 0.04,
      t,
      0.04
    );

    // Turbo whistle — strongest on throttle at high speed
    const turboHz = 2400 + rpm * 6800;
    s.turboOsc.frequency.setTargetAtTime(turboHz, t, 0.05);
    s.turboHarm.frequency.setTargetAtTime(turboHz * 1.97, t, 0.05);
    s.turboFilter.frequency.setTargetAtTime(turboHz * 0.92, t, 0.05);
    const turboVol = racing
      ? Math.pow(rpm, 2.1) * throttle * 0.14 + speedRatio * rpm * 0.04
      : rpm * throttle * 0.03;
    s.turboGain.gain.setTargetAtTime(turboVol, t, 0.04);

    // Throat / sub body
    s.throatOsc.frequency.setTargetAtTime(fund * 0.5, t, 0.05);
    s.throatSub.frequency.setTargetAtTime(fund * 0.25, t, 0.05);
    s.throatGain.gain.setTargetAtTime(0.06 + rpm * 0.14 + throttle * 0.05, t, 0.05);

    // V6 pulse rate scales with RPM (3rd-order firing feel)
    s.pulseOsc.frequency.setTargetAtTime(fund * 1.5, t, 0.06);
    s.pulseDepth.gain.setTargetAtTime(0.06 + rpm * 0.14, t, 0.06);

    const masterVol = racing ? 0.38 : 0.14;
    this.master.gain.setTargetAtTime(masterVol, t, 0.08);
  }

  dispose() {
    if (this.ctx) this.ctx.close();
    this.unlocked = false;
    this.synth = null;
  }
}
