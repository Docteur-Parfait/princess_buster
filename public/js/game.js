// Moteur du jeu : physique (Matter.js) + profondeur simulée + rendu canvas. Aucune dépendance vers l'interface (voir ui.js).
//
// Vue « de derrière le canon » : la balle part vers le fond de l'écran. Quand elle touche une pièce, celle-ci est
// poussée en PROFONDEUR (axe z) : elle glisse sur la table puis tombe derrière. Les pièces qui dépassent du plateau
// à gauche/droite tombent normalement (physique 2D Matter).
const Game = (() => {
  const { Engine, Bodies, Body, Composite, Sleeping } = Matter;

  let W = 540, H = 960;               // taille logique : s'adapte à tout l'écran (voir fit)
  let CUBE = 60;                      // taille d'une case : réduite pour les grandes piles (voir start)
  let PLATFORM_Y = 560;               // surface avant de la table
  const PLATFORM_H = 18;
  let CANNON_Y = 954;                 // pivot du canon (bas de l'écran)
  let MUZZLE = 178, cs = 1;           // distance pivot -> bouche ; cs = échelle du canon (réduit sur les écrans bas)
  const BALL_R = 15, BALL_SPEED = 30;
  const MAX_ANGLE = 62 * Math.PI / 180;
  const FIRE_COOLDOWN = 320;
  const DEPTH = 110;                  // profondeur de la table : au-delà, la pièce tombe derrière
  const LAYER_Z = 45;                 // écart de profondeur entre deux rangées de pièces (une pièce « derrière » une autre)
  const THICK = 40;                   // épaisseur d'une pièce en profondeur
  const DEPTH_Y = 0.45;               // décalage écran (px) par unité de profondeur
  const PUSH = 14;                    // force de poussée d'une balle (divisée par la masse de la pièce)
  const SLIDE_FRICTION = 0.94;

  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  let DPR = 2;
  let levelRows = 5, levelId = 1, lite = false;
  let powers = { triple: 1, super: 1 }, armed = null;   // bonus : 1 utilisation par niveau

  // Plein écran : la scène logique (>= 540 x 700) épouse exactement la fenêtre, en portrait comme en paysage.
  // Retourne le facteur d'échelle CSS à appliquer à la scène.
  function fit(vw, vh) {
    const scale = Math.min(vw / 540, vh / 700);
    const oldCx = W / 2, oldPy = PLATFORM_Y;
    W = vw / scale; H = vh / scale;
    DPR = Math.min(3, scale * (window.devicePixelRatio || 1));
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    layout();
    if (engine && cubes) {                  // redimensionnement en cours de partie : on déplace tout
      const dx = W / 2 - oldCx, dy = PLATFORM_Y - oldPy;
      [platform, ...cubes].forEach((b) => Body.translate(b, { x: dx, y: dy }));
      shots.forEach((s) => { s.x += dx; s.sx += dx; s.tx += dx; s.y += dy; s.sy += dy; s.ty += dy; });
      if (target) { target.x += dx; target.y += dy; }
    }
    return { scale, W, H };
  }
  function layout() {
    cannonX = W / 2;
    CANNON_Y = H - 6;
    PLATFORM_Y = Math.round(Math.min(H - 290, Math.max(400, H * 0.62)));                  // la table est tout près du canon
    cs = Math.max(0.75, Math.min(1, (H - PLATFORM_Y - 60) / 240));
    MUZZLE = 178 * cs;
  }

  let techs = {};            // key -> { name, color, img }
  let engine, platform, cubes, shots, ghosts, particles, debris;
  let platformW = 300, loopId = 0, puffs = [];
  let level = null, ballsLeft = 0, running = false, finished = false;
  let cannonX = W / 2;                     // canon fixe au centre
  let aim = 0, target = null;              // aim = angle (rad) par rapport à la verticale ; target = point visé (écran)
  let aiming = false, lastShot = 0, settleTimer = 0, shake = 0, time = 0;
  let callbacks = {};
  let acc = 0, prev = 0, flash = 0, comboCount = 0, comboTime = 0, comboX = W / 2, comboY = 400, recoil = 0;
  const PALETTE = ['#ffd23f', '#ff3fa4', '#5fd4ff', '#fff3a0'];

  // Cube de la couleur de la techno ; les couleurs très claires sont assombries pour que le logo blanc reste lisible
  function baseColor(hex) {
    const n = parseInt(hex.slice(1), 16), lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum > 0.6 ? tintColor(hex, -0.42) : lum > 0.5 ? tintColor(hex, -0.2) : hex;
  }
  // Logo en blanc : les parties colorées deviennent blanches, les parties déjà blanches deviennent transparentes (on voit la couleur du cube)
  function whiteIcon(img, invert) {
    try {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0, 128, 128);
      const d = x.getImageData(0, 0, 128, 128), p = d.data;
      for (let i = 0; i < p.length; i += 4) {
        if (!p[i + 3]) continue;
        const lum = (p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114) / 255;
        if (invert) {                                    // logo « plein » à lettres sombres (JavaScript) : fond transparent, lettres blanches
          if (lum < 0.4) { p[i] = p[i + 1] = p[i + 2] = 255; } else p[i + 3] = 0;
        } else if (p[i] > 222 && p[i + 1] > 222 && p[i + 2] > 222) p[i + 3] = 0; else { p[i] = p[i + 1] = p[i + 2] = 255; }
      }
      x.putImageData(d, 0, 0);
      return c;
    } catch (e) { return img; }
  }

  // --- chargement des logos (SVG -> blob avec taille explicite, compatible canvas partout) ---
  async function loadTechs(list) {
    await Promise.all(list.map(async (t) => {
      let svg = await (await fetch(`assets/tech/${t.key}.svg`)).text();
      if (!/<svg[^>]*\swidth=/.test(svg)) svg = svg.replace('<svg', '<svg width="128" height="128"');
      const img = new Image();
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      await new Promise((ok) => { img.onload = ok; img.onerror = ok; img.src = url; });
      const colorLogo = t.key === 'php';                                   // PHP : on garde son vrai logo (ovale violet + lettres) sur un cube violet franc
      techs[t.key] = { ...t, img, white: colorLogo ? img : whiteIcon(img, t.key === 'javascript'), base: colorLogo ? '#8b4df0' : baseColor(t.color) };
    }));
  }

  function tintColor(hex, amt) { // amt>0 éclaircit, <0 assombrit (accepte #rrggbb ou rgb(r,g,b))
    let r, g, b;
    const m = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(hex);
    if (m) { r = +m[1]; g = +m[2]; b = +m[3]; } else { const n = parseInt(hex.slice(1), 16); r = n >> 16; g = (n >> 8) & 255; b = n & 255; }
    const f = (c) => Math.max(0, Math.min(255, Math.round(amt > 0 ? c + (255 - c) * amt : c * (1 + amt))));
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }

  // Niveau -> liste de pièces {tech,col,row,w,h}. Ancien format « grid » (cubes 1x1) toujours accepté,
  // avec retombée des colonnes pour qu'aucun cube ne reste suspendu.
  function piecesOf(lvl) {
    if (lvl.pieces) return { pieces: lvl.pieces, rows: lvl.rows, cols: lvl.cols };
    const rows = lvl.grid.map((r) => r.trim().split(/\s+/));
    const cols = Math.max(...rows.map((r) => r.length)), pieces = [];
    for (let c = 0; c < cols; c++) {
      let put = rows.length - 1;
      for (let r = rows.length - 1; r >= 0; r--) if (rows[r][c] && rows[r][c] !== '.') pieces.push({ tech: rows[r][c], col: c, row: put--, w: 1, h: 1 });
    }
    return { pieces, rows: rows.length, cols };
  }

  // --- niveau ---
  function start(lvl, cb) {
    callbacks = cb || {};
    level = lvl;
    engine = Engine.create({ enableSleeping: true, positionIterations: 12, velocityIterations: 8 });
    engine.gravity.y = 1.1;
    cubes = []; shots = []; ghosts = []; particles = []; debris = []; puffs = [];
    ballsLeft = lvl.balls; lastShot = -1000; finished = false; settleTimer = 0; aiming = false; shake = 0; flash = 0; comboCount = 0;
    aim = 0; target = null; powers = { triple: 1, super: 1 }; armed = null;

    const { pieces, rows, cols } = piecesOf(lvl);
    levelRows = rows; levelId = lvl.id || 1; layout();
    themeName = THEMES[lvl.theme] ? lvl.theme : 'night'; theme = THEMES[themeName];
    const minC = Math.min(...pieces.map((p) => p.col)), maxC = Math.max(...pieces.map((p) => p.col + p.w)), span = maxC - minC;   // emprise réelle de la pile
    CUBE = Math.max(30, Math.min(72, Math.floor((PLATFORM_Y - 112) / rows), Math.floor((W - 64) / span)));   // les grandes piles rapetissent pour rester à l'écran
    lite = pieces.length > 55;                                              // beaucoup de pièces : on allège les halos
    platformW = span * CUBE + 20;                                           // table à peine plus large que la pile
    platform = Bodies.rectangle(W / 2, PLATFORM_Y + PLATFORM_H / 2, platformW, PLATFORM_H, { isStatic: true, friction: 1, restitution: 0, collisionFilter: { category: 0x0002, mask: 0x001C } });
    Composite.add(engine.world, platform);

    const x0 = W / 2 - (minC + maxC) / 2 * CUBE;                           // pile centrée sur la table
    pieces.forEach((p) => {
      const bottom = PLATFORM_Y - (rows - (p.row + p.h)) * CUBE;       // bord bas de la pièce
      const body = Bodies.rectangle(x0 + (p.col + p.w / 2) * CUBE, bottom - p.h * CUBE / 2 - 0.5, p.w * CUBE - 1.5, p.h * CUBE - 1.5, {
        chamfer: { radius: 7 }, friction: 0.5, frictionStatic: 0.8, restitution: 0.05,
        density: 0.0025 * (lvl.cubeWeight || 1), sleepThreshold: 40, slop: 0.04,
      });
      body.tech = techs[p.tech]; body.isCube = true;
      body.pw = p.w; body.ph = p.h;
      body.pmass = Math.sqrt(p.w * p.h) * (lvl.cubeWeight || 1);       // masse « utile » : racine de la surface x poids du niveau
      body.layer = p.layer || 0;                 // 0 = devant ; 1, 2 = rangées derrière
      body.z = body.layer * LAYER_Z; body.vz = 0;
      body.collisionFilter = { category: 0x0004 << body.layer, mask: 0x0002 | (0x0004 << body.layer) };   // une rangée ne heurte que sa propre rangée
      Sleeping.set(body, true);
      cubes.push(body); Composite.add(engine.world, body);
    });

    running = true; prev = performance.now(); acc = 0; time = 0;
    const id = ++loopId;
    const tick = (now) => { if (!running || id !== loopId) return; loop(now); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    emitStatus();
  }

  function stop() { running = false; }
  function emitStatus() { callbacks.status && callbacks.status({ balls: ballsLeft, cubes: cubes.length, powers: { ...powers }, armed }); }

  // bonus : « triple » = 3 balles d'un coup, « super » = balle plus puissante qui touche aussi les voisines
  function arm(name) {
    if (!running || finished || !powers[name]) return armed;
    armed = armed === name ? null : name; emitStatus(); return armed;
  }

  // --- visée ---
  const muzzle = () => ({ x: cannonX + Math.sin(aim) * MUZZLE, y: CANNON_Y - Math.cos(aim) * MUZZLE });
  const slide = (c) => c.ds || 0;                                    // glissement affiché : toujours sur 2 plans (devant / derrière), voir step()
  const visY = (c) => c.position.y - slide(c) * DEPTH_Y;       // position écran d'une pièce (tient compte de la profondeur)

  // pièce visée en (x,y), avec une petite tolérance pour le doigt
  function cubeAt(x, y, tol = 10) {
    let best = null, bd = 1e9;
    for (const c of cubes) {
      const hw = c.pw * CUBE / 2 + tol, hh = c.ph * CUBE / 2 + tol;
      const dx = Math.abs(x - c.position.x), dy = Math.abs(y - visY(c));
      if (dx <= hw && dy <= hh) {
        const d = dx + dy;
        if (!best || c.z < best.z - 1 || (Math.abs(c.z - best.z) <= 1 && d < bd)) { bd = d; best = c; }   // la pièce la plus à l'avant est touchée en premier
      }
    }
    return best;
  }

  // visée au clavier : premier cube rencontré sur la ligne de tir
  function rayTarget() {
    const m = muzzle(), dx = Math.sin(aim), dy = -Math.cos(aim);
    for (let t = 0; t < 900; t += 6) { const x = m.x + dx * t, y = m.y + dy * t; if (cubeAt(x, y, 4)) return { x, y }; }
    return { x: m.x + dx * 700, y: m.y + dy * 700 };
  }
  const currentTarget = () => target || rayTarget();

  function setAimToward(px, py) {
    const dx = px - cannonX, dy = Math.max(CANNON_Y - py, 1);
    let a = Math.atan2(dx, dy);
    if (Math.abs(a) > MAX_ANGLE) { a = Math.sign(a) * MAX_ANGLE; const d = Math.hypot(dx, dy); px = cannonX + Math.sin(a) * d; py = CANNON_Y - Math.cos(a) * d; }
    aim = a; target = { x: px, y: py };
  }
  function rotate(da) { aim = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, aim + da)); target = null; }

  // --- tir ---
  function canFire() { return running && !finished && ballsLeft > 0 && time - lastShot > FIRE_COOLDOWN; }

  function fire() {
    if (!canFire()) return;
    lastShot = time; ballsLeft--;
    const m = muzzle(), t = currentTarget();
    const mode = armed && powers[armed] > 0 ? armed : null;
    if (mode) powers[mode]--;
    armed = null;
    const targets = mode === 'triple' ? [t, { x: t.x - CUBE, y: t.y }, { x: t.x + CUBE, y: t.y }] : [t];
    for (const tg of targets) {
      const d = Math.hypot(tg.x - m.x, tg.y - m.y) || 1;
      shots.push({ x: m.x, y: m.y, sx: m.x, sy: m.y, tx: tg.x, ty: tg.y, vx: (tg.x - m.x) / d * BALL_SPEED, vy: (tg.y - m.y) / d * BALL_SPEED, total: d, trail: [], power: mode === 'super' ? 2.4 : 1 });
    }
    recoil = 1; shake = Math.max(shake, mode ? 7 : 4);
    burst(m.x, m.y, mode ? '#ff3fa4' : '#ffd23f', mode ? 18 : 10);
    callbacks.sfx && callbacks.sfx('shoot');
    emitStatus();
  }

  // impact : la pièce visée est poussée en profondeur, avec ses voisines posées dessus
  function impact(s) {
    const c = cubeAt(s.tx, s.ty);
    shake = Math.min(9, shake + 4);
    callbacks.vibrate && callbacks.vibrate(c ? 25 : 10);
    if (!c) { burst(s.tx, s.ty, '#ffffff', 6); callbacks.sfx && callbacks.sfx('hit'); return; }
    burst(s.tx, s.ty, c.tech.color, 14);
    callbacks.sfx && callbacks.sfx('hit');
    push(c, s, 1);
    if (s.power > 1) for (const o of cubes) {                       // super balle : les voisines sont aussi poussées
      if (o !== c && o.layer === c.layer && Math.hypot(o.position.x - c.position.x, visY(o) - visY(c)) < CUBE * 1.5) push(o, s, 0.6);
    }
  }

  // La direction dépend du tir : vers le fond (z), mais aussi vers la gauche/droite selon l'angle d'arrivée
  // de la balle et l'endroit touché. Les pièces posées dessus NE suivent PAS : elles se déséquilibrent (voir step).
  function push(c, s, f) {
    const m = c.pmass / (f * (s.power || 1)), len = Math.hypot(s.vx, s.vy) || 1;
    const ux = s.vx / len, uy = -s.vy / len;                                   // uy > 0 : la balle s'éloigne vers le fond
    const off = Math.max(-1, Math.min(1, (s.tx - c.position.x) / (c.pw * CUBE / 2)));   // -1 bord gauche … +1 bord droit
    Sleeping.set(c, false);
    const side = Math.min(1, Math.abs(ux) * 1.4 + Math.abs(off) * 0.25);       // 0 = tir de face, 1 = très de côté
    c.vz += 0.8 * PUSH * Math.max(0.3, uy) * (1 - 0.7 * side) / m;                   // profondeur : surtout pour un tir de face
    const lateral = (ux * 10 - off * 4) / m;                                  // latéral : angle d'arrivée + endroit touché
    Body.setVelocity(c, { x: c.velocity.x + lateral, y: c.velocity.y - (3.5 + 5 * uy) / m });   // la pièce saute puis retombe : cascade
    Body.setAngularVelocity(c, c.angularVelocity + (off * 0.09 + ux * 0.05) / m);
    if (c.z + c.vz / (1 - SLIDE_FRICTION) > DEPTH) knockOut(c, ux, uy);        // assez de coups cumulés : la pièce est éjectée
    for (const o of cubes) {           // pièces posées dessus : simple secousse
      if (o === c || o.layer !== c.layer) continue;
      if (Math.abs(o.position.y + o.ph * CUBE / 2 - (c.position.y - c.ph * CUBE / 2)) < 6 && Math.abs(o.position.x - c.position.x) < (o.pw + c.pw) * CUBE / 2 - 4) {
        Sleeping.set(o, false);
        Body.setAngularVelocity(o, (Math.random() - 0.5) * 0.03);
      }
    }
  }

  // La pièce est projetée sur le côté (vers le bord de table le plus proche) : elle emporte ses voisines, ce qui est posé dessus
  // perd son appui et s'effondre par gravité, puis tout se brise au sol (comme dans les jeux de référence).
  function knockOut(c, ux, uy) {
    const side = Math.min(1, Math.abs(ux) * 1.4);                                 // 0 = tir de face, 1 = très de côté
    if (Math.random() < 0.25 + 0.6 * (1 - side)) {                                // tir plutôt de face : la pièce part vers le fond, derrière la table
      Body.setStatic(c, true); c.collisionFilter = { category: 0, mask: 0, group: 0 };   // elle ne retient plus rien : ce qui est dessus tombe, elle glisse puis disparaît derrière
      c.back = true; Sleeping.set(c, false);
      return;
    }
    const dir = Math.abs(ux) > 0.2 ? Math.sign(ux) : (Math.sign(c.position.x - W / 2) || (Math.random() < 0.5 ? -1 : 1));
    const k = 1 / Math.sqrt(Math.max(1, c.pmass));
    Sleeping.set(c, false);
    Body.setVelocity(c, { x: dir * (8 + Math.random() * 4) * k + c.velocity.x * 0.3, y: -(5.5 + 3 * Math.max(0, uy)) * k });
    Body.setAngularVelocity(c, dir * (0.1 + Math.random() * 0.08) * k);
    c.vz = 0; c.z = c.layer * LAYER_Z; c.out = true; c.outAt = time;
  }

  function isSupported(c) {
    const bottom = c.position.y + c.ph * CUBE / 2;
    if (Math.abs(bottom - PLATFORM_Y) < 6 && Math.abs(c.position.x - W / 2) < platformW / 2 + 10) return true;
    return cubes.some((o) => o !== c && o.layer === c.layer && Math.abs(o.position.y - o.ph * CUBE / 2 - bottom) < 8 && Math.abs(o.position.x - c.position.x) < (o.pw + c.pw) * CUBE / 2 - 4);
  }

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 5;
      const c = Math.random() < 0.45 ? PALETTE[Math.floor(Math.random() * PALETTE.length)] : color;
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.8, life: 1, color: c, size: 3 + Math.random() * 5, star: Math.random() < 0.5 });
    }
  }

  // --- boucle ---
  function loop(now) {
    acc += Math.min(50, now - prev); prev = now;
    while (acc >= 1000 / 60) { step(1000 / 60); acc -= 1000 / 60; }
    render();
  }

  // une pièce qui s'écrase au sol se brise en éclats colorés qui rebondissent puis s'effacent
  function shatter(x, y, color, size) {
    const ground = y;
    for (let i = 0; i < 12; i++) {
      const a = -Math.PI * (0.15 + Math.random() * 0.7), sp = 2 + Math.random() * 5, sz = size * (0.2 + Math.random() * 0.28);
      debris.push({ x: x + (Math.random() - .5) * size * 0.6, y: ground - 4, vx: Math.cos(a) * sp * (Math.random() < .5 ? -1 : 1), vy: Math.sin(a) * sp, rot: Math.random() * 6, vr: (Math.random() - .5) * 0.5,
        w: sz * (1 + Math.random()), h: sz, color: i % 3 === 0 ? tintColor(color, 0.35) : i % 3 === 1 ? tintColor(color, -0.25) : color, ground: ground + Math.random() * 14, life: 1 });
    }
    puffs.push({ x, y: ground, r: size * 0.25, life: 1 });
  }

  function destroyed(c, x, y) {
    burst(Math.max(20, Math.min(W - 20, x)), Math.min(y, H - 40), c.tech.color, 7);
    shatter(Math.max(20, Math.min(W - 20, x)), Math.min(y, PLATFORM_Y + 110), c.tech.color, CUBE * Math.sqrt(c.pw * c.ph));
    Composite.remove(engine.world, c); cubes.splice(cubes.indexOf(c), 1);
    callbacks.sfx && callbacks.sfx('break');
    comboCount++; comboTime = time; comboX = Math.max(80, Math.min(W - 80, x)); comboY = Math.min(y, PLATFORM_Y + 100);
    emitStatus();
  }

  function step(dt) {
    time += dt;
    Engine.update(engine, dt);

    // projectiles
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      s.trail.push({ x: s.x, y: s.y }); if (s.trail.length > 9) s.trail.shift();
      const d = Math.hypot(s.tx - s.x, s.ty - s.y);
      if (d <= BALL_SPEED) { impact(s); shots.splice(i, 1); } else { s.x += s.vx; s.y += s.vy; }
    }

    // une pièce poussée vers le fond heurte celle qui est derrière elle (une seule fois) et la fait tomber d'abord
    for (const a of cubes) {
      if (a.vz < 0.3) continue;
      for (const b of cubes) {
        if (b === a || b.z <= a.z || a.z + THICK <= b.z - 4 || a.z + THICK > b.z + THICK) continue;
        if (Math.abs(a.position.x - b.position.x) >= (a.pw + b.pw) * CUBE / 2 - 6 || Math.abs(a.position.y - b.position.y) >= (a.ph + b.ph) * CUBE / 2 - 6) continue;
        if (!a.hitSet) a.hitSet = new Set();
        if (a.hitSet.has(b)) continue;
        a.hitSet.add(b);
        const v = a.vz, e = 0.35;                                  // choc : conservation de la quantité de mouvement
        b.vz = Math.max(b.vz, v * (1 + e) * a.pmass / (a.pmass + b.pmass));
        a.vz = Math.max(0, v * (a.pmass - e * b.pmass) / (a.pmass + b.pmass));
        Sleeping.set(b, false);
        callbacks.sfx && callbacks.sfx('hit');
      }
    }
    // garde-fou : aucune pièce ne reste immobile en l'air
    if (Math.floor(time / 16.7) % 20 === 0) for (const c of cubes) if (c.isSleeping && !isSupported(c)) Sleeping.set(c, false);

    // déséquilibre : une pièce dont le support a glissé vers le fond se met à basculer toute seule, un peu plus tard
    if (Math.floor(time / 16.7) % 6 === 0) {
      for (const c of cubes) {
        if (c.tipAt) {
          if (time >= c.tipAt) {
            c.tipAt = 0; c.vz += 3.4 / c.pmass;
            Sleeping.set(c, false);
            Body.setAngularVelocity(c, (Math.random() - 0.5) * 0.09);
            Body.setVelocity(c, { x: c.velocity.x + (Math.random() - 0.5) * 3, y: c.velocity.y });
          }
          continue;
        }
        const under = cubes.filter((o) => o !== c && o.layer === c.layer && Math.abs(o.position.y - o.ph * CUBE / 2 - (c.position.y + c.ph * CUBE / 2)) < 8 && Math.abs(o.position.x - c.position.x) < (o.pw + c.pw) * CUBE / 2 - 4);
        if (under.length && under.every((o) => c.z - o.z > 26)) c.tipAt = time + 200 + Math.random() * 350;
      }
    }

    // pièces : glissement en profondeur, chute derrière la table, chute sur les côtés
    for (let i = cubes.length - 1; i >= 0; i--) {
      const c = cubes[i];
      { // recul affiché limité à 2 plans : plan avant (léger décalage = progression du choc) ou plan arrière, avec transition douce
        const sl = c.z - c.layer * LAYER_Z, tgt = sl < LAYER_Z * 0.5 ? 0.4 * Math.max(0, sl) : LAYER_Z;
        c.ds = (c.ds || 0) + (tgt - (c.ds || 0)) * 0.2;
      }
      if (c.out && time - c.outAt > 900) { destroyed(c, c.position.x, Math.min(c.position.y, PLATFORM_Y + 60)); continue; }
      if (c.back && c.vz < 0.6) c.vz = 0.6;                    // une pièce envoyée au fond finit toujours par tomber derrière la table
      if (c.vz > 0 || c.z > 0) {
        c.z += c.vz; c.vz *= SLIDE_FRICTION; if (c.vz < 0.12) c.vz = 0;
        if (c.z > DEPTH) {
          const sc = 1 - slide(c) * 0.0015;
          ghosts.push({ tech: c.tech, pw: c.pw, ph: c.ph, x: c.position.x, y: visY(c), vx: c.velocity.x * 0.5, vy: -2.5, rot: c.angle, vr: (Math.random() - .5) * 0.1, sc, life: 1 });
          destroyed(c, c.position.x, PLATFORM_Y - 20);
          continue;
        }
      }
      if (c.position.y > PLATFORM_Y + 120 || c.position.x < -80 || c.position.x > W + 80) destroyed(c, c.position.x, c.position.y);
    }
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const g = ghosts[i];
      g.x += g.vx; g.y += g.vy; g.vy += 0.55; g.rot += g.vr; g.sc *= 0.992;
      if (g.y > PLATFORM_Y + 60) { shatter(g.x, PLATFORM_Y + 70, g.tech.color, CUBE * Math.sqrt(g.pw * g.ph) * g.sc); g.life = 0; }
      if (g.life <= 0) ghosts.splice(i, 1);
    }
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i]; d.x += d.vx; d.y += d.vy; d.vy += 0.5; d.rot += d.vr; d.life -= 0.016;
      if (d.y > d.ground && d.vy > 0) { d.y = d.ground; d.vy *= -0.38; d.vx *= 0.7; d.vr *= 0.6; }
      if (d.life <= 0) debris.splice(i, 1);
    }
    for (let i = puffs.length - 1; i >= 0; i--) { puffs[i].r += 1.3; puffs[i].life -= 0.05; if (puffs[i].life <= 0) puffs.splice(i, 1); }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.22; p.life -= 0.03;
      if (p.life <= 0) particles.splice(i, 1);
    }
    shake *= 0.85; recoil *= 0.9; flash *= 0.9;
    if (comboCount && time - comboTime > 350) {
      if (comboCount >= 2) {
        const text = comboCount >= 6 ? 'INCROYABLE !' : comboCount >= 4 ? 'Génial !' : 'Super !';
        flash = Math.min(1, comboCount / 6); shake = Math.max(shake, 6);
        callbacks.popup && callbacks.popup(text + (comboCount >= 3 ? ' x' + comboCount : ''), comboX, comboY);
        callbacks.sfx && callbacks.sfx('clear');
      }
      comboCount = 0;
    }

    if (finished) return;
    if (cubes.length === 0) {
      settleTimer += dt;
      if (settleTimer > 600) end(true);
      return;
    }
    // défaite : plus de balles, plus aucune balle en vol, pièces immobiles
    if (ballsLeft === 0 && shots.length === 0) {
      const moving = cubes.some((c) => c.vz > 0 || (!c.isSleeping && Math.hypot(c.velocity.x, c.velocity.y) > 0.25));
      settleTimer = moving ? 0 : settleTimer + dt;
      if (settleTimer > 900) end(false);
    } else settleTimer = 0;
  }

  function end(won) {
    finished = true;
    if (won) for (let i = 0; i < 8; i++) setTimeout(() => burst(60 + Math.random() * 420, 300 + Math.random() * 300, '#ffd23f', 24), i * 120);
    callbacks.sfx && callbacks.sfx(won ? 'win' : 'lose');
    callbacks.end && callbacks.end({ won, score: won ? ballsLeft : 0, ballsLeft });
  }

  // --- rendu ---
  const STARS = Array.from({ length: 70 }, (_, i) => ({ x: (i * 97.3) % W, y: (i * 61.7) % 640 + 10, r: 0.8 + (i % 4) * 0.6, p: i * 0.9, c: i % 5 === 0 ? '#ffd23f' : i % 7 === 0 ? '#5fd4ff' : '#fff' }));

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const sx = (Math.random() - .5) * shake, sy = (Math.random() - .5) * shake;
    ctx.save(); ctx.translate(sx, sy);
    drawBackground();
    ghosts.forEach((g) => { ctx.globalAlpha = Math.max(0, g.life); drawPiece(g.tech, g.pw, g.ph, g.x, g.y, g.rot, g.sc, 0.35); });   // tombent DERRIÈRE la table
    ctx.globalAlpha = 1;
    drawPedestal();
    [...cubes].sort((a, b) => b.z - a.z).forEach((c) => drawPiece(c.tech, c.pw, c.ph, c.position.x, visY(c), c.angle, 1 - slide(c) * 0.0015, Math.min(0.3, slide(c) / 300)));
    puffs.forEach((q) => { ctx.globalAlpha = Math.max(0, q.life) * 0.35; ctx.fillStyle = '#f4f1e6'; ctx.beginPath(); ctx.ellipse(q.x, q.y, q.r * 1.6, q.r * 0.6, 0, 0, 7); ctx.fill(); });
    debris.forEach((d) => {
      ctx.save(); ctx.globalAlpha = Math.min(1, d.life * 1.6); ctx.translate(d.x, d.y); ctx.rotate(d.rot);
      ctx.fillStyle = d.color; ctx.strokeStyle = 'rgba(28,10,66,.7)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-d.w / 2, -d.h / 2); ctx.lineTo(d.w / 2, -d.h * 0.3); ctx.lineTo(d.w * 0.35, d.h / 2); ctx.lineTo(-d.w * 0.45, d.h * 0.4); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    });
    ctx.globalAlpha = 1;
    drawAimGuide();
    shots.forEach(drawShot);
    drawCannon();
    ctx.globalCompositeOperation = 'lighter';
    particles.forEach((p) => {
      ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color;
      if (p.star) { drawStar(p.x, p.y, p.size * 1.6, p.life * 6); ctx.fill(); } else ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    });
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (flash > 0.01) { ctx.fillStyle = `rgba(255,243,160,${flash * 0.35})`; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
  }

  function drawStar(x, y, r, rot = 0) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const rr = i % 2 ? r * 0.3 : r, a = rot + i * Math.PI / 4; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath();
  }
  function drawStar5(x, y, r, rot = -Math.PI / 2) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.45 : r, a = rot + i * Math.PI / 5; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath();
  }

  // --- fonds : un thème par niveau (champ "theme" du JSON) ---
  // sky : dégradé du haut vers l'horizon · ground : dégradé du sol · hills : 2 collines · line : liseré de l'horizon
  // sun : astre {fx (0..1), dy (px au-dessus de l'horizon), r, c, glow} · deco : silhouettes au loin · fx : particules
  const THEMES = {
    night:   { sky: ['#0f0a52', '#3a2bc0', '#b03fd0'], halo: 'rgba(255,210,63,.35)', rays: true, stars: true, sun: { fx: 0.84, dy: 475, r: 26, c: '#fff3a0', glow: '#ffd23f' }, hills: ['#4a1a9a', '#5f22b8'], ground: ['#7a2cff', '#4b1fb0', '#1c0d66'], line: '#ffd23f', deco: 'castle', decoC: '#2a1280' },
    meadow:  { sky: ['#1f7bff', '#6cc3ff', '#d9f2ff'], halo: 'rgba(255,255,200,.45)', clouds: true, sun: { fx: 0.16, dy: 540, r: 38, c: '#fff6b0', glow: '#ffe066' }, hills: ['#5fcf62', '#43b250'], ground: ['#4cc254', '#36a043', '#1f6d2c'], line: '#9df08a', deco: 'trees', decoC: '#2f9a3f' },
    sunset:  { sky: ['#2a1260', '#d6416b', '#ffb347'], halo: 'rgba(255,170,80,.5)', clouds: true, cloudC: 'rgba(255,200,170,.55)', sun: { fx: 0.5, dy: 260, r: 70, c: '#ffe29a', glow: '#ff8a3d' }, hills: ['#6a1b6e', '#4a1259'], ground: ['#5a1f66', '#3a1450', '#1d0a33'], line: '#ffb347', deco: 'palms', decoC: '#2b0d3d' },
    snow:    { sky: ['#6aa6e8', '#b9dcf7', '#f2fbff'], halo: 'rgba(255,255,255,.5)', clouds: true, sun: { fx: 0.8, dy: 520, r: 30, c: '#ffffff', glow: '#cfeaff' }, hills: ['#e6f3ff', '#cfe6fb'], ground: ['#f4fbff', '#cfe3f4', '#9fbfdc'], line: '#ffffff', deco: 'pines', decoC: '#3f7a8c', fx: 'snow' },
    desert:  { sky: ['#f08a3c', '#ffc46b', '#fff0c2'], halo: 'rgba(255,230,150,.55)', sun: { fx: 0.25, dy: 500, r: 46, c: '#fffbd0', glow: '#ffd23f' }, hills: ['#e0a458', '#cf8d3f'], ground: ['#e9b869', '#cf8f3e', '#8f5a22'], line: '#fff0a8', deco: 'pyramids', decoC: '#b8742e' },
    ocean:   { sky: ['#0a86c9', '#4fc4e8', '#c9f3ff'], halo: 'rgba(200,250,255,.5)', clouds: true, sun: { fx: 0.78, dy: 520, r: 34, c: '#fffbd0', glow: '#ffe066' }, hills: ['#1597c9', '#0f7fb5'], ground: ['#13a3d8', '#0b78b8', '#054a80'], line: '#bff3ff', deco: 'boats', decoC: '#ffffff', fx: 'waves' },
    candy:   { sky: ['#ff8fd0', '#ffc2e8', '#fff0fa'], halo: 'rgba(255,255,255,.55)', clouds: true, cloudC: 'rgba(255,255,255,.8)', sun: { fx: 0.2, dy: 520, r: 34, c: '#fff6a0', glow: '#ffb3e0' }, hills: ['#7fe3d1', '#5fd2c0'], ground: ['#ffd1ec', '#ff9ad6', '#e0529f'], line: '#ffffff', deco: 'lollipops', decoC: '#ff5fa8' },
    forest:  { sky: ['#06231a', '#0e4a35', '#2c8a5a'], halo: 'rgba(120,255,170,.3)', stars: true, sun: { fx: 0.2, dy: 500, r: 24, c: '#eafff0', glow: '#9dffc0' }, hills: ['#0c3b2a', '#08301f'], ground: ['#1d6b43', '#115232', '#08301d'], line: '#9dffc0', deco: 'pines', decoC: '#05241a', fx: 'fireflies' },
    space:   { sky: ['#02030f', '#0a1040', '#2b1a6e'], halo: 'rgba(120,160,255,.3)', stars: true, rays: true, hills: ['#1a2060', '#222a7a'], ground: ['#3b3fa8', '#222668', '#0c0e30'], line: '#7fd4ff', deco: 'planets', decoC: '#7a8cff' },
    autumn:  { sky: ['#5a2a1a', '#d9793a', '#ffd9a0'], halo: 'rgba(255,200,120,.45)', clouds: true, cloudC: 'rgba(255,225,190,.55)', sun: { fx: 0.82, dy: 500, r: 36, c: '#fff0b0', glow: '#ffa63d' }, hills: ['#a8541f', '#8a3f14'], ground: ['#b8651f', '#8d4616', '#5a2a0c'], line: '#ffcf7a', deco: 'trees', decoC: '#c4521a', fx: 'leaves' },
    volcano: { sky: ['#1a0505', '#6b1408', '#ff6a1a'], halo: 'rgba(255,120,40,.5)', sun: { fx: 0.5, dy: 380, r: 90, c: 'rgba(255,170,60,.35)', glow: '#ff5a1a' }, hills: ['#2a0c0c', '#1d0707'], ground: ['#4a1a12', '#2a0e0a', '#120503'], line: '#ff7a2a', deco: 'volcanos', decoC: '#150606', fx: 'embers' },
    neon:    { sky: ['#07031f', '#2a0a5e', '#ff2fa0'], halo: 'rgba(255,47,160,.35)', stars: true, sun: { fx: 0.5, dy: 300, r: 80, c: 'rgba(255,230,80,.9)', glow: '#ff2fa0' }, hills: ['#1a0a4a', '#14073a'], ground: ['#2a0a5e', '#14073a', '#07031f'], line: '#00f0ff', deco: 'city', decoC: '#12063a' },
  };
  let theme = THEMES.night, themeName = 'night';
  const FX_N = 46;

  // silhouettes posées sur la ligne d'horizon (y = 0 ; vers le haut = négatif), calées sur un décor de 540 de large
  function drawDeco(kind, col, flip) {
    ctx.fillStyle = col;
    const xs = flip ? (x) => W - x : (x) => x;
    const tri = (x, w, h) => { ctx.beginPath(); ctx.moveTo(xs(x - w / 2), 0); ctx.lineTo(xs(x), -h); ctx.lineTo(xs(x + w / 2), 0); ctx.fill(); };
    const blob = (x, y, r) => { ctx.beginPath(); ctx.arc(xs(x), y, r, 0, 7); ctx.fill(); };
    const rx = (x, w, y, h) => ctx.fillRect(xs(x) - (flip ? w : 0), y, w, h);
    const spots = [40, 120, 420, 500], right = W - 540;
    switch (kind) {
      case 'castle':
        rx(0, 40, -80, 80); rx(40, 30, -125, 125); tri(55, 36, 40); rx(70, 40, -90, 90); rx(110, 60, -60, 60);
        ctx.save(); ctx.translate(right, 0); rx(380, 40, -75, 75); rx(420, 40, -140, 140); tri(440, 46, 40); rx(460, 40, -100, 100); rx(500, 40, -60, 60); ctx.restore(); break;
      case 'trees':
        for (const x of [30, 110, 190, 350, 430, 510]) { rx(x - 4, 8, -26, 26); blob(x, -44, 28 + (x % 3) * 6); blob(x - 18, -30, 20); blob(x + 18, -30, 20); }
        break;
      case 'pines':
        for (const x of [20, 80, 140, 400, 460, 520]) { tri(x, 50, 110); tri(x, 40, 80); tri(x, 30, 54); }
        break;
      case 'pyramids':
        tri(90, 190, 130); tri(250, 120, 82); ctx.save(); ctx.translate(right, 0); tri(430, 240, 160); ctx.restore(); break;
      case 'palms':
        for (const x of [60, 150, 470]) { rx(x - 3, 6, -120, 120); for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.ellipse(xs(x + i * 22), -120 + Math.abs(i) * 14, 30, 7, i * 0.45, 0, 7); ctx.fill(); } }
        break;
      case 'boats':
        for (const [x, s] of [[110, 1], [400, 0.8]]) { ctx.beginPath(); ctx.moveTo(xs(x - 40 * s), -10); ctx.lineTo(xs(x + 40 * s), -10); ctx.lineTo(xs(x + 28 * s), 4); ctx.lineTo(xs(x - 28 * s), 4); ctx.fill(); tri(x + 4 * s, 56 * s, 60 * s); rx(x - 2, 4, -66 * s, 66 * s); }
        break;
      case 'lollipops':
        for (const [x, c] of [[60, '#ff5fa8'], [170, '#5fd4ff'], [440, '#ffd23f'], [510, '#b36bff']]) { ctx.fillStyle = '#fff'; rx(x - 3, 6, -70, 70); ctx.fillStyle = c; blob(x, -86, 24); ctx.fillStyle = '#fff'; blob(x, -86, 10); }
        break;
      case 'planets':
        ctx.globalAlpha = 0.9; ctx.fillStyle = col; blob(95, -230, 52); blob(W - 90, -330, 30);
        ctx.strokeStyle = col; ctx.lineWidth = 8; ctx.beginPath(); ctx.ellipse(xs(95), -230, 86, 16, -0.35, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; break;
      case 'volcanos':
        ctx.beginPath(); ctx.moveTo(xs(0), 0); ctx.lineTo(xs(150), -150); ctx.lineTo(xs(190), -140); ctx.lineTo(xs(340), 0); ctx.fill();
        ctx.fillStyle = '#ff6a1a'; ctx.beginPath(); ctx.ellipse(xs(170), -146, 26, 6, 0, 0, 7); ctx.fill(); ctx.fillStyle = col;
        ctx.save(); ctx.translate(right, 0); tri(430, 260, 120); ctx.restore(); break;
      case 'city':
        for (const [x, w, h] of [[10, 40, 90], [55, 34, 140], [95, 50, 70], [150, 30, 120], [400, 44, 110], [450, 36, 160], [492, 48, 80]]) {
          rx(x, w, -h, h); ctx.fillStyle = '#ff2fa0'; for (let y = -h + 12; y < -8; y += 20) rx(x + 8, 6, y, 6); rx(x + w - 14, 6, -h + 22, 6); ctx.fillStyle = col;
        }
        break;
      default: break;
    }
  }

  function drawBackground() {
    const GROUND = PLATFORM_Y + 96, th = theme, flip = (levelId % 2) === 0;
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, th.sky[0]); sky.addColorStop(.55, th.sky[1]); sky.addColorStop(1, th.sky[2]);
    ctx.fillStyle = sky; ctx.fillRect(-20, -20, W + 40, H + 40);
    const hx = flip ? W * 0.62 : W * 0.38, hy = PLATFORM_Y - 140;
    const halo = ctx.createRadialGradient(hx, hy, 20, hx, hy, 340);
    halo.addColorStop(0, th.halo); halo.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = halo; ctx.fillRect(0, 0, W, GROUND);
    if (th.rays) {
      ctx.save(); ctx.translate(W / 2, hy); ctx.rotate(time * 0.00006); ctx.fillStyle = 'rgba(255,255,255,.045)';
      for (let i = 0; i < 10; i++) { ctx.rotate(Math.PI / 5); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-60, -700); ctx.lineTo(60, -700); ctx.fill(); }
      ctx.restore();
    }
    if (th.stars) STARS.forEach((s) => {
      ctx.globalAlpha = 0.45 + 0.55 * Math.sin(time * 0.003 + s.p); ctx.fillStyle = s.c;
      const sx = (s.x / 540) * W;
      if (s.r > 2) { drawStar(sx, s.y, s.r * 2.6, 0); ctx.fill(); } else { ctx.beginPath(); ctx.arc(sx, s.y, s.r, 0, 7); ctx.fill(); }
    });
    ctx.globalAlpha = 1;
    if (th.sun) {
      const sx = (flip ? 1 - th.sun.fx : th.sun.fx) * W;
      ctx.save(); ctx.fillStyle = th.sun.c; ctx.shadowColor = th.sun.glow; ctx.shadowBlur = 30;
      ctx.beginPath(); ctx.arc(sx, GROUND - th.sun.dy, th.sun.r, 0, 7); ctx.fill(); ctx.restore();
    }
    if (th.clouds) {
      ctx.fillStyle = th.cloudC || 'rgba(255,255,255,.92)';
      for (let i = 0; i < 4; i++) {
        const x = ((i * 233 + time * (0.006 + i * 0.002)) % (W + 240)) - 120, y = 90 + i * 70 + (i % 2) * 30, s = 0.8 + (i % 3) * 0.3;
        ctx.beginPath(); ctx.arc(x, y, 26 * s, 0, 7); ctx.arc(x + 30 * s, y - 12 * s, 32 * s, 0, 7); ctx.arc(x + 64 * s, y, 26 * s, 0, 7); ctx.rect(x, y, 64 * s, 26 * s); ctx.fill();
      }
    }
    ctx.save(); ctx.translate(0, GROUND - 10);       // tout ce qui est « à l'horizon » est calé sur y = 0
    if (th.deco) drawDeco(th.deco, th.decoC, flip);
    ctx.fillStyle = th.hills[0]; ctx.beginPath(); ctx.ellipse(flip ? W - 110 : 110, 10, 330, 110, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = th.hills[1]; ctx.beginPath(); ctx.ellipse(flip ? 90 : W - 90, 20, 330, 95, 0, Math.PI, 0); ctx.fill();
    const ground = ctx.createLinearGradient(0, 0, 0, H - GROUND + 40);
    ground.addColorStop(0, th.ground[0]); ground.addColorStop(.35, th.ground[1]); ground.addColorStop(1, th.ground[2]);
    ctx.fillStyle = ground; ctx.fillRect(-20, 0, W + 40, H + 600);
    ctx.fillStyle = th.line; ctx.fillRect(-20, -2, W + 40, 5);
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(-20, 3, W + 40, 3);
    if (themeName === 'ocean') { ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 3; for (let i = 0; i < 12; i++) { const x = ((i * 97 + time * 0.03) % (W + 80)) - 40, y = 30 + (i % 4) * 34; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 14, y - 8, x + 28, y); ctx.quadraticCurveTo(x + 42, y + 8, x + 56, y); ctx.stroke(); } }
    ctx.restore();
    drawFx(th.fx);
  }

  // particules d'ambiance : neige, lucioles, braises, feuilles
  function drawFx(kind) {
    if (!kind || kind === 'waves') return;
    for (let i = 0; i < FX_N; i++) {
      const sp = 0.3 + (i % 5) * 0.12, ph = i * 1.7;
      if (kind === 'snow') { const x = (i * 71 + Math.sin(time * 0.001 + ph) * 24) % W, y = (i * 97 + time * 0.05 * sp * 2) % H; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(x, y, 2 + (i % 3), 0, 7); ctx.fill(); }
      else if (kind === 'fireflies') { const x = (i * 83 + Math.sin(time * 0.0007 + ph) * 40 + W) % W, y = 120 + ((i * 53 + Math.cos(time * 0.0006 + ph) * 30) % (H - 240)); ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(time * 0.002 + ph)); ctx.fillStyle = '#d8ff7a'; ctx.shadowColor = '#d8ff7a'; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1; }
      else if (kind === 'embers') { const x = (i * 67 + Math.sin(time * 0.001 + ph) * 18) % W, y = H - ((i * 89 + time * 0.06 * sp * 2) % H); ctx.globalAlpha = 0.8; ctx.fillStyle = i % 2 ? '#ff7a2a' : '#ffd23f'; ctx.fillRect(x, y, 3, 3); ctx.globalAlpha = 1; }
      else if (kind === 'leaves') { const x = (i * 61 + Math.sin(time * 0.0012 + ph) * 40 + W) % W, y = (i * 101 + time * 0.045 * sp * 2) % H; ctx.fillStyle = i % 2 ? '#ff8a2a' : '#e0b020'; ctx.save(); ctx.translate(x, y); ctx.rotate(time * 0.002 + ph); ctx.beginPath(); ctx.ellipse(0, 0, 6, 3, 0, 0, 7); ctx.fill(); ctx.restore(); }
    }
  }

  const PED = 84;   // hauteur du pied (de la table au sol)
  function drawPedestal() {
    const cx = W / 2, px = cx - platformW / 2, back = DEPTH * DEPTH_Y, y0 = PLATFORM_Y;
    // ombre au sol + socle
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(cx, y0 + PED + 14, 120, 16, 0, 0, 7); ctx.fill();
    const bg = ctx.createLinearGradient(0, y0 + PED - 14, 0, y0 + PED + 22);
    bg.addColorStop(0, '#fff3a0'); bg.addColorStop(.4, '#ffd23f'); bg.addColorStop(1, '#c97900');
    ctx.fillStyle = '#2a0a52'; ctx.beginPath(); ctx.ellipse(cx, y0 + PED + 12, 74, 22, 0, 0, 7); ctx.fill();
    ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(cx, y0 + PED + 6, 74, 20, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#7a2cff'; ctx.beginPath(); ctx.ellipse(cx, y0 + PED + 2, 52, 12, 0, 0, 7); ctx.fill();
    // pied métallique
    const pg = ctx.createLinearGradient(cx - 24, 0, cx + 24, 0);
    pg.addColorStop(0, '#4a22b8'); pg.addColorStop(.3, '#b48cff'); pg.addColorStop(.6, '#7a45e8'); pg.addColorStop(1, '#2f1478');
    ctx.fillStyle = pg; ctx.beginPath(); ctx.moveTo(cx - 20, y0 + PLATFORM_H); ctx.lineTo(cx + 20, y0 + PLATFORM_H); ctx.lineTo(cx + 28, y0 + PED); ctx.lineTo(cx - 28, y0 + PED); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(cx - 27, y0 + PLATFORM_H + 6, 54, 6); ctx.fillRect(cx - 30, y0 + PED - 12, 60, 8);
    ctx.save(); ctx.translate(cx, y0 + PLATFORM_H + 30); ctx.fillStyle = '#ff5fb0'; ctx.shadowColor = '#ff5fb0'; ctx.shadowBlur = 5;
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(7, 0); ctx.lineTo(0, 8); ctx.lineTo(-7, 0); ctx.closePath(); ctx.fill(); ctx.restore();
    // dessus du plateau en perspective : planches dorées
    const top = ctx.createLinearGradient(0, y0 - back, 0, y0);
    top.addColorStop(0, '#e9a23a'); top.addColorStop(1, '#ffe9a8');
    ctx.fillStyle = top; ctx.beginPath(); ctx.moveTo(px, y0); ctx.lineTo(px + platformW, y0); ctx.lineTo(px + platformW - 18, y0 - back); ctx.lineTo(px + 18, y0 - back); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(150,90,20,.35)'; ctx.lineWidth = 1.5;
    const planks = Math.max(3, Math.round(platformW / 44));
    for (let i = 1; i < planks; i++) { const f = i / planks; ctx.beginPath(); ctx.moveTo(px + platformW * f, y0); ctx.lineTo(px + 18 + (platformW - 36) * f, y0 - back); ctx.stroke(); }
    ctx.strokeStyle = '#2a0a52'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(px, y0); ctx.lineTo(px + 18, y0 - back); ctx.lineTo(px + platformW - 18, y0 - back); ctx.lineTo(px + platformW, y0); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(px + 22, y0 - back + 3, platformW - 44, 3);
    // bord avant : trois bandes (magenta, or, bleu) comme la table d'un stand de fête
    ctx.save(); ctx.beginPath(); ctx.roundRect(px, y0, platformW, PLATFORM_H, [2, 2, 14, 14]); ctx.clip();
    ctx.fillStyle = '#ff4d8d'; ctx.fillRect(px, y0, platformW, 6);
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(px, y0 + 6, platformW, 6);
    ctx.fillStyle = '#3a7bff'; ctx.fillRect(px, y0 + 12, platformW, 7);
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(px, y0, platformW, 2);
    ctx.restore();
    ctx.strokeStyle = '#2a0a52'; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(px, y0, platformW, PLATFORM_H, [2, 2, 14, 14]); ctx.stroke();
    ctx.fillStyle = '#fffbd0'; for (let x = px + 26; x < px + platformW - 14; x += 40) { ctx.beginPath(); ctx.arc(x, y0 + 9, 2.4, 0, 7); ctx.fill(); }
  }

  // pièce de taille pw x ph (en cubes) : cube de la couleur de la techno, logo blanc
  function drawPiece(t, pw, ph, x, y, angle, sc, dark) {
    if (!t) return;
    const w = pw * CUBE - 2, h = ph * CUBE - 2, r = Math.min(15, CUBE * 0.2), base = t.base || t.color;
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(sc, sc);
    ctx.fillStyle = 'rgba(28, 10, 66, .95)'; ctx.beginPath(); ctx.roundRect(-w / 2 - 1.5, -h / 2 - 1.5, w + 3, h + 7, r + 2); ctx.fill();       // contour
    ctx.fillStyle = tintColor(base, -0.38); ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2 + 3, w, h, r); ctx.fill();                          // épaisseur
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, tintColor(base, 0.3)); g.addColorStop(.55, base); g.addColorStop(1, tintColor(base, -0.12));
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h - 3, r); ctx.fill();                                              // face
    ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.beginPath(); ctx.roundRect(-w / 2 + 4, -h / 2 + 3, w - 8, Math.max(10, (h - 3) * 0.3), Math.max(4, r - 4)); ctx.fill();   // reflet
    ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 7, r - 2); ctx.stroke();
    const ls = Math.min(w, h - 3) * 0.6, n = pw >= 3 ? 2 : 1, icon = t.white || t.img;
    if (icon && (icon.complete !== false)) {
      if (!lite) { ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowOffsetY = 2; ctx.shadowBlur = 3; }
      for (let i = 0; i < n; i++) ctx.drawImage(icon, (n === 2 ? (i ? 1 : -1) * w / 4 : 0) - ls / 2, -ls / 2 - 1.5, ls, ls);
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    }
    if (dark) { ctx.fillStyle = 'rgba(20,5,60,' + dark + ')'; ctx.beginPath(); ctx.roundRect(-w / 2 - 1.5, -h / 2 - 1.5, w + 3, h + 7, r + 2); ctx.fill(); }
    ctx.restore();
  }

  // trajectoire en perspective : la balle rapetisse en s'éloignant
  function drawShot(s) {
    const prog = Math.min(1, Math.hypot(s.x - s.sx, s.y - s.sy) / s.total), sc = 1 - 0.45 * prog;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    s.trail.forEach((p, i) => { ctx.globalAlpha = i / s.trail.length * 0.5; ctx.fillStyle = i % 2 ? '#ff3fa4' : '#ffd23f'; ctx.beginPath(); ctx.arc(p.x, p.y, BALL_R * sc * (i / s.trail.length), 0, 7); ctx.fill(); });
    ctx.restore();
    ctx.save(); ctx.translate(s.x, s.y);
    ctx.shadowColor = '#ff3fa4'; ctx.shadowBlur = 7;
    const r = BALL_R * sc * (s.power > 1 ? 1.4 : 1), g = ctx.createRadialGradient(-r / 3, -r / 3, 1, 0, 0, r + 2);
    g.addColorStop(0, '#fff'); g.addColorStop(.3, '#ff9ad6'); g.addColorStop(.7, '#ff3fa4'); g.addColorStop(1, '#b0126b');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3 * sc; ctx.beginPath(); ctx.arc(0, 0, r - 1.5, 0, 7); ctx.stroke();
    ctx.fillStyle = '#fff3a0'; drawStar(0, 0, r * 0.4, time * 0.01); ctx.fill();
    ctx.restore();
  }

  function drawAimGuide() {
    if (finished || ballsLeft === 0) return;
    const m = muzzle(), t = currentTarget();
    const d = Math.hypot(t.x - m.x, t.y - m.y), n = Math.floor(d / 22);
    ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 3;
    for (let i = 1; i < n; i++) {
      const k = i / n, pulse = 1 + 0.3 * Math.sin(time * 0.012 - i * 0.6);
      ctx.globalAlpha = 0.95 - k * 0.45; ctx.fillStyle = i % 2 ? '#fff3a0' : '#ff9ad6';
      ctx.beginPath(); ctx.arc(m.x + (t.x - m.x) * k, m.y + (t.y - m.y) * k, (5.5 - 2.5 * k) * pulse, 0, 7); ctx.fill();
    }
    // réticule sur la cible
    const c = cubeAt(t.x, t.y), r = 16 + 3 * Math.sin(time * 0.01);
    ctx.globalAlpha = 1; ctx.shadowBlur = 5; ctx.strokeStyle = c ? '#ff3fa4' : 'rgba(255,255,255,.7)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(t.x, t.y, r, 0, 7); ctx.stroke();
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + time * 0.002; ctx.beginPath(); ctx.moveTo(t.x + Math.cos(a) * (r - 4), t.y + Math.sin(a) * (r - 4)); ctx.lineTo(t.x + Math.cos(a) * (r + 7), t.y + Math.sin(a) * (r + 7)); ctx.stroke(); }
    ctx.shadowBlur = 0;
  }

  // Canon vu de derrière, comme sur la maquette : fût rouge évasé, anneau doré, étoile, flancs étoilés, étriers bleus
  function drawCannon() {
    const cx = cannonX, by = CANNON_Y, MUZZLE = 178, rx = Math.max(330, W * 0.62) / cs;
    ctx.save(); ctx.translate(cx, by); ctx.scale(cs, cs); ctx.translate(-cx, -by);
    // base : grand plateau bleu cerclé d'orange en bas de l'écran
    ctx.save();
    const rg = ctx.createLinearGradient(0, by - 70, 0, by + 60);
    rg.addColorStop(0, '#ffb347'); rg.addColorStop(.18, '#f08a00'); rg.addColorStop(.3, '#2f58d4'); rg.addColorStop(1, '#16297a');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.ellipse(cx, by + 40, rx, 95, 0, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 7; ctx.beginPath(); ctx.ellipse(cx, by + 40, rx, 95, 0, Math.PI * 1.03, Math.PI * 1.97); ctx.stroke();
    ctx.restore();
    // étriers bleus de chaque côté du fût
    ctx.fillStyle = '#2f58d4'; ctx.strokeStyle = '#16297a'; ctx.lineWidth = 3;
    [-1, 1].forEach((sd) => { ctx.beginPath(); ctx.roundRect(cx + sd * 92 - 14, by - 46, 28, 70, 8); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#ffb300'; ctx.beginPath(); ctx.roundRect(cx + sd * 92 - 17, by - 52, 34, 14, 6); ctx.fill(); ctx.fillStyle = '#2f58d4'; });

    ctx.save(); ctx.translate(cx, by); ctx.rotate(aim); ctx.translate(0, recoil * 12);
    // fût évasé (étroit à la bouche, large à la base)
    const topY = -MUZZLE + 30, botY = 70, topHW = 56, botHW = 86;
    const g = ctx.createLinearGradient(-botHW, 0, botHW, 0);
    g.addColorStop(0, '#a3121c'); g.addColorStop(.3, '#ff5a5f'); g.addColorStop(.55, '#e8333b'); g.addColorStop(1, '#8c0f1a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-botHW, botY); ctx.lineTo(-topHW, topY); ctx.lineTo(topHW, topY); ctx.lineTo(botHW, botY); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#5c0a12'; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.moveTo(-botHW + 18, botY); ctx.lineTo(-topHW + 12, topY); ctx.lineTo(-topHW + 26, topY); ctx.lineTo(-botHW + 36, botY); ctx.closePath(); ctx.fill();
    // flèche argentée au pied du fût
    const ag = ctx.createLinearGradient(-20, 0, 20, 0); ag.addColorStop(0, '#9aa6d8'); ag.addColorStop(.5, '#f2f4ff'); ag.addColorStop(1, '#8a93c8');
    ctx.fillStyle = ag; ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(24, botY); ctx.lineTo(-24, botY); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#5c0a12'; ctx.lineWidth = 2; ctx.stroke();
    // grande étoile dorée
    ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#c97900'; ctx.lineWidth = 3; drawStar5(0, -58, 34); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff3a0'; drawStar5(-4, -62, 15); ctx.fill();
    // petites étoiles sur les flancs
    ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#c97900'; ctx.lineWidth = 2;
    drawStar5(-74, 22, 17, -Math.PI / 2 - 0.4); ctx.fill(); ctx.stroke(); drawStar5(74, 22, 17, -Math.PI / 2 + 0.4); ctx.fill(); ctx.stroke();
    // anneau doré de la bouche + bande blanche
    ctx.fillStyle = '#fff'; ctx.fillRect(-topHW - 4, topY - 2, (topHW + 4) * 2, 10);
    const mg = ctx.createLinearGradient(-70, 0, 70, 0); mg.addColorStop(0, '#d98a00'); mg.addColorStop(.35, '#fff0a0'); mg.addColorStop(.7, '#ffb300'); mg.addColorStop(1, '#c97900');
    ctx.fillStyle = mg; ctx.beginPath(); ctx.roundRect(-66, topY - 38, 132, 40, 12); ctx.fill(); ctx.strokeStyle = '#a86a00'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#ffdf6a'; ctx.beginPath(); ctx.ellipse(0, topY - 38, 66, 13, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1b1245'; ctx.beginPath(); ctx.ellipse(0, topY - 38, 52, 9, 0, 0, 7); ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  return {
    get W() { return W; }, get H() { return H; }, fit, loadTechs, start, stop, fire, rotate, setAimToward, canFire,
    get cannonX() { return cannonX; }, get cannonY() { return CANNON_Y - MUZZLE; },   // cannonY = hauteur de la bouche
    set aiming(v) { aiming = v; }, get aiming() { return aiming; },
    whiteURL(key) { const t = techs[key]; if (!t) return ''; if (!t.whiteUrl) t.whiteUrl = t.white && t.white.toDataURL ? t.white.toDataURL() : (t.img && t.img.src) || ''; return t.whiteUrl; },
    techColors(key) { const t = techs[key]; return t ? { c1: tintColor(t.base || t.color, 0.25), c2: t.base || t.color } : { c1: '#888', c2: '#444' }; },
    arm, get powers() { return { ...powers }; }, get armed() { return armed; },
    stackCenter() { if (!cubes || !cubes.length) return { x: W / 2, y: PLATFORM_Y - 100 }; const xs = cubes.map((c) => c.position.x), ys = cubes.map(visY); return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }; },
    get ballsLeft() { return ballsLeft; }, get cubesLeft() { return cubes ? cubes.length : 0; },
    // aide au debug / tests automatiques
    _debug: () => ({ cubes, shots, ballsLeft, finished, aim, time }),
    _advance(ms) { for (let t = 0; t < ms; t += 1000 / 60) step(1000 / 60); render(); },
  };
})();
