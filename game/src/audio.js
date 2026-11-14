// Sound, synthesised: no audio files, no network, just the Web Audio API. A gunshot is a
// short burst of filtered noise plus a click; a reload is two clicks; the bomb beeps; the
// explosion is a low sine drop under a noise burst. The context is created on the first user
// gesture (browsers require it) and every call is guarded, so headless runs stay silent.
export function createAudio() {
  let context = null;
  let master = null;
  let enabled = false;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.35;
      master.connect(context.destination);
      enabled = true;
      return true;
    } catch {
      return false;
    }
  }

  function noiseBurst(duration, filterFreq, gainValue, type = 'lowpass') {
    if (!enabled || !context) return;
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start();
  }

  function tone(freq, duration, gainValue, type = 'sine', slideTo = null) {
    if (!enabled || !context) return;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, context.currentTime);
    if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, context.currentTime + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    oscillator.connect(gain).connect(master);
    oscillator.start();
    oscillator.stop(context.currentTime + duration + 0.02);
  }

  return {
    unlock() {
      if (ensure() && context.state === 'suspended') context.resume().catch(() => {});
    },
    shot(kind) {
      if (!ensure()) return;
      if (kind === 'sniper') {
        noiseBurst(0.22, 900, 0.9);
        tone(160, 0.14, 0.25, 'sawtooth', 60);
      } else if (kind === 'smg') {
        noiseBurst(0.08, 2400, 0.5);
      } else if (kind === 'pistol') {
        noiseBurst(0.11, 1600, 0.6);
      } else {
        noiseBurst(0.13, 1400, 0.7);
        tone(120, 0.08, 0.2, 'square', 50);
      }
    },
    dry() {
      tone(900, 0.04, 0.15, 'square');
    },
    reload() {
      tone(500, 0.05, 0.2, 'square');
      setTimeout(() => tone(700, 0.05, 0.2, 'square'), 350);
    },
    hit() {
      tone(1400, 0.05, 0.25, 'sine');
    },
    kill() {
      tone(1400, 0.05, 0.25, 'sine');
      setTimeout(() => tone(1800, 0.07, 0.25, 'sine'), 70);
    },
    step() {
      noiseBurst(0.05, 500, 0.08);
    },
    plantBeep() {
      tone(1100, 0.08, 0.3, 'sine');
    },
    explosion() {
      noiseBurst(0.9, 300, 1);
      tone(90, 0.8, 0.6, 'sine', 30);
    },
    roundWin() {
      tone(523, 0.12, 0.3, 'sine');
      setTimeout(() => tone(659, 0.12, 0.3, 'sine'), 120);
      setTimeout(() => tone(784, 0.2, 0.3, 'sine'), 240);
    },
    roundLose() {
      tone(392, 0.15, 0.3, 'sine');
      setTimeout(() => tone(311, 0.25, 0.3, 'sine'), 150);
    },
    buy() {
      tone(880, 0.06, 0.2, 'sine');
      setTimeout(() => tone(1174, 0.08, 0.2, 'sine'), 60);
    },
  };
}
