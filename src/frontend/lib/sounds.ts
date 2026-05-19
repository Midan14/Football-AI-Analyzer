/**
 * Sound alerts for live match events.
 * Uses Web Audio API to generate tones — no external files needed.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function playTone(frequency: number, duration: number, type: OscillatorType = "sine", volume = 0.3) {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);

    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch {
    // Audio not available — silent fail
  }
}

/**
 * ⚽ GOL — Fanfare triumphant (crowd roar simulation)
 */
export function playGoalSound() {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  // Chord burst (C major)
  [523, 659, 784].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.setValueAtTime(0.25, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 1.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + i * 0.03);
    osc.stop(now + 1.2);
  });

  // Rising sweep
  const sweep = ctx.createOscillator();
  const sweepGain = ctx.createGain();
  sweep.type = "sine";
  sweep.frequency.setValueAtTime(400, now);
  sweep.frequency.exponentialRampToValueAtTime(1200, now + 0.4);
  sweepGain.gain.setValueAtTime(0.2, now);
  sweepGain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
  sweep.connect(sweepGain);
  sweepGain.connect(ctx.destination);
  sweep.start(now);
  sweep.stop(now + 0.6);

  // Crowd noise (white noise burst)
  const bufferSize = ctx.sampleRate * 1.5;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.4));
  }
  const noise = ctx.createBufferSource();
  const noiseGain = ctx.createGain();
  const noiseFilter = ctx.createBiquadFilter();
  noise.buffer = buffer;
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.setValueAtTime(800, now);
  noiseFilter.Q.setValueAtTime(0.5, now);
  noiseGain.gain.setValueAtTime(0.12, now + 0.1);
  noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 1.5);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(now + 0.1);
  noise.stop(now + 1.5);
}

/**
 * 🟨 TARJETA AMARILLA — Short warning beep
 */
export function playCardSound() {
  playTone(880, 0.15, "square", 0.2);
  setTimeout(() => playTone(660, 0.2, "square", 0.15), 180);
}

/**
 * 🟥 TARJETA ROJA — Aggressive double beep
 */
export function playRedCardSound() {
  playTone(220, 0.3, "sawtooth", 0.25);
  setTimeout(() => playTone(180, 0.4, "sawtooth", 0.2), 350);
}

/**
 * ⚡ PENAL — Dramatic rising tone
 */
export function playPenaltySound() {
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(300, now);
  osc.frequency.linearRampToValueAtTime(900, now + 0.5);
  gain.gain.setValueAtTime(0.25, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.8);
}

/**
 * 🔄 SUSTITUCIÓN — Soft chime
 */
export function playSubstitutionSound() {
  playTone(1047, 0.12, "sine", 0.15);
  setTimeout(() => playTone(1319, 0.12, "sine", 0.12), 130);
  setTimeout(() => playTone(1568, 0.15, "sine", 0.1), 260);
}

/**
 * 📋 FALTA — Quick low beep
 */
export function playFoulSound() {
  playTone(440, 0.1, "triangle", 0.1);
}

/**
 * Play sound based on event type
 */
export function playEventSound(eventType: string, detail: string = "") {
  const type = eventType.toLowerCase();
  const det = detail.toLowerCase();

  if (type === "goal" || type.includes("goal")) {
    playGoalSound();
  } else if (type === "card" && det.includes("red")) {
    playRedCardSound();
  } else if (type === "card" || type.includes("yellow")) {
    playCardSound();
  } else if (type.includes("penalty") || det.includes("penalty")) {
    playPenaltySound();
  } else if (type === "subst" || type.includes("substitution")) {
    playSubstitutionSound();
  } else if (type.includes("foul")) {
    playFoulSound();
  }
}
