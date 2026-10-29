// Interface : splash, accueil, niveaux, fenêtres, résultat, tutoriel, entrées joueur. Relie Game, Storage et Audio.
(() => {
  const $ = (id) => document.getElementById(id);
  const stage = $('stage');
  let TOTAL_LEVELS = 200;       // mis à jour depuis levels/index.json
  let meta = null;              // { techs, themes, levels }
  let currentLevel = 1;
  let levelData = null;
  const levelCache = new Map();

  // Avatar = icône d'utilisateur ; le joueur choisit seulement la couleur du fond
  const AVATAR_BG = ['linear-gradient(#9fe6ff, #3a6bff)', 'linear-gradient(#ff9ad6, #e0278f)', 'linear-gradient(#8bff6a, #159a2a)', 'linear-gradient(#ffe46b, #f59a00)',
    'linear-gradient(#c9a3ff, #6a2cd8)', 'linear-gradient(#ff8a8a, #d4202a)', 'linear-gradient(#7ef0e0, #0f9a95)', 'linear-gradient(#b0b8d8, #4a4f80)'];
  const USER_SVG = '<svg viewBox="0 0 24 24" width="62%" height="62%" fill="#fff" style="filter:drop-shadow(0 2px 0 rgba(28,10,66,.45))" aria-hidden="true"><circle cx="12" cy="8" r="4.3"/><path d="M3.6 21.2c0-4.7 3.8-7.8 8.4-7.8s8.4 3.1 8.4 7.8z"/></svg>';
  function applyAvatar(el, i) { el.innerHTML = USER_SVG; el.parentElement.style.background = AVATAR_BG[i] || AVATAR_BG[0]; }
  const THEME_NAMES = { meadow: '🌳 Prairie', night: '🌙 Nuit étoilée', sunset: '🌅 Coucher de soleil', snow: '❄️ Neige', desert: '🏜️ Désert', ocean: '🌊 Océan', candy: '🍭 Bonbons', forest: '🌲 Forêt', space: '🪐 Espace', autumn: '🍂 Automne', volcano: '🌋 Volcan', neon: '🌆 Ville néon' };
  const POWER_UNLOCK = { triple: 3, super: 10 };               // niveau d'apparition des bonus
  const store = {
    get(k, d = '') { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
  };
  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // --- plein écran : la scène épouse toute la fenêtre (téléphone, tablette, ordinateur ; portrait ou paysage) ---
  function fit() {
    const r = Game.fit(innerWidth, innerHeight);
    stage.style.width = r.W + 'px'; stage.style.height = r.H + 'px';
    stage.style.setProperty('--s', r.scale);
    stage.style.setProperty('--hk', Math.max(r.W / 540, r.H / 960));
    stage.classList.toggle('wide', r.W >= 760);
    stage.classList.toggle('short', r.H < 820);
  }
  addEventListener('resize', fit); addEventListener('orientationchange', () => setTimeout(fit, 150)); fit();

  function toggleFullscreen() {
    const d = document, el = d.documentElement;
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else if (el.requestFullscreen || el.webkitRequestFullscreen) (el.requestFullscreen || el.webkitRequestFullscreen).call(el).catch(() => {});
  }

  function show(name) { document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name)); }
  const openModal = (id) => $(id).classList.remove('hidden');
  const closeModal = (id) => $(id).classList.add('hidden');
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { Audio.play('click'); closeModal(b.dataset.close); }));
  ['modal-level', 'modal-settings', 'modal-profile', 'leaderboard'].forEach((id) => $(id).addEventListener('pointerdown', (e) => { if (e.target === $(id)) closeModal(id); }));

  const techByKey = (k) => meta.techs.find((t) => t.key === k);
  const getLevel = async (n) => {
    if (!levelCache.has(n)) levelCache.set(n, fetch('levels/' + meta.levels[n - 1].file).then((r) => r.json()));
    return levelCache.get(n);
  };

  // ============================== démarrage : splash -> conditions -> joueur -> accueil ==============================
  async function boot() {
    meta = await (await fetch('levels/index.json')).json();
    TOTAL_LEVELS = meta.levels.length;
    await Game.loadTechs(meta.techs);
    $('name-input').value = Storage.lastName();
  }
  const ready = boot();
  const splashDelay = new Promise((r) => setTimeout(r, 1700));

  async function route() {
    await ready; await splashDelay;
    if (!store.get('pb_terms')) { openModal('modal-terms'); return; }       // première ouverture : conditions à accepter
    afterTerms();
  }
  async function afterTerms() {
    const last = Storage.lastName();
    if (last) { await Storage.login(last); openHome(); } else show('name');
  }

  $('btn-accept').onclick = () => { Audio.init(); Audio.play('click'); store.set('pb_terms', '1'); closeModal('modal-terms'); afterTerms(); };
  const TERMS = {
    terms: '<h4>Conditions d\'utilisation</h4><p>Princess Buster est un jeu libre et gratuit, publié sous licence MIT. Tu peux y jouer, le copier et le modifier selon cette licence. Le logo « Princess Buster » reste la propriété de l\'auteur. Les logos des technologies appartiennent à leurs propriétaires respectifs.</p><p>Le jeu est fourni « tel quel », sans garantie.</p>',
    privacy: '<h4>Politique de confidentialité</h4><p>Le jeu ne collecte aucune donnée personnelle et ne contient ni publicité ni traceur. Ton nom de joueur, ton avatar et tes scores sont enregistrés uniquement sur ton appareil (base SQLite locale ou stockage du navigateur) et ne sont envoyés nulle part.</p><p>Tu peux les effacer à tout moment en désinstallant l\'application ou en vidant les données du navigateur.</p>',
  };
  function showTerms(kind) {
    $('terms-detail').innerHTML = TERMS[kind]; $('terms-detail').classList.remove('hidden'); $('terms-welcome').classList.add('hidden');
    $('btn-accept').classList.add('hidden'); $('btn-terms-back').classList.remove('hidden');
    openModal('modal-terms');
  }
  $('link-terms').onclick = (e) => { e.preventDefault(); showTerms('terms'); };
  $('link-privacy').onclick = (e) => { e.preventDefault(); showTerms('privacy'); };
  $('btn-terms').onclick = (e) => { e.preventDefault(); closeModal('modal-settings'); showTerms('privacy'); };
  $('btn-terms-back').onclick = () => {
    $('terms-detail').classList.add('hidden'); $('terms-welcome').classList.remove('hidden');
    $('btn-terms-back').classList.add('hidden'); $('btn-accept').classList.remove('hidden');
    if (store.get('pb_terms')) closeModal('modal-terms');
  };

  $('name-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    Audio.init(); Audio.play('click');
    const name = $('name-input').value.trim();
    if (!name) return;
    await ready;
    await Storage.login(name);
    openHome();
  });

  // ============================== accueil ==============================
  const avatarOf = () => parseInt(store.get('pb_avatar_' + (Storage.player ? Storage.player.name.toLowerCase() : ''), '0'), 10) || 0;
  const nextLevelToPlay = () => { for (let n = 1; n <= TOTAL_LEVELS; n++) { const p = Storage.progressOf(n); if (!(p && p.completed)) return n; } return TOTAL_LEVELS; };

  async function openHome() {
    Game.stop();
    const p = Storage.player, next = nextLevelToPlay();
    applyAvatar($('home-avatar'), avatarOf());
    $('home-name').textContent = p.name;
    $('home-score').textContent = Storage.totalScore();
    $('home-level').textContent = next;
    show('home');
    // petite pyramide de cubes colorés (logos blancs) + tuiles qui flottent
    const lvl = await getLevel(next), pool = lvl.techs.slice(-8);
    const pick = (i) => techByKey(pool[i % pool.length]);
    const cube = (cls, t, style) => { const col = Game.techColors(t.key); return `<div class="${cls}" style="--c1:${col.c1};--c2:${col.c2};${style}"><img src="${Game.whiteURL(t.key)}" alt=""></div>`; };
    $('mini-stack').innerHTML = [1, 2, 3].map((n, r) => `<div class="mr">${Array.from({ length: n }, (_, c) => cube('mc', pick(r * 3 + c), `--d:${(r + c) * 0.25}s`)).join('')}</div>`).join('');
    const spots = [[52, 120], [284, 128], [84, 12], [250, 6]];
    $('floaters').innerHTML = spots.map(([x, y], i) => cube('fl', pick(i + 2), `left:${x}px;top:${y}px;--d:${i * 0.7}s`)).join('');
    // progression des 10 niveaux en cours + niveau de difficulté du bouton Jouer
    const done = ((next - 1) % 10);
    $('home-bar').style.width = (done * 10) + '%'; $('home-bar-text').textContent = `${done}/10`;
    const tier = next < 20 ? ['easy', 'FACILE', '🙂'] : next < 60 ? ['normal', 'NORMAL', '😎'] : next < 120 ? ['hard', 'DIFFICILE', '😈'] : ['extreme', 'EXTRA DIFFICILE', '💀'];
    $('btn-play').className = `btn big play diff-${tier[0]}`; $('play-diff').textContent = tier[1]; $('play-ico').textContent = tier[2];
    refreshToggles();
  }
  $('btn-play').onclick = () => { Audio.init(); Audio.play('click'); openLevelModal(nextLevelToPlay()); };
  $('btn-full-home').onclick = toggleFullscreen;
  $('btn-levels').onclick = () => { Audio.play('click'); openMenu(); };
  $('btn-menu-back').onclick = () => { Audio.play('click'); openHome(); };

  // ============================== liste des niveaux ==============================
  function openMenu() {
    Game.stop();
    const p = Storage.player;
    $('player-name').textContent = p.name;
    $('total-score').textContent = Storage.totalScore();
    const grid = $('level-grid'); grid.innerHTML = '';
    let current = null;
    for (let n = 1; n <= TOTAL_LEVELS; n++) {
      if ((n - 1) % 10 === 0) {                                  // un titre par dizaine de niveaux
        const h = document.createElement('div');
        h.className = 'world'; h.textContent = `Niveaux ${n} – ${Math.min(n + 9, TOTAL_LEVELS)}`;
        grid.appendChild(h);
      }
      const prog = Storage.progressOf(n), unlocked = Storage.isUnlocked(n), info = meta.levels[n - 1];
      const tech = techByKey(info.icon) || meta.techs[0];
      const b = document.createElement('button');
      const isCurrent = unlocked && !(prog && prog.completed);
      b.className = 'level' + (prog && prog.completed ? ' done' : '') + (unlocked ? '' : ' locked') + (isCurrent ? ' current' : '');
      b.style.setProperty('--i', Math.min(n, 12));
      b.innerHTML = `<span class="num">${n}</span><img src="assets/tech/${tech.key}.svg" alt="${tech.name}" loading="lazy">` +
        (unlocked ? `<span class="best">${prog && prog.completed ? '⭐ ' + prog.bestScore : (info.newTech ? tech.name : 'À jouer')}</span>` : '<span class="lock">🔒</span>');
      b.addEventListener('click', () => { if (!unlocked) return; Audio.play('click'); openLevelModal(n); });
      grid.appendChild(b);
      if (isCurrent && !current) current = b;
    }
    show('menu');
    if (current) current.scrollIntoView({ block: 'center' });      // on arrive sur le prochain niveau à jouer
  }

  // fiche de niveau (« NIVEAU 4 »)
  let chosenBooster = null;
  document.querySelectorAll('.bst').forEach((b) => b.addEventListener('click', () => {
    if (b.classList.contains('locked')) return;
    Audio.play('click');
    chosenBooster = chosenBooster === b.dataset.b ? null : b.dataset.b;
    document.querySelectorAll('.bst').forEach((x) => x.classList.toggle('sel', x.dataset.b === chosenBooster));
  }));
  async function openLevelModal(n) {
    const lvl = await getLevel(n), prog = Storage.progressOf(n);
    $('lv-ribbon').textContent = `NIVEAU ${n}`;
    $('lv-theme').textContent = THEME_NAMES[lvl.theme] || lvl.theme;
    $('lv-balls').textContent = lvl.balls;
    $('lv-pieces').textContent = lvl.pieces.length;
    $('lv-best').textContent = prog && prog.completed ? `⭐ ${prog.bestScore}` : '–';
    const tech = lvl.newTech && techByKey(lvl.newTech);
    $('lv-tech').innerHTML = tech ? `<img src="assets/tech/${tech.key}.svg" alt=""> Nouvelle techno : <b>${tech.name}</b>` : '';
    chosenBooster = null;
    document.querySelectorAll('.bst').forEach((b) => { b.classList.remove('sel'); const locked = n < POWER_UNLOCK[b.dataset.b]; b.classList.toggle('locked', locked); b.querySelector('em').textContent = locked ? `🔒 Niv. ${POWER_UNLOCK[b.dataset.b]}` : 'Gratuit'; });
    $('btn-level-play').textContent = prog && prog.attempts && !prog.completed ? 'Réessaie' : 'Jouer';
    $('btn-level-play').onclick = () => { Audio.play('click'); closeModal('modal-level'); startLevel(n).then(() => { if (chosenBooster) Game.arm(chosenBooster); }); };
    openModal('modal-level');
  }

  // ============================== classement ==============================
  $('btn-leaderboard').onclick = async () => {
    Audio.play('click');
    const list = await Storage.leaderboard();
    $('leaderboard-list').innerHTML = list.length
      ? list.map((r) => `<li>${escapeHtml(r.name)}<span>${r.total} pts · ${r.levels} niv.</span></li>`).join('')
      : '<li>Pas encore de scores</li>';
    openModal('leaderboard');
  };

  // ============================== paramètres ==============================
  let settingsInGame = false;
  function refreshToggles() {
    $('tg-sfx').classList.toggle('off', !Audio.sfx);
    $('tg-music').classList.toggle('off', !Audio.music);
    $('tg-vibe').classList.toggle('off', store.get('pb_vibe', '1') !== '1');
  }
  $('tg-sfx').onclick = () => { Audio.setSfx(!Audio.sfx); refreshToggles(); Audio.play('click'); };
  $('tg-music').onclick = () => { Audio.init(); Audio.setMusic(!Audio.music); refreshToggles(); };
  $('tg-vibe').onclick = () => { store.set('pb_vibe', store.get('pb_vibe', '1') === '1' ? '0' : '1'); refreshToggles(); if (navigator.vibrate) navigator.vibrate(30); };
  $('tg-full').onclick = toggleFullscreen;
  $('btn-full-menu').onclick = toggleFullscreen;
  const openSettings = (inGame) => { settingsInGame = inGame; $('in-game-actions').classList.toggle('hidden', !inGame); refreshToggles(); openModal('modal-settings'); };
  $('btn-settings').onclick = () => { Audio.init(); Audio.play('click'); openSettings(false); };
  $('btn-game-settings').onclick = () => { Audio.play('click'); openSettings(true); };
  $('btn-restart').onclick = () => { Audio.play('click'); closeModal('modal-settings'); startLevel(currentLevel); };
  $('btn-exit').onclick = () => { Audio.play('click'); closeModal('modal-settings'); openHome(); };

  // ============================== profil ==============================
  function openProfile() {
    const p = Storage.player;
    applyAvatar($('prof-avatar'), avatarOf());
    $('rename-input').value = p.name;
    $('prof-score').textContent = Storage.totalScore();
    $('prof-done').textContent = p.progress.filter((r) => r.completed).length;
    $('avatars').innerHTML = AVATAR_BG.map((bg, i) => `<button type="button" data-a="${i}" class="${i === avatarOf() ? 'sel' : ''}" style="background:${bg}">${USER_SVG}</button>`).join('');
    openModal('modal-profile');
  }
  $('btn-avatar').onclick = () => { Audio.play('click'); openProfile(); };
  $('avatars').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    Audio.play('click'); store.set('pb_avatar_' + Storage.player.name.toLowerCase(), b.dataset.a);
    applyAvatar($('home-avatar'), +b.dataset.a); applyAvatar($('prof-avatar'), +b.dataset.a);
    $('avatars').querySelectorAll('button').forEach((x) => x.classList.toggle('sel', x === b));
  });
  $('rename-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('rename-input').value.trim();
    if (!name || name === Storage.player.name) return;
    Audio.play('click'); await Storage.login(name);                // un autre nom = un autre profil (créé s'il n'existe pas)
    closeModal('modal-profile'); openHome();
  });

  // ============================== niveau ==============================
  let tutoOn = false;
  async function startLevel(n) {
    currentLevel = n;
    levelData = await getLevel(n);
    $('result').classList.add('hidden'); $('panel-win').classList.add('hidden'); $('panel-lose').classList.add('hidden');
    $('hud-level').textContent = `Niveau ${n}`;
    show('game');
    Game.start(levelData, {
      sfx: (s) => Audio.play(s),
      popup: showPopup,
      vibrate: (ms) => { if (store.get('pb_vibe', '1') === '1' && navigator.vibrate) navigator.vibrate(ms); },
      status: onStatus,
      end: onEnd,
    });
    const tech = levelData.newTech && techByKey(levelData.newTech);
    const banner = $('tech-banner');
    banner.classList.add('hidden');
    if (tech) {                                                    // bandeau uniquement quand une nouvelle techno apparaît
      banner.innerHTML = `<img src="assets/tech/${tech.key}.svg" alt=""> Nouvelle techno : ${tech.name}`;
      void banner.offsetWidth; banner.classList.remove('hidden');
    }
    startTuto(n);
  }

  function onStatus({ balls, cubes, powers, armed }) {
    const ballsEl = $('hud-balls');
    if (ballsEl.textContent !== String(balls)) { const pill = ballsEl.parentElement; pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump'); }
    ballsEl.textContent = balls;
    $('hud-cubes').innerHTML = `Cubes : <b>${cubes}</b>`;
    if (tutoOn && levelData && balls < levelData.balls) endTuto();       // premier tir : le tutoriel s'efface
    for (const [name, id] of [['triple', 'pw-triple'], ['super', 'pw-super']]) {
      const b = $(id), locked = currentLevel < POWER_UNLOCK[name], used = !locked && !powers[name];
      b.classList.toggle('locked', locked); b.classList.toggle('used', used); b.classList.toggle('armed', armed === name);
      b.querySelector('em').textContent = locked ? `🔒 Niv. ${POWER_UNLOCK[name]}` : used ? 'Utilisé' : name === 'triple' ? 'Gratuit ×3' : 'Gratuit';
    }
  }
  $('pw-triple').addEventListener('pointerdown', (e) => { e.preventDefault(); if (currentLevel >= POWER_UNLOCK.triple) { Audio.init(); Audio.play('click'); Game.arm('triple'); } });
  $('pw-super').addEventListener('pointerdown', (e) => { e.preventDefault(); if (currentLevel >= POWER_UNLOCK.super) { Audio.init(); Audio.play('click'); Game.arm('super'); } });

  // tutoriel du tout premier niveau
  let tutoTimer = null;
  function startTuto(n) {
    endTuto();
    if (n !== 1 || store.get('pb_tuto') || qs.get('clean')) return;
    tutoOn = true; $('tuto').classList.remove('hidden');
    $('tuto-hand').classList.add('hidden');
    $('tuto-text').textContent = 'Faites tout tomber avant de ne plus avoir de balles !';
    tutoTimer = setTimeout(() => {
      $('tuto-text').textContent = 'Touchez pour lancer une balle !';
      const c = Game.stackCenter(), h = $('tuto-hand');
      h.style.left = c.x + 'px'; h.style.top = (c.y - 10) + 'px'; h.classList.remove('hidden');
    }, 2800);
  }
  function endTuto() { clearTimeout(tutoTimer); if (tutoOn) store.set('pb_tuto', '1'); tutoOn = false; $('tuto').classList.add('hidden'); }

  function showPopup(text, x, y) {
    const el = document.createElement('div');
    el.className = 'popup'; el.textContent = text;
    el.style.left = x + 'px'; el.style.top = y + 'px';
    $('screen-game').appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  // ============================== résultat ==============================
  async function onEnd({ won, score, ballsLeft }) {
    endTuto();
    $('result').classList.remove('hidden');
    if (won) {
      const ratio = ballsLeft / levelData.balls, stars = ratio >= 0.5 ? 3 : ratio >= 0.25 ? 2 : 1;
      const done = ((currentLevel - 1) % 10) + 1;
      $('panel-win').classList.remove('hidden');
      $('result-score').textContent = score;
      $('result-text').textContent = `${ballsLeft} balle(s) restante(s) = ${ballsLeft} point(s)`;
      $('result-stars').textContent = '';
      $('result-bar').style.width = '0'; $('result-bar-text').textContent = `${done}/10`;
      setTimeout(() => { $('result-bar').style.width = (done * 10) + '%'; }, 60);
      setTimeout(() => Audio.play('coin'), 300);
      for (let i = 0; i < stars; i++) setTimeout(() => { $('result-stars').insertAdjacentHTML('beforeend', '<span>⭐</span>'); Audio.play('star'); }, 500 + i * 300);
    } else {
      $('lose-ribbon').textContent = `NIVEAU ${currentLevel}`;
      $('panel-lose').classList.remove('hidden');
    }
    await Storage.saveResult(currentLevel, score, won);
  }
  const goNext = () => { Audio.play('click'); if (currentLevel >= TOTAL_LEVELS) openHome(); else openLevelModalAndStart(currentLevel + 1); };
  async function openLevelModalAndStart(n) { $('result').classList.add('hidden'); startLevel(n); }
  $('btn-result-next').onclick = goNext;
  $('btn-result-menu').onclick = () => { Audio.play('click'); openHome(); };
  $('btn-result-retry').onclick = () => { Audio.play('click'); startLevel(currentLevel); };
  $('btn-lose-retry').onclick = () => { Audio.play('click'); startLevel(currentLevel); };
  $('btn-lose-menu').onclick = () => { Audio.play('click'); openHome(); };

  // ============================== contrôles : glisser pour viser, relâcher pour tirer ==============================
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

  // clavier : ←/→ orienter le canon, Espace tirer, 1 = tir triple, 2 = super balle
  const keys = new Set();
  addEventListener('keydown', (e) => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    keys.add(e.key.toLowerCase());
    if (!$('screen-game').classList.contains('active')) return;
    if (e.key === ' ' || e.key === 'Enter') { Audio.init(); Game.fire(); e.preventDefault(); }
    if (e.key === '1' && currentLevel >= POWER_UNLOCK.triple) Game.arm('triple');
    if (e.key === '2' && currentLevel >= POWER_UNLOCK.super) Game.arm('super');
  });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  setInterval(() => {
    if (!$('screen-game').classList.contains('active')) return;
    if (keys.has('arrowleft') || keys.has('a') || keys.has('q')) Game.rotate(-0.02);
    if (keys.has('arrowright') || keys.has('d')) Game.rotate(0.02);
  }, 16);

  // ============================== raccourcis de développement ==============================
  // /?name=Ada  -> connexion directe · &level=8 -> niveau direct · &autoplay=1 -> robot · &clean=1 -> sans aide · &screen=menu|home
  const qs = new URLSearchParams(location.search);
  if (qs.get('clean')) stage.classList.add('clean');
  if (qs.get('name')) {
    store.set('pb_terms', '1');
    ready.then(async () => {
      await Storage.login(qs.get('name'));
      const lvl = parseInt(qs.get('level'), 10);
      if (lvl >= 1 && lvl <= TOTAL_LEVELS) { await startLevel(lvl); if (qs.get('autoplay') === 'instant') fastForward(); else if (qs.get('autoplay')) autoplay(); }
      else if (qs.get('screen') === 'menu') openMenu();
      else openHome();
    });
  } else route();

  // Démo « instantanée » : joue tout le niveau d'un coup (pour obtenir l'écran de résultat dans une capture)
  function fastForward() {
    Game._advance(500);
    for (let k = 0; k < 60; k++) {
      const d = Game._debug();
      if (d.finished || !d.cubes.length || !d.ballsLeft) break;
      const maxY = Math.max(...d.cubes.map((c) => c.position.y));
      const c = d.cubes.filter((x) => x.position.y > maxY - 30)[0];
      Game.setAimToward(c.position.x, c.position.y); Game._advance(350); Game.fire(); Game._advance(2200);
    }
    Game._advance(3500);
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
    }, qs.get('autoplay') === 'fast' ? 250 : 700);
  }

  window.PB = { startLevel, openMenu, openHome }; // pratique pour les tests
})();
