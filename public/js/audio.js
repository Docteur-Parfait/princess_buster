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
    sfxGain = ctx.createGain(); sfxGain.gain.value = state.sfx ? 0.7 : 0; sfxGain.connect(master);
    startMusic();
  }

  function save() { try { localStorage.setItem('pb_audio', JSON.stringify(state)); } catch (e) { /* ignore */ } }

  function tone(freq, t, dur, { type = 'square', vol = 0.3, slide = 0, dest = sfxGain } = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(t, dur, vol = 0.4, hp = 800) {
    const len = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ctx.createBufferSource(); s.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = ctx.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(sfxGain); s.start(t);
  }

  const sfx = {
    click: (t) => tone(660, t, 0.08, { vol: 0.2 }),
    shoot: (t) => { tone(220, t, 0.25, { type: 'sawtooth', vol: 0.35, slide: -150 }); noise(t, 0.18, 0.35, 400); },
    hit: (t) => { tone(160 + Math.random() * 60, t, 0.1, { type: 'triangle', vol: 0.35, slide: -80 }); },
    break: (t) => { noise(t, 0.25, 0.35, 1200); tone(520 + Math.random() * 200, t, 0.12, { vol: 0.15, slide: 300 }); },
    clear: (t) => [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.08, 0.15, { vol: 0.18 })),
    win: (t) => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, t + i * 0.11, 0.22, { vol: 0.22, type: 'triangle' })),
    lose: (t) => [392, 330, 262, 196].forEach((f, i) => tone(f, t + i * 0.18, 0.3, { vol: 0.25, type: 'sawtooth' })),
    coin: (t) => [988, 1319, 1760].forEach((f, i) => tone(f, t + i * 0.07, 0.12, { vol: 0.16, type: 'square' })),
    star: (t) => tone(1200, t, 0.15, { vol: 0.15, slide: 500 }),
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
    setSfx(on) { state.sfx = on; save(); if (sfxGain) sfxGain.gain.setTargetAtTime(on ? 0.7 : 0, ctx.currentTime, 0.05); },
  };
})();
