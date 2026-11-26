// Generated sound with WebAudio: a piston-engine hum that follows the
// throttle, a chime for a threaded ring, a thump for a rough touchdown and
// a crunch for a crash. No audio files — everything is synthesised, and the
// whole thing stays silent until the first key or click (browser policy).

export function createSound() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineOsc.connect(filter).connect(engineGain).connect(ctx.destination);
      engineOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function blip(frequency, seconds, type, volume) {
    if (!ensure() || muted) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + seconds);
  }

  function noiseBurst(seconds, volume, cutoff) {
    if (!ensure() || muted) return;
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();
  }

  return {
    /** Follow the throttle with the engine hum (call every frame). */
    engine(throttle, running) {
      if (!ensure() || !engineOsc) return;
      const target = muted || !running ? 0 : 0.02 + throttle * 0.075;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(55 + throttle * 95, ctx.currentTime, 0.08);
    },
    ring() { blip(880, 0.22, 'sine', 0.16); blip(1318, 0.3, 'sine', 0.1); },
    drop() { blip(330, 0.18, 'triangle', 0.12); },
    scored() { blip(659, 0.2, 'sine', 0.15); blip(988, 0.32, 'sine', 0.12); },
    thump() { noiseBurst(0.22, 0.3, 300); },
    crash() { noiseBurst(0.7, 0.5, 500); },
    toggleMute() {
      muted = !muted;
      if (muted && engineGain) engineGain.gain.value = 0;
      return muted;
    },
  };
}
