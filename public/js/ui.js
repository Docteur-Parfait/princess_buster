// Interface : écrans, navigation, entrées joueur. Relie Game, Storage et Audio.
(() => {
  const $ = (id) => document.getElementById(id);
  const TOTAL_LEVELS = 20;
  let meta = null;            // { techs, levels }
  let currentLevel = 1;
  let levelData = null;

  // --- plein écran : la scène épouse toute la fenêtre (téléphone, tablette, ordinateur ; portrait ou paysage) ---
  const stage = document.getElementById('stage');
  function fit() {
    const r = Game.fit(innerWidth, innerHeight);
    stage.style.width = r.W + 'px'; stage.style.height = r.H + 'px';
    stage.style.setProperty('--s', r.scale);
    stage.classList.toggle('wide', r.W >= 760);
    stage.classList.toggle('short', r.H < 820);
  }
  addEventListener('resize', fit); addEventListener('orientationchange', () => setTimeout(fit, 150)); fit();

  function toggleFullscreen() {
    const d = document, el = d.documentElement;
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else if (el.requestFullscreen || el.webkitRequestFullscreen) (el.requestFullscreen || el.webkitRequestFullscreen).call(el).catch(() => {});
  }
  ['btn-full', 'btn-full-menu'].forEach((id) => { const b = $(id); if (b) b.onclick = toggleFullscreen; });

  function show(name) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
  }

  const techByKey = (k) => meta.techs.find((t) => t.key === k);

  // --- démarrage ---
  async function boot() {
    meta = await (await fetch('levels/index.json')).json();
    await Game.loadTechs(meta.techs);
    $('name-input').value = Storage.lastName();
  }
  const ready = boot();

  // Raccourcis de développement : /?name=Ada&level=8&autoplay=1  (connexion directe, niveau direct, démo automatique)
  const qs = new URLSearchParams(location.search);
  if (qs.get('name')) {
    ready.then(async () => {
      await Storage.login(qs.get('name'));
      const lvl = parseInt(qs.get('level'), 10);
      if (lvl >= 1 && lvl <= TOTAL_LEVELS) { await startLevel(lvl); if (qs.get('autoplay')) autoplay(); } else openMenu();
    });
  }

  // Démo : un petit robot vise la pièce la plus basse de l'avant toutes les 0,7 s
  function autoplay() {
    const timer = setInterval(() => {
      const d = Game._debug();
      if (d.finished || !d.cubes.length) return clearInterval(timer);
      const minZ = Math.min(...d.cubes.map((c) => c.z));
      const front = d.cubes.filter((c) => c.z <= minZ + 1);
      const maxY = Math.max(...front.map((c) => c.position.y));
      const low = front.filter((c) => c.position.y > maxY - 35);
      const c = low[Math.floor(Math.random() * low.length)];
      Game.setAimToward(c.position.x, c.position.y - c.z * 0.45);
      Game.fire();
    }, 700);
  }

  $('name-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    Audio.init(); Audio.play('click');
    const name = $('name-input').value.trim();
    if (!name) return;
    await ready;
    await Storage.login(name);
    openMenu();
  });

  // --- menu des niveaux ---
  function openMenu() {
    Game.stop();
    const p = Storage.player;
    $('player-name').textContent = p.name;
    $('total-score').textContent = Storage.totalScore();
    const grid = $('level-grid'); grid.innerHTML = '';
    for (let n = 1; n <= TOTAL_LEVELS; n++) {
      const prog = Storage.progressOf(n), unlocked = Storage.isUnlocked(n);
      const tech = techByKey(meta.techs[Math.min(n, meta.techs.length - 1)].key);
      const b = document.createElement('button');
      b.className = 'level' + (prog && prog.completed ? ' done' : '') + (unlocked ? '' : ' locked') + (unlocked && !(prog && prog.completed) ? ' current' : '');
      b.style.setProperty('--i', n);
      b.innerHTML = `<span class="num">${n}</span><img src="assets/tech/${tech.key}.svg" alt="${tech.name}">` +
        (unlocked ? `<span class="best">${prog && prog.completed ? '⭐ ' + prog.bestScore : tech.name}</span>` : '<span class="lock">🔒</span>');
      b.addEventListener('click', () => { if (!unlocked) return; Audio.play('click'); startLevel(n); });
      grid.appendChild(b);
    }
    refreshAudioButtons();
    show('menu');
  }

  $('btn-change-player').onclick = () => { Audio.play('click'); show('name'); };
  $('btn-leaderboard').onclick = async () => {
    Audio.play('click');
    const list = await Storage.leaderboard();
    $('leaderboard-list').innerHTML = list.length
      ? list.map((r) => `<li>${escapeHtml(r.name)}<span>${r.total} pts · ${r.levels} niv.</span></li>`).join('')
      : '<li>Pas encore de scores (serveur hors ligne ?)</li>';
    $('leaderboard').classList.remove('hidden');
  };
  $('btn-close-lb').onclick = () => $('leaderboard').classList.add('hidden');
  const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // --- audio ---
  function refreshAudioButtons() {
    ['btn-music', 'btn-music-menu'].forEach((id) => $(id).classList.toggle('off', !Audio.music));
    ['btn-sfx', 'btn-sfx-menu'].forEach((id) => $(id).classList.toggle('off', !Audio.sfx));
  }
  const toggleMusic = () => { Audio.setMusic(!Audio.music); refreshAudioButtons(); };
  const toggleSfx = () => { Audio.setSfx(!Audio.sfx); refreshAudioButtons(); Audio.play('click'); };
  $('btn-music').onclick = $('btn-music-menu').onclick = toggleMusic;
  $('btn-sfx').onclick = $('btn-sfx-menu').onclick = toggleSfx;

  // --- niveau ---
  async function startLevel(n) {
    currentLevel = n;
    const file = String(n).padStart(2, '0');
    levelData = await (await fetch(`levels/level${file}.json`)).json();
    $('result').classList.add('hidden');
    $('hud-level').textContent = `Niveau ${n}`;
    show('game');
    Game.start(levelData, {
      sfx: (s) => Audio.play(s),
      popup: showPopup,
      vibrate: (ms) => { if (Audio.sfx && navigator.vibrate) navigator.vibrate(ms); },
      status: ({ balls, cubes }) => {
        const ballsEl = $('hud-balls');
        if (ballsEl.textContent !== String(balls)) { const pill = ballsEl.parentElement; pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump'); }
        ballsEl.textContent = balls;
        $('hud-cubes').innerHTML = `Cubes : <b>${cubes}</b>`;
      },
      end: onEnd,
    });
    const tech = techByKey(levelData.newTech);
    const banner = $('tech-banner');
    banner.innerHTML = `<img src="assets/tech/${tech.key}.svg" alt=""> Nouvelle techno : ${tech.name}`;
    banner.classList.add('hidden'); void banner.offsetWidth; banner.classList.remove('hidden');
  }

  function showPopup(text, x, y) {
    const el = document.createElement('div');
    el.className = 'popup'; el.textContent = text;
    el.style.left = x + 'px'; el.style.top = y + 'px';
    $('screen-game').appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  async function onEnd({ won, score, ballsLeft }) {
    const total = levelData.balls;
    const ratio = ballsLeft / total;
    const stars = won ? (ratio >= 0.5 ? 3 : ratio >= 0.25 ? 2 : 1) : 0;
    $('result-title').textContent = won ? '🎉 Niveau réussi !' : '💥 Plus de balles !';
    $('result-text').textContent = won ? `${ballsLeft} balle(s) restante(s) = ${ballsLeft} point(s)` : 'Il reste des cubes sur la table…';
    $('result-stars').textContent = '';
    $('result-score').textContent = score;
    $('btn-result-next').classList.toggle('hidden', !won || currentLevel >= TOTAL_LEVELS);
    $('result').classList.remove('hidden');
    for (let i = 0; i < stars; i++) setTimeout(() => { $('result-stars').insertAdjacentHTML('beforeend', '<span>⭐</span>'); Audio.play('star'); }, 350 + i * 300);
    await Storage.saveResult(currentLevel, score, won);
  }

  $('btn-result-menu').onclick = () => { Audio.play('click'); openMenu(); };
  $('btn-result-retry').onclick = () => { Audio.play('click'); startLevel(currentLevel); };
  $('btn-result-next').onclick = () => { Audio.play('click'); startLevel(currentLevel + 1); };
  $('btn-restart').onclick = () => { Audio.play('click'); startLevel(currentLevel); };
  $('btn-exit').onclick = () => { Audio.play('click'); openMenu(); };

  // --- contrôles : glisser pour viser, relâcher pour tirer ---
  const canvas = $('canvas');
  const toLogical = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * Game.W, y: (e.clientY - r.top) / r.height * Game.H };
  };
  canvas.addEventListener('pointerdown', (e) => {
    Audio.init();
    canvas.setPointerCapture(e.pointerId);
    Game.aiming = true; const p = toLogical(e); Game.setAimToward(p.x, p.y);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!Game.aiming) return;
    const p = toLogical(e); Game.setAimToward(p.x, p.y);
  });
  const release = (e) => {
    if (!Game.aiming) return;
    Game.aiming = false;
    const p = toLogical(e);
    if (p.y < Game.cannonY - 40) { Game.setAimToward(p.x, p.y); Game.fire(); }   // glisser vers le bas = annuler
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', () => { Game.aiming = false; });

  // clavier : ←/→ orienter le canon, Espace tirer
  const keys = new Set();
  addEventListener('keydown', (e) => {
    keys.add(e.key.toLowerCase());
    if (e.key === ' ' || e.key === 'Enter') { Audio.init(); Game.fire(); e.preventDefault(); }
  });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  setInterval(() => {
    if (!$('screen-game').classList.contains('active') || document.activeElement === $('name-input')) return;
    if (keys.has('arrowleft') || keys.has('a') || keys.has('q')) Game.rotate(-0.02);
    if (keys.has('arrowright') || keys.has('d')) Game.rotate(0.02);
  }, 16);

  window.PB = { startLevel, openMenu }; // pratique pour les tests
})();
