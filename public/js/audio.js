// Musique de fond + bruitages, entièrement synthétisés avec WebAudio (aucun fichier audio requis).
const Audio = (() => {
  let ctx, master, musicGain, sfxGain;
  const state = { music: true, sfx: true };
  try { Object.assign(state, JSON.parse(localStorage.getItem('pb_audio') || '{}')); } catch (e) { /* ignore */ }

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = state.music ? 0.22 : 0; musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = state.sfx ? 0.6 : 0; sfxGain.connect(master);
    startMusic();
  }

  function save() { try { localStorage.setItem('pb_audio', JSON.stringify(state)); } catch (e) { /* ignore */ } }

  // Sons doux : attaque progressive (pas de « clic »), ondes sinusoïdales/triangle, bruit filtré et très discret
  function tone(freq, t, dur, { type = 'sine', vol = 0.12, slide = 0, dest = sfxGain } = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(t, dur, vol = 0.05, freq = 900, type = 'lowpass') {
    const len = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const s = ctx.createBufferSource(); s.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(sfxGain); s.start(t);
  }

  const sfx = {
    click: (t) => tone(720, t, 0.07, { vol: 0.07 }),
    shoot: (t) => { tone(420, t, 0.15, { vol: 0.13, slide: -230 }); noise(t, 0.1, 0.04, 800); },                 // petit « pop » rond
    hit: (t) => { tone(150, t, 0.12, { vol: 0.15, slide: -60 }); tone(300 + Math.random() * 60, t, 0.06, { type: 'triangle', vol: 0.04 }); },
    break: (t) => { tone(640 + Math.random() * 160, t, 0.16, { type: 'triangle', vol: 0.07, slide: 160 }); noise(t, 0.08, 0.03, 1400); },
    clear: (t) => [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.08, 0.16, { type: 'triangle', vol: 0.07 })),
    win: (t) => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, t + i * 0.11, 0.24, { type: 'triangle', vol: 0.1 })),
    lose: (t) => [392, 330, 262, 220].forEach((f, i) => tone(f, t + i * 0.2, 0.34, { vol: 0.1 })),
    coin: (t) => [988, 1319, 1760].forEach((f, i) => tone(f, t + i * 0.07, 0.14, { vol: 0.07 })),
    star: (t) => tone(1000, t, 0.18, { vol: 0.07, slide: 400 }),
  };

  function play(name) {
    if (!ctx || !state.sfx) return;
    sfx[name] && sfx[name](ctx.currentTime);
  }

  // --- musique : boucle de 8 mesures en do majeur, basse + arpège + mélodie ---
  const N = { C3: 130.8, D3: 146.8, E3: 164.8, F3: 174.6, G3: 196, A3: 220, C4: 261.6, D4: 293.7, E4: 329.6, F4: 349.2, G4: 392, A4: 440, B4: 493.9, C5: 523.3, D5: 587.3, E5: 659.3, G5: 784 };
  const chords = [['C3', 'E4', 'G4'], ['A3', 'C4', 'E4'], ['F3', 'A3', 'C4'], ['G3', 'D4', 'B4']];
  const melody = ['E5', 'D5', 'C5', 'D5', 'E5', 'E5', 'E5', null, 'D5', 'D5', 'D5', null, 'E5', 'G5', 'G5', null,
    'E5', 'D5', 'C5', 'D5', 'E5', 'E5', 'E5', 'E5', 'D5', 'D5', 'E5', 'D5', 'C5', null, null, null];
  const STEP = 0.2; // durée d'un pas (croche)
  let nextTime = 0, step = 0, timer = null;

  function schedule() {
    while (nextTime < ctx.currentTime + 0.6) {
      const chord = chords[Math.floor(step / 8) % chords.length];
      const t = nextTime;
      if (step % 8 === 0) tone(N[chord[0]], t, STEP * 3.5, { type: 'triangle', vol: 0.5, dest: musicGain });
      tone(N[chord[step % 3]], t, STEP * 0.9, { type: 'square', vol: 0.12, dest: musicGain });
      const m = melody[step % melody.length];
      if (m && step % 2 === 0) tone(N[m], t, STEP * 1.6, { type: 'triangle', vol: 0.28, dest: musicGain });
      nextTime += STEP; step++;
    }
  }

  function startMusic() {
    if (timer) return;
    nextTime = ctx.currentTime + 0.1;
    timer = setInterval(schedule, 150);
  }

  return {
    init, play,
    get music() { return state.music; }, get sfx() { return state.sfx; },
    setMusic(on) { state.music = on; save(); if (musicGain) musicGain.gain.setTargetAtTime(on ? 0.22 : 0, ctx.currentTime, 0.05); },
    setSfx(on) { state.sfx = on; save(); if (sfxGain) sfxGain.gain.setTargetAtTime(on ? 0.6 : 0, ctx.currentTime, 0.05); },
  };
})();
