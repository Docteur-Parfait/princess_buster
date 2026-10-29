// Moteur du jeu : physique (Matter.js) + profondeur simulée + rendu canvas. Aucune dépendance vers l'interface (voir ui.js).
//
// Vue « de derrière le canon » : la balle part vers le fond de l'écran. Quand elle touche une pièce, celle-ci est
// poussée en PROFONDEUR (axe z) : elle glisse sur la table puis tombe derrière. Les pièces qui dépassent du plateau
// à gauche/droite tombent normalement (physique 2D Matter).
const Game = (() => {
  const { Engine, Bodies, Body, Composite, Sleeping } = Matter;

  let W = 540, H = 960;               // taille logique : s'adapte à tout l'écran (voir fit)
  const CUBE = 60;
  let PLATFORM_Y = 560;               // surface avant de la table
  const PLATFORM_H = 18;
  let CANNON_Y = 954;                 // pivot du canon (bas de l'écran)
  let MUZZLE = 178, cs = 1;           // distance pivot -> bouche ; cs = échelle du canon (réduit sur les écrans bas)
  const BALL_R = 15, BALL_SPEED = 30;
  const MAX_ANGLE = 62 * Math.PI / 180;
  const FIRE_COOLDOWN = 320;
  const DEPTH = 100;                  // profondeur de la table : au-delà, la pièce tombe derrière
  const LAYER_Z = 45;                 // écart de profondeur entre deux rangées de pièces (une pièce « derrière » une autre)
  const THICK = 40;                   // épaisseur d'une pièce en profondeur
  const DEPTH_Y = 0.45;               // décalage écran (px) par unité de profondeur
  const PUSH = 17;                    // force de poussée d'une balle (divisée par la masse de la pièce)
  const SLIDE_FRICTION = 0.94;

  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  let DPR = 2;
  let levelRows = 5;

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
    PLATFORM_Y = Math.round(Math.max(Math.min(H * 0.5, H - 290), levelRows * CUBE + 125));
    PLATFORM_Y = Math.min(PLATFORM_Y, H - 250);
    cs = Math.max(0.6, Math.min(1, (H - PLATFORM_Y - 150) / 230));
    MUZZLE = 178 * cs;
  }

  let techs = {};            // key -> { name, color, img }
  let engine, platform, cubes, shots, ghosts, particles;
  let platformW = 300, loopId = 0;
  let level = null, ballsLeft = 0, running = false, finished = false;
  let cannonX = W / 2;                     // canon fixe au centre
  let aim = 0, target = null;              // aim = angle (rad) par rapport à la verticale ; target = point visé (écran)
  let aiming = false, lastShot = 0, settleTimer = 0, shake = 0, time = 0;
  let callbacks = {};
  let acc = 0, prev = 0, flash = 0, comboCount = 0, comboTime = 0, comboX = W / 2, comboY = 400, recoil = 0;
  const PALETTE = ['#ffd23f', '#ff3fa4', '#5fd4ff', '#fff3a0'];

  // --- chargement des logos (SVG -> blob avec taille explicite, compatible canvas partout) ---
  async function loadTechs(list) {
    await Promise.all(list.map(async (t) => {
      let svg = await (await fetch(`assets/tech/${t.key}.svg`)).text();
      if (!/<svg[^>]*\swidth=/.test(svg)) svg = svg.replace('<svg', '<svg width="128" height="128"');
      const img = new Image();
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      await new Promise((ok) => { img.onload = ok; img.onerror = ok; img.src = url; });
      techs[t.key] = { ...t, img };
    }));
  }

  function tintColor(hex, amt) { // amt>0 éclaircit, <0 assombrit
    const n = parseInt(hex.slice(1), 16);
    const f = (c) => Math.max(0, Math.min(255, Math.round(amt > 0 ? c + (255 - c) * amt : c * (1 + amt))));
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
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
    cubes = []; shots = []; ghosts = []; particles = [];
    ballsLeft = lvl.balls; lastShot = -1000; finished = false; settleTimer = 0; aiming = false; shake = 0; flash = 0; comboCount = 0;
    aim = 0; target = null;

    const { pieces, rows, cols } = piecesOf(lvl);
    levelRows = rows; layout();
    platformW = Math.max(250, cols * CUBE + 36);
    platform = Bodies.rectangle(W / 2, PLATFORM_Y + PLATFORM_H / 2, platformW, PLATFORM_H, { isStatic: true, friction: 1, restitution: 0, collisionFilter: { category: 0x0002, mask: 0x001C } });
    Composite.add(engine.world, platform);

    const x0 = W / 2 - cols * CUBE / 2;
    pieces.forEach((p) => {
      const bottom = PLATFORM_Y - (rows - (p.row + p.h)) * CUBE;       // bord bas de la pièce
      const body = Bodies.rectangle(x0 + (p.col + p.w / 2) * CUBE, bottom - p.h * CUBE / 2 - 0.5, p.w * CUBE - 1.5, p.h * CUBE - 1.5, {
        chamfer: { radius: 7 }, friction: 0.5, frictionStatic: 0.8, restitution: 0.05,
        density: 0.0025 * (lvl.cubeWeight || 1), sleepThreshold: 40, slop: 0.04,
      });
      body.tech = techs[p.tech]; body.isCube = true;
      body.pw = p.w; body.ph = p.h;
      body.pmass = p.w * p.h * (lvl.cubeWeight || 1);
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
  function emitStatus() { callbacks.status && callbacks.status({ balls: ballsLeft, cubes: cubes.length }); }

  // --- visée ---
  const muzzle = () => ({ x: cannonX + Math.sin(aim) * MUZZLE, y: CANNON_Y - Math.cos(aim) * MUZZLE });
  const visY = (c) => c.position.y - c.z * DEPTH_Y;       // position écran d'une pièce (tient compte de la profondeur)

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
    const d = Math.hypot(t.x - m.x, t.y - m.y) || 1;
    shots.push({ x: m.x, y: m.y, sx: m.x, sy: m.y, tx: t.x, ty: t.y, vx: (t.x - m.x) / d * BALL_SPEED, vy: (t.y - m.y) / d * BALL_SPEED, total: d, trail: [] });
    recoil = 1; shake = Math.max(shake, 4);
    burst(m.x, m.y, '#ffd23f', 10);
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
    push(c, 1, s.vx, new Set());
  }

  function push(c, factor, bvx, seen) {
    if (seen.has(c) || factor < 0.3) return;
    seen.add(c);
    c.vz += PUSH * factor / c.pmass;
    Sleeping.set(c, false);
    Body.setVelocity(c, { x: c.velocity.x + bvx * 0.1 * factor / c.pmass, y: c.velocity.y - 1 * factor / c.pmass });
    const top = c.position.y - c.ph * CUBE / 2;
    for (const o of cubes) {         // pièces posées dessus
      if (o === c) continue;
      const oBottom = o.position.y + o.ph * CUBE / 2;
      if (Math.abs(oBottom - top) < 6 && Math.abs(o.position.x - c.position.x) < (o.pw + c.pw) * CUBE / 2 - 4) push(o, factor * 0.8, bvx, seen);
    }
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

  function destroyed(c, x, y) {
    burst(Math.max(20, Math.min(W - 20, x)), Math.min(y, H - 40), c.tech.color, 14);
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

    // une pièce poussée vers le fond heurte celle qui est derrière elle et la fait tomber d'abord
    for (const a of cubes) {
      if (a.vz < 0.3) continue;
      for (const b of cubes) {
        if (b === a || b.z <= a.z || a.z + THICK <= b.z - 4 || a.z + THICK > b.z + THICK) continue;
        if (Math.abs(a.position.x - b.position.x) >= (a.pw + b.pw) * CUBE / 2 - 6 || Math.abs(a.position.y - b.position.y) >= (a.ph + b.ph) * CUBE / 2 - 6) continue;
        b.vz = Math.max(b.vz, a.vz * 1.5 * a.pmass / (a.pmass + b.pmass));
        a.vz *= 0.4;
        Sleeping.set(b, false);
        callbacks.sfx && callbacks.sfx('hit');
      }
    }
    // garde-fou : aucune pièce ne reste immobile en l'air
    if (Math.floor(time / 16.7) % 20 === 0) for (const c of cubes) if (c.isSleeping && !isSupported(c)) Sleeping.set(c, false);

    // pièces : glissement en profondeur, chute derrière la table, chute sur les côtés
    for (let i = cubes.length - 1; i >= 0; i--) {
      const c = cubes[i];
      if (c.vz > 0 || c.z > 0) {
        c.z += c.vz; c.vz *= SLIDE_FRICTION; if (c.vz < 0.12) c.vz = 0;
        if (c.z > DEPTH) {
          const sc = 1 - c.z * 0.0015;
          ghosts.push({ tech: c.tech, pw: c.pw, ph: c.ph, x: c.position.x, y: visY(c), vx: c.velocity.x * 0.5, vy: -2.5, rot: c.angle, vr: (Math.random() - .5) * 0.1, sc, life: 1 });
          destroyed(c, c.position.x, PLATFORM_Y - 20);
          continue;
        }
      }
      if (c.position.y > PLATFORM_Y + 170 || c.position.x < -80 || c.position.x > W + 80) destroyed(c, c.position.x, c.position.y);
    }
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const g = ghosts[i];
      g.x += g.vx; g.y += g.vy; g.vy += 0.55; g.rot += g.vr; g.sc *= 0.992;
      if (g.y > PLATFORM_Y + 30) g.life -= 0.07;
      if (g.life <= 0) ghosts.splice(i, 1);
    }
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
    [...cubes].sort((a, b) => b.z - a.z).forEach((c) => drawPiece(c.tech, c.pw, c.ph, c.position.x, visY(c), c.angle, 1 - c.z * 0.0015, Math.min(0.3, c.z / 300)));
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

  function drawBackground() {
    const GROUND = PLATFORM_Y + 150, dy = GROUND - 710;
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, '#0f0a52'); sky.addColorStop(.55, '#3a2bc0'); sky.addColorStop(1, '#b03fd0');
    ctx.fillStyle = sky; ctx.fillRect(-20, -20, W + 40, H + 40);
    const halo = ctx.createRadialGradient(W / 2, PLATFORM_Y - 140, 20, W / 2, PLATFORM_Y - 140, 330);
    halo.addColorStop(0, 'rgba(255,210,63,.35)'); halo.addColorStop(.5, 'rgba(255,63,164,.18)'); halo.addColorStop(1, 'rgba(255,63,164,0)');
    ctx.fillStyle = halo; ctx.fillRect(0, 60, W, GROUND);
    ctx.save(); ctx.translate(W / 2, PLATFORM_Y - 140); ctx.rotate(time * 0.00006);
    ctx.fillStyle = 'rgba(255,255,255,.045)';
    for (let i = 0; i < 10; i++) { ctx.rotate(Math.PI / 5); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-60, -700); ctx.lineTo(60, -700); ctx.fill(); }
    ctx.restore();
    STARS.forEach((s) => {
      const a = 0.45 + 0.55 * Math.sin(time * 0.003 + s.p);
      ctx.globalAlpha = a; ctx.fillStyle = s.c;
      if (s.r > 2) { drawStar(s.x, s.y, s.r * 2.6, 0); ctx.fill(); } else { ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill(); }
    });
    ctx.globalAlpha = 1;
    ctx.save(); ctx.translate(0, dy);
    ctx.fillStyle = 'rgba(255,243,160,.95)'; ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 40;
    ctx.beginPath(); ctx.arc(W - 85, 235 - dy, 26, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = '#2a1280';
    ctx.beginPath(); ctx.moveTo(0, 700); ctx.lineTo(0, 620); ctx.lineTo(40, 620); ctx.lineTo(40, 575); ctx.lineTo(55, 545); ctx.lineTo(70, 575); ctx.lineTo(70, 610); ctx.lineTo(110, 610); ctx.lineTo(110, 640); ctx.lineTo(170, 640); ctx.lineTo(170, 700); ctx.fill();
    ctx.save(); ctx.translate(W - 540, 0);
    ctx.beginPath(); ctx.moveTo(380, 700); ctx.lineTo(380, 625); ctx.lineTo(420, 625); ctx.lineTo(420, 560); ctx.lineTo(440, 525); ctx.lineTo(460, 560); ctx.lineTo(460, 600); ctx.lineTo(500, 600); ctx.lineTo(500, 640); ctx.lineTo(540, 640); ctx.lineTo(540, 700); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#4a1a9a'; ctx.beginPath(); ctx.ellipse(110, 720, 330, 110, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#5f22b8'; ctx.beginPath(); ctx.ellipse(W - 90, 730, 330, 95, 0, Math.PI, 0); ctx.fill();
    const ground = ctx.createLinearGradient(0, 710, 0, H - dy);
    ground.addColorStop(0, '#7a2cff'); ground.addColorStop(.35, '#4b1fb0'); ground.addColorStop(1, '#1c0d66');
    ctx.fillStyle = ground; ctx.fillRect(-20, 710, W + 40, H + 600);
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(-20, 708, W + 40, 5);
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(-20, 713, W + 40, 3);
    ctx.restore();
  }

  function drawPedestal() {
    const cx = W / 2, px = cx - platformW / 2, back = DEPTH * DEPTH_Y;
    const pg = ctx.createLinearGradient(cx - 24, 0, cx + 24, 0);
    pg.addColorStop(0, '#5a2bd8'); pg.addColorStop(.5, '#a56bff'); pg.addColorStop(1, '#3a1590');
    ctx.fillStyle = pg; ctx.fillRect(cx - 24, PLATFORM_Y + PLATFORM_H, 48, 110);
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(cx - 32, PLATFORM_Y + 52, 64, 9); ctx.fillRect(cx - 32, PLATFORM_Y + 112, 64, 10);
    ctx.fillStyle = '#3b0a6e'; ctx.beginPath(); ctx.ellipse(cx, PLATFORM_Y + 142, 62, 24, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.ellipse(cx, PLATFORM_Y + 135, 62, 22, 0, Math.PI, 0); ctx.fill();
    ctx.save(); ctx.translate(cx, PLATFORM_Y + 90); ctx.fillStyle = '#ff3fa4'; ctx.shadowColor = '#ff3fa4'; ctx.shadowBlur = 14 + 6 * Math.sin(time * 0.005);
    ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(9, 0); ctx.lineTo(0, 11); ctx.lineTo(-9, 0); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(cx, PLATFORM_Y + 158, 130, 18, 0, 0, 7); ctx.fill();
    // dessus du plateau (profondeur visible : les pièces glissent dessus avant de tomber derrière)
    const top = ctx.createLinearGradient(0, PLATFORM_Y - back, 0, PLATFORM_Y);
    top.addColorStop(0, '#c98a00'); top.addColorStop(1, '#ffe98a');
    ctx.fillStyle = top; ctx.beginPath(); ctx.moveTo(px, PLATFORM_Y); ctx.lineTo(px + platformW, PLATFORM_Y); ctx.lineTo(px + platformW - 16, PLATFORM_Y - back); ctx.lineTo(px + 16, PLATFORM_Y - back); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#3b0a6e'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = 'rgba(255,63,164,.22)'; ctx.fillRect(px + 30, PLATFORM_Y - back / 2 - 2, platformW - 60, 4);
    // bord avant
    const tg = ctx.createLinearGradient(0, PLATFORM_Y, 0, PLATFORM_Y + PLATFORM_H);
    tg.addColorStop(0, '#fff3a0'); tg.addColorStop(.35, '#ffd23f'); tg.addColorStop(1, '#c97900');
    ctx.fillStyle = tg; ctx.beginPath(); ctx.roundRect(px, PLATFORM_Y, platformW, PLATFORM_H, [2, 2, 14, 14]); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff3fa4';
    for (let x = px + 24; x < px + platformW - 12; x += 48) { ctx.beginPath(); ctx.moveTo(x, PLATFORM_Y + 9); ctx.lineTo(x + 6, PLATFORM_Y + 4); ctx.lineTo(x + 12, PLATFORM_Y + 9); ctx.lineTo(x + 6, PLATFORM_Y + 14); ctx.fill(); }
  }

  // pièce de taille pw x ph (en cubes) : carrés, rectangles larges, hauts...
  function drawPiece(t, pw, ph, x, y, angle, sc, dark) {
    if (!t) return;
    const w = pw * CUBE - 2, h = ph * CUBE - 2;
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(sc, sc);
    ctx.shadowColor = t.color; ctx.shadowBlur = 14;
    ctx.fillStyle = '#3b0a6e'; ctx.beginPath(); ctx.roundRect(-w / 2 - 2, -h / 2 - 1, w + 4, h + 6, 12); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = tintColor(t.color, -0.35); ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2 + 3, w, h, 10); ctx.fill();
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, tintColor(t.color, 0.45)); g.addColorStop(1, tintColor(t.color, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h - 3, 10); ctx.fill();
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fffbea'; ctx.beginPath(); ctx.roundRect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 15, 7); ctx.fill();
    // logo : un seul, centré (ou répété sur les très larges pièces)
    const ls = Math.min(CUBE, w, h) - 20, n = pw >= 3 ? 2 : 1;
    if (t.img && t.img.complete) for (let i = 0; i < n; i++) ctx.drawImage(t.img, (n === 2 ? (i ? 1 : -1) * w / 4 : 0) - ls / 2, -ls / 2 - 1, ls, ls);
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.roundRect(-w / 2 + 5, -h / 2 + 3, 16, 4, 2); ctx.fill();
    if (dark) { ctx.fillStyle = `rgba(20,5,60,${dark})`; ctx.beginPath(); ctx.roundRect(-w / 2 - 2, -h / 2 - 1, w + 4, h + 6, 12); ctx.fill(); }
    ctx.restore();
  }

  // trajectoire en perspective : la balle rapetisse en s'éloignant
  function drawShot(s) {
    const prog = Math.min(1, Math.hypot(s.x - s.sx, s.y - s.sy) / s.total), sc = 1 - 0.45 * prog;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    s.trail.forEach((p, i) => { ctx.globalAlpha = i / s.trail.length * 0.5; ctx.fillStyle = i % 2 ? '#ff3fa4' : '#ffd23f'; ctx.beginPath(); ctx.arc(p.x, p.y, BALL_R * sc * (i / s.trail.length), 0, 7); ctx.fill(); });
    ctx.restore();
    ctx.save(); ctx.translate(s.x, s.y);
    ctx.shadowColor = '#ff3fa4'; ctx.shadowBlur = 20;
    const r = BALL_R * sc, g = ctx.createRadialGradient(-r / 3, -r / 3, 1, 0, 0, r + 2);
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
    ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 8;
    for (let i = 1; i < n; i++) {
      const k = i / n, pulse = 1 + 0.3 * Math.sin(time * 0.012 - i * 0.6);
      ctx.globalAlpha = 0.95 - k * 0.45; ctx.fillStyle = i % 2 ? '#fff3a0' : '#ff9ad6';
      ctx.beginPath(); ctx.arc(m.x + (t.x - m.x) * k, m.y + (t.y - m.y) * k, (5.5 - 2.5 * k) * pulse, 0, 7); ctx.fill();
    }
    // réticule sur la cible
    const c = cubeAt(t.x, t.y), r = 16 + 3 * Math.sin(time * 0.01);
    ctx.globalAlpha = 1; ctx.shadowBlur = 12; ctx.strokeStyle = c ? '#ff3fa4' : 'rgba(255,255,255,.7)'; ctx.lineWidth = 3;
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
    get ballsLeft() { return ballsLeft; }, get cubesLeft() { return cubes ? cubes.length : 0; },
    // aide au debug / tests automatiques
    _debug: () => ({ cubes, shots, ballsLeft, finished, aim, time }),
    _advance(ms) { for (let t = 0; t < ms; t += 1000 / 60) step(1000 / 60); render(); },
  };
})();
