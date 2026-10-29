// Interface : splash, accueil, niveaux, fenêtres, résultat, tutoriel, entrées joueur. Relie Game, Storage et Audio.
(() => {
  const $ = (id) => document.getElementById(id);
  const stage = $('stage');
  let TOTAL_LEVELS = 200;       // mis à jour depuis levels/index.json
  let meta = null;              // { techs, themes, levels }
  let currentLevel = 1;
  let levelData = null;
  const levelCache = new Map();

  // Avatars : portraits humains dessinés (SVG généré) et animés (clignement des yeux, respiration) ; peau, coiffure, regard et accessoires variés
  const AVATARS = [
    { skin: '#f6d3b3', hair: '#3b2414', style: 'short', shirt: '#3a6bff', bg: ['#9fe6ff', '#4a7bff'], eye: '#4a2f1a', mouth: 'smile', necklace: false },
    { skin: '#8d5524', hair: '#1c1410', style: 'afro', shirt: '#ff3fa4', bg: ['#ffd6f0', '#ff6fc0'], glasses: true, eye: '#2a1a10', mouth: 'smile', lashes: true, earring: true },
    { skin: '#e0ac82', hair: '#1c1410', style: 'long', shirt: '#2fc92b', bg: ['#c8ffb0', '#4fd23a'], eye: '#3a2418', mouth: 'soft', lashes: true, necklace: true },
    { skin: '#5c3a21', hair: '#0e0a08', style: 'braids', shirt: '#ffb300', bg: ['#fff0a0', '#ffb300'], eye: '#1a0e08', mouth: 'smile', lashes: true, earring: true },
    { skin: '#ffe0bd', hair: '#c9a24a', style: 'ponytail', shirt: '#7a2cff', bg: ['#d9c2ff', '#8a4cff'], eye: '#3b86d8', mouth: 'smile', lashes: true, freckles: true },
    { skin: '#c68642', hair: '#2b1a12', style: 'bald', shirt: '#e32636', bg: ['#ffc2c8', '#ff6a75'], beard: true, eye: '#2a1a10', mouth: 'smirk' },
    { skin: '#f6d3b3', hair: '#b5452a', style: 'curly', shirt: '#0f9a95', bg: ['#b8fff4', '#27c9c0'], glasses: true, eye: '#3f8a4a', mouth: 'smile', freckles: true },
    { skin: '#8d5524', hair: '#2b1a12', style: 'hijab', shirt: '#4a4f80', scarf: '#ff8ad0', bg: ['#e8ecff', '#9aa6e8'], eye: '#2a1a10', mouth: 'soft', lashes: true },
    { skin: '#e0ac82', hair: '#1c1410', style: 'cap', shirt: '#ff7a1a', cap: '#2a50d8', bg: ['#ffe0b8', '#ffa040'], eye: '#3a2418', mouth: 'smirk' },
    { skin: '#5c3a21', hair: '#e8e8f0', style: 'short', shirt: '#6a2cd8', bg: ['#e6d6ff', '#a47cf0'], beard: true, glasses: true, eye: '#1a0e08', mouth: 'smile' },
    { skin: '#ffe0bd', hair: '#1d3b8a', style: 'bun', shirt: '#d4202a', bg: ['#c8dcff', '#5a8cff'], eye: '#3a2418', mouth: 'smile', lashes: true, earring: true },
    { skin: '#c68642', hair: '#5a3a1a', style: 'long', shirt: '#159a2a', bg: ['#d6ffd0', '#58d060'], glasses: true, eye: '#4a2f1a', mouth: 'soft', lashes: true, necklace: true },
  ];
  let avUid = 0;
  function avatarSVG(a, idx = 0) {
    const id = 'av' + (++avUid);
    const mix = (c, k) => { const n = parseInt(c.slice(1), 16), f = (v) => Math.max(0, Math.min(255, Math.round(k >= 1 ? v * k : v + (255 - v) * (1 - k)))); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };
    const dark = (c, k) => mix(c, k), light = (c, k) => mix(c, 1 - k);
    const skinL = light(a.skin, 0.22), skinD = dark(a.skin, 0.84), skinDD = dark(a.skin, 0.66);
    const hairL = light(a.hair, 0.28), hairD = dark(a.hair, 0.7), shirtD = dark(a.shirt, 0.72), shirtL = light(a.shirt, 0.25);
    const delay = ((idx * 0.37) % 3).toFixed(2);
    let back = '', front = '';
    const shine = (d) => `<path d="${d}" fill="none" stroke="${hairL}" stroke-width="1.8" stroke-linecap="round" opacity=".55"/>`;
    switch (a.style) {
      case 'long': back = `<path d="M25 46 Q22 17 50 17 Q78 17 75 46 L79 86 Q64 78 62 62 L38 62 Q36 78 21 86Z" fill="${a.hair}"/>`; front = `<path d="M29 44 Q31 22 50 22 Q69 22 71 44 Q63 31 53 29 Q44 33 29 44Z" fill="${a.hair}"/>${shine('M38 28 Q50 22 62 28')}`; break;
      case 'afro': back = `<circle cx="50" cy="36" r="31" fill="${a.hair}"/><circle cx="30" cy="48" r="8" fill="${a.hair}"/><circle cx="70" cy="48" r="8" fill="${a.hair}"/>`; front = `<path d="M31 41 Q34 27 50 27 Q66 27 69 41 Q58 34 50 34 Q42 34 31 41Z" fill="${a.hair}"/>${shine('M36 22 Q50 14 64 22')}`; break;
      case 'braids': back = `<path d="M26 44 Q24 19 50 19 Q76 19 74 44 L77 90 L68 90 L67 56 L33 56 L32 90 L23 90Z" fill="${a.hair}"/><g stroke="${hairD}" stroke-width="1.6" stroke-linecap="round"><path d="M27 62l5 2M27 70l5 2M27 78l5 2M27 86l5 2M73 62l-5 2M73 70l-5 2M73 78l-5 2M73 86l-5 2"/></g>`; front = `<path d="M29 43 Q31 24 50 24 Q69 24 71 43 Q58 32 50 32 Q42 32 29 43Z" fill="${a.hair}"/>${shine('M37 26 Q50 20 63 26')}`; break;
      case 'ponytail': back = `<path d="M66 34 Q90 32 85 64 Q83 77 73 82 Q80 64 71 50Z" fill="${a.hair}"/>`; front = `<path d="M28 45 Q28 20 50 20 Q72 20 72 45 Q65 32 50 32 Q35 32 28 45Z" fill="${a.hair}"/>${shine('M36 25 Q50 18 64 25')}`; break;
      case 'bun': back = `<circle cx="50" cy="14" r="9.5" fill="${a.hair}"/><circle cx="47" cy="12" r="3" fill="${hairL}" opacity=".4"/>`; front = `<path d="M28 45 Q28 20 50 20 Q72 20 72 45 Q65 32 50 32 Q35 32 28 45Z" fill="${a.hair}"/>${shine('M36 25 Q50 18 64 25')}`; break;
      case 'curly': front = [[33, 27], [43, 21], [57, 21], [67, 27], [29, 38], [71, 38], [39, 28], [61, 28], [50, 24]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9.5" fill="${a.hair}"/>`).join('') + `<circle cx="42" cy="22" r="3" fill="${hairL}" opacity=".35"/>`; break;
      case 'hijab': back = `<path d="M24 52 Q21 14 50 14 Q79 14 76 52 Q77 78 62 90 L38 90 Q23 78 24 52Z" fill="${a.scarf}"/><path d="M24 52 Q23 28 36 20 Q30 40 33 64 Q27 74 38 90 Q23 78 24 52Z" fill="${dark(a.scarf, 0.82)}" opacity=".5"/>`; break;
      case 'cap': front = `<path d="M29 40 Q29 17 50 17 Q71 17 71 40Z" fill="${a.cap}"/><path d="M25 40 H79 Q82 45 74 45 H28Z" fill="${dark(a.cap, 0.78)}"/><path d="M38 21 Q50 15 62 21" fill="none" stroke="${light(a.cap, 0.35)}" stroke-width="2" stroke-linecap="round" opacity=".6"/>`; break;
      case 'bald': front = `<path d="M33 30 Q50 22 67 30" fill="none" stroke="${skinL}" stroke-width="3" stroke-linecap="round" opacity=".5"/>`; break;
      default: front = `<path d="M29 47 Q26 19 50 19 Q74 19 71 47 Q67 31 50 31 Q33 31 29 47Z" fill="${a.hair}"/>${shine('M36 24 Q50 17 64 24')}`;
    }
    const hijab = a.style === 'hijab';
    const faceD = hijab ? 'M33 47 Q33 29 50 29 Q67 29 67 47 Q67 66 50 70 Q33 66 33 47Z' : 'M30 45 Q30 23 50 23 Q70 23 70 45 Q70 67 50 71 Q30 67 30 45Z';
    const ears = hijab ? '' : `<circle cx="30.2" cy="48" r="4.6" fill="${a.skin}"/><circle cx="30.4" cy="48.4" r="2" fill="${skinD}" opacity=".5"/><circle cx="69.8" cy="48" r="4.6" fill="${a.skin}"/><circle cx="69.6" cy="48.4" r="2" fill="${skinD}" opacity=".5"/>`;
    const eye = (cx, side) => `<g class="eye" style="--d:${delay}s"><ellipse cx="${cx}" cy="46.5" rx="4.1" ry="3.4" fill="#fff"/><circle cx="${cx}" cy="46.7" r="2.45" fill="${a.eye}"/><circle cx="${cx}" cy="46.7" r="1.15" fill="#120a0a"/><circle cx="${cx + 0.9}" cy="45.7" r=".8" fill="#fff"/></g>`
      + `<path d="M${cx - 4.6} 46 Q${cx} ${42.2} ${cx + 4.6} 46" fill="none" stroke="#2a1a3a" stroke-width="1.5" stroke-linecap="round"/>`
      + (a.lashes ? `<path d="M${cx + side * 4.4} 45.4 l${side * 1.7} -1.4 M${cx + side * 3.4} 44.3 l${side * 1.3} -1.7" stroke="#2a1a3a" stroke-width="1.1" stroke-linecap="round"/>` : '');
    const brow = (x1, x2, side) => `<path d="M${x1} ${side < 0 ? 39 : 38.2} Q${(x1 + x2) / 2} ${side < 0 ? 35.8 : 35.8} ${x2} ${side < 0 ? 38.2 : 39}" fill="none" stroke="${hairD}" stroke-width="2.5" stroke-linecap="round"/>`;
    const mouth = { smile: `<path d="M42.5 58 Q50 66 57.5 58 Q50 61.2 42.5 58Z" fill="#fff" stroke="#9a3a3a" stroke-width="1.5" stroke-linejoin="round"/><path d="M45 61.5 Q50 64 55 61.5" fill="#e86a7a" opacity=".55"/>`, soft: `<path d="M43.5 59 Q50 64.5 56.5 59" fill="none" stroke="#b04a5a" stroke-width="2.2" stroke-linecap="round"/>`, smirk: `<path d="M43.5 60 Q50.5 63 57.5 57.5" fill="none" stroke="#9a3a3a" stroke-width="2.2" stroke-linecap="round"/>` }[a.mouth || 'smile'];
    const beard = a.beard ? `<path d="M30.5 49 Q30 77 50 77 Q70 77 69.5 49 Q64 66 50 66 Q36 66 30.5 49Z" fill="${a.hair}"/><path d="M40 63 Q50 60 60 63 Q50 65.5 40 63Z" fill="${hairD}" opacity=".6"/>` : '';
    const glasses = a.glasses ? `<g fill="rgba(255,255,255,.12)" stroke="#2a1a3a" stroke-width="2"><rect x="34" y="40.5" width="13" height="11" rx="4.5"/><rect x="53" y="40.5" width="13" height="11" rx="4.5"/></g><path d="M47 45.5h6M34 45h-3M66 45h3" stroke="#2a1a3a" stroke-width="1.8" fill="none"/><path d="M36 43l4-1" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity=".7"/>` : '';
    const freckles = a.freckles ? `<g fill="${skinDD}" opacity=".55"><circle cx="36.5" cy="53" r=".9"/><circle cx="39.5" cy="54.5" r=".9"/><circle cx="35" cy="56" r=".8"/><circle cx="63.5" cy="53" r=".9"/><circle cx="60.5" cy="54.5" r=".9"/><circle cx="65" cy="56" r=".8"/></g>` : '';
    const earring = a.earring && !hijab ? `<circle cx="29.5" cy="54.5" r="2" fill="#ffd23f" stroke="#c97900" stroke-width=".6"/><circle cx="70.5" cy="54.5" r="2" fill="#ffd23f" stroke="#c97900" stroke-width=".6"/>` : '';
    const necklace = a.necklace ? `<path d="M40.5 77 Q50 90 59.5 77" fill="none" stroke="#ffd23f" stroke-width="1.6"/><circle cx="50" cy="87" r="2.6" fill="#ffd23f" stroke="#c97900" stroke-width=".6"/>` : '';
    return `<svg viewBox="9 9 82 82" width="100%" height="100%" aria-hidden="true"><defs>
        <radialGradient id="${id}f" cx=".4" cy=".34" r=".8"><stop offset="0" stop-color="${skinL}"/><stop offset=".55" stop-color="${a.skin}"/><stop offset="1" stop-color="${skinD}"/></radialGradient>
        <linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shirtL}"/><stop offset="1" stop-color="${a.shirt}"/></linearGradient></defs>
      <path d="M13 100 Q13 75 50 75 Q87 75 87 100Z" fill="url(#${id}s)"/><path d="M50 75 Q87 75 87 100 H64 Q72 86 50 75Z" fill="${shirtD}" opacity=".28"/>
      <path d="M40 75.5 L50 89 L60 75.5 Q50 73 40 75.5Z" fill="${skinD}"/><path d="M40 75.5 L50 89 L60 75.5" fill="none" stroke="${shirtD}" stroke-width="2" stroke-linejoin="round"/>${necklace}
      <g class="bob" style="--d:${delay}s">${back}
        <path d="M43.5 60 H56.5 V77 Q50 82 43.5 77Z" fill="${skinD}"/><ellipse cx="50" cy="70.5" rx="13" ry="3.4" fill="${skinDD}" opacity=".4"/>
        ${ears}<path d="${faceD}" fill="url(#${id}f)"/>
        <circle cx="36" cy="55" r="4" fill="#ff7a8a" opacity=".3"/><circle cx="64" cy="55" r="4" fill="#ff7a8a" opacity=".3"/>${freckles}
        <path d="M50 47.5 Q47.4 53.6 51.3 54.8" fill="none" stroke="${skinDD}" stroke-width="1.6" stroke-linecap="round"/>
        ${beard}${mouth}${eye(41.5, -1)}${eye(58.5, 1)}${brow(36.5, 46.5, -1)}${brow(53.5, 63.5, 1)}${glasses}${earring}${front}</g></svg>`;
  }
  function applyAvatar(el, i) { const a = AVATARS[i] || AVATARS[0]; el.innerHTML = avatarSVG(a, i); el.parentElement.style.background = `linear-gradient(${a.bg[0]}, ${a.bg[1]})`; }
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
    $('avatars').innerHTML = AVATARS.map((a, i) => `<button type="button" data-a="${i}" class="${i === avatarOf() ? 'sel' : ''}" style="background:linear-gradient(${a.bg[0]}, ${a.bg[1]})">${avatarSVG(a, i)}</button>`).join('');
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
  // /?name=Ada  -> connexion directe · &level=8 -> niveau direct · &autoplay=1 -> robot · &clean=1 -> sans aide · &screen=menu|home|profile
  const qs = new URLSearchParams(location.search);
  if (qs.get('clean')) stage.classList.add('clean');
  if (qs.get('name')) {
    store.set('pb_terms', '1');
    ready.then(async () => {
      await Storage.login(qs.get('name'));
      const lvl = parseInt(qs.get('level'), 10);
      if (lvl >= 1 && lvl <= TOTAL_LEVELS) { await startLevel(lvl); if (qs.get('autoplay') === 'instant') fastForward(); else if (qs.get('autoplay')) autoplay(); }
      else if (qs.get('screen') === 'menu') openMenu();
      else if (qs.get('screen') === 'profile') { await openHome(); openProfile(); }
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
