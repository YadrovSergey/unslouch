function tone(freqs: number[], gap: number, volume: number, length: number) {
  const ctx = new AudioContext();
  freqs.forEach((freq, i) => {
    const start = ctx.currentTime + i * gap;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, start + length);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + length + 0.1);
  });
  setTimeout(() => ctx.close(), (freqs.length * gap + length + 0.5) * 1000);
}

/** A soft two-note chime: the break is over, you can look back at the screen. */
export function playChime() {
  tone([659.25, 880], 0.28, 0.18, 1.4);
}

/** A soft rising two-note sound with a gentle cue (blink, posture, water), if the user turned it on. */
export function playCue() {
  tone([587.33, 783.99], 0.12, 0.1, 0.7);
}

/** A quiet tick between steps of an exercise done with eyes closed. */
export function playTick() {
  tone([523.25], 0, 0.08, 0.35);
}
