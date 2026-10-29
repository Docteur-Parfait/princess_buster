// Moteur du jeu : physique (Matter.js) + rendu canvas. Aucune dépendance vers l'interface (voir ui.js).
const Game = (() => {
  const { Engine, Bodies, Body, Composite, Events, Sleeping } = Matter;

  const W = 540, H = 960;
  const CUBE = 60;
  const PLATFORM_Y = 560;            // surface supérieure de la table
  const PLATFORM_H = 18;
  const CANNON_Y = 880;
  const BALL_R = 15, BALL_SPEED = 27;
  const MAX_ANGLE = 78 * Math.PI / 180;   // écart max par rapport à la verticale
  const FIRE_COOLDOWN = 320;

  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const DPR = 2;
  canvas.width = W * DPR; canvas.height = H * DPR;

  let techs = {};            // key -> { name, color, img }
  let engine, platform, cubes, balls, particles;
  let platformW = 300, loopId = 0;
  let level = null, ballsLeft = 0, running = false, finished = false;
  let cannonX = W / 2, aim = 0;            // aim = angle (rad) par rapport à la verticale, + = droite
  let aiming = false, lastShot = 0, settleTimer = 0, shake = 0, time = 0, lastHitSfx = 0;
  let callbacks = {};
  let acc = 0, prev = 0, flash = 0, comboCount = 0, comboTime = 0, comboX = W / 2, comboY = 400;
  const clouds = [{ x: 90, y: 150, s: 1 }, { x: 380, y: 90, s: 1.3 }, { x: 250, y: 300, s: .8 }];

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

  // --- niveau ---
  function start(lvl, cb) {
    callbacks = cb || {};
    level = lvl;
    engine = Engine.create({ enableSleeping: true, positionIterations: 12, velocityIterations: 8 });
    engine.gravity.y = 1.1;
    cubes = []; balls = []; particles = [];
    ballsLeft = lvl.balls; lastShot = -1000; finished = false; settleTimer = 0; aiming = false; shake = 0;
    cannonX = W / 2; aim = 0;

    const rows = lvl.grid.map((r) => r.trim().split(/\s+/));
    const cols = Math.max(...rows.map((r) => r.length));
    platformW = Math.max(250, cols * CUBE + 36);
    platform = Bodies.rectangle(W / 2, PLATFORM_Y + PLATFORM_H / 2, platformW, PLATFORM_H, { isStatic: true, friction: 1, restitution: 0, collisionFilter: { category: 0x0002, mask: 0x0001 } });
    Composite.add(engine.world, platform);

    const x0 = W / 2 - cols * CUBE / 2 + CUBE / 2;
    rows.forEach((row, r) => row.forEach((key, c) => {
      if (key === '.') return;
      const y = PLATFORM_Y - CUBE / 2 - (rows.length - 1 - r) * CUBE - 0.5;
      const body = Bodies.rectangle(x0 + c * CUBE, y, CUBE - 1.5, CUBE - 1.5, {
        chamfer: { radius: 7 }, friction: 0.5, frictionStatic: 0.8, restitution: 0.05,
        density: 0.0025 * (lvl.cubeWeight || 1), sleepThreshold: 40, slop: 0.04,
      });
      body.tech = techs[key]; body.isCube = true;
      Sleeping.set(body, true);
      cubes.push(body); Composite.add(engine.world, body);
    }));

    Events.on(engine, 'collisionStart', (e) => {
      for (const p of e.pairs) {
        const a = p.bodyA, b = p.bodyB;
        const ball = a.isBall ? a : b.isBall ? b : null;
        const other = ball === a ? b : a;
        if (ball && other.isCube && time - lastHitSfx > 60) {
          lastHitSfx = time; shake = Math.min(8, shake + 3); callbacks.sfx && callbacks.sfx('hit');
          burst(ball.position.x, ball.position.y, other.tech ? other.tech.color : '#fff', 6);
        }
      }
    });

    running = true; prev = performance.now(); acc = 0; time = 0;
    const id = ++loopId;
    const tick = (now) => { if (!running || id !== loopId) return; loop(now); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    emitStatus();
  }

  function stop() { running = false; }

  function emitStatus() { callbacks.status && callbacks.status({ balls: ballsLeft, cubes: cubes.length }); }

  // --- tir ---
  function canFire() { return running && !finished && ballsLeft > 0 && time - lastShot > FIRE_COOLDOWN; }

  function fire() {
    if (!canFire()) return;
    lastShot = time; ballsLeft--;
    const len = 78;
    const x = cannonX + Math.sin(aim) * len, y = CANNON_Y - Math.cos(aim) * len;
    const ball = Bodies.circle(x, y, BALL_R, { restitution: 0.25, friction: 0.4, frictionAir: 0, density: 0.03, label: 'ball', sleepThreshold: Infinity, collisionFilter: { category: 0x0004, mask: 0x0001 } });
    ball.isBall = true; ball.born = time;
    Body.setVelocity(ball, { x: Math.sin(aim) * BALL_SPEED, y: -Math.cos(aim) * BALL_SPEED });
    balls.push(ball); Composite.add(engine.world, ball);
    cannonRecoil = 1; shake = Math.max(shake, 4);
    burst(x, y, '#ffd54a', 8);
    callbacks.sfx && callbacks.sfx('shoot');
    emitStatus();
  }
  let cannonRecoil = 0;

  function setAimToward(px, py) {
    const dx = px - cannonX, dy = CANNON_Y - py;
    aim = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, Math.atan2(dx, Math.max(dy, 1))));
  }
  function moveCannon(dx) { cannonX = Math.max(70, Math.min(W - 70, cannonX + dx)); }
  function rotate(da) { aim = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, aim + da)); }

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

  function step(dt) {
    time += dt;
    Engine.update(engine, dt);

    // cubes tombés de la table (ou sortis de l'écran) = détruits
    for (let i = cubes.length - 1; i >= 0; i--) {
      const c = cubes[i];
      if (c.position.y > PLATFORM_Y + 170 || c.position.x < -60 || c.position.x > W + 60) {
        burst(Math.max(20, Math.min(W - 20, c.position.x)), Math.min(c.position.y, H - 40), c.tech.color, 12);
        Composite.remove(engine.world, c); cubes.splice(i, 1);
        callbacks.sfx && callbacks.sfx('break');
        comboCount++; comboTime = time; comboX = Math.max(80, Math.min(W - 80, c.position.x)); comboY = Math.min(c.position.y, PLATFORM_Y + 100);
        emitStatus();
      }
    }
    // balles : retirées quand elles sortent, s'arrêtent ou vivent trop longtemps
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i], age = time - b.born;
      const slow = age > 1500 && Math.hypot(b.velocity.x, b.velocity.y) < 0.6;
      if (b.position.y > H + 60 || b.position.x < -60 || b.position.x > W + 60 || b.position.y < -80 || age > 6000 || slow) {
        Composite.remove(engine.world, b); balls.splice(i, 1);
      }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.22; p.life -= 0.03;
      if (p.life <= 0) particles.splice(i, 1);
    }
    shake *= 0.85; cannonRecoil *= 0.9; flash *= 0.9;
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
      if (settleTimer > 500) end(true);
      return;
    }
    // défaite : plus de balles, plus aucune balle en vol, cubes immobiles
    if (ballsLeft === 0 && balls.length === 0) {
      const moving = cubes.some((c) => !c.isSleeping && Math.hypot(c.velocity.x, c.velocity.y) > 0.25);
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
  const STARS = Array.from({ length: 70 }, (_, i) => ({ x: (i * 97.3) % W, y: (i * 61.7) % 640, r: 0.8 + (i % 4) * 0.6, p: i * 0.9, c: i % 5 === 0 ? '#ffd23f' : i % 7 === 0 ? '#5fd4ff' : '#fff' }));
  const PALETTE = ['#ffd23f', '#ff3fa4', '#5fd4ff', '#fff3a0'];

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const sx = (Math.random() - .5) * shake, sy = (Math.random() - .5) * shake;
    ctx.save(); ctx.translate(sx, sy);
    drawBackground();
    drawPedestal();
    cubes.forEach(drawCube);
    drawCannon();
    if (aiming || (running && !finished && ballsLeft > 0)) drawAimGuide();
    balls.forEach(drawBall);
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

  function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, 700);
    sky.addColorStop(0, '#0f0a52'); sky.addColorStop(.55, '#3a2bc0'); sky.addColorStop(1, '#b03fd0');
    ctx.fillStyle = sky; ctx.fillRect(-20, -20, W + 40, H + 40);
    // halo magique derrière la pile
    const halo = ctx.createRadialGradient(W / 2, 420, 20, W / 2, 420, 330);
    halo.addColorStop(0, 'rgba(255,210,63,.35)'); halo.addColorStop(.5, 'rgba(255,63,164,.18)'); halo.addColorStop(1, 'rgba(255,63,164,0)');
    ctx.fillStyle = halo; ctx.fillRect(0, 60, W, 700);
    // rayons tournants
    ctx.save(); ctx.translate(W / 2, 420); ctx.rotate(time * 0.00006);
    ctx.fillStyle = 'rgba(255,255,255,.045)';
    for (let i = 0; i < 10; i++) { ctx.rotate(Math.PI / 5); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-60, -700); ctx.lineTo(60, -700); ctx.fill(); }
    ctx.restore();
    // étoiles qui scintillent
    STARS.forEach((s) => {
      const a = 0.45 + 0.55 * Math.sin(time * 0.003 + s.p);
      ctx.globalAlpha = a; ctx.fillStyle = s.c;
      if (s.r > 2) { drawStar(s.x, s.y, s.r * 2.6, 0); ctx.fill(); } else { ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill(); }
    });
    ctx.globalAlpha = 1;
    // lune dorée
    ctx.fillStyle = 'rgba(255,243,160,.95)'; ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 40;
    ctx.beginPath(); ctx.arc(455, 235, 26, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    // silhouette de château au loin
    ctx.fillStyle = '#2a1280';
    ctx.beginPath(); ctx.moveTo(0, 700); ctx.lineTo(0, 620); ctx.lineTo(40, 620); ctx.lineTo(40, 575); ctx.lineTo(55, 545); ctx.lineTo(70, 575); ctx.lineTo(70, 610); ctx.lineTo(110, 610); ctx.lineTo(110, 640); ctx.lineTo(170, 640); ctx.lineTo(170, 700); ctx.fill();
    ctx.beginPath(); ctx.moveTo(380, 700); ctx.lineTo(380, 625); ctx.lineTo(420, 625); ctx.lineTo(420, 560); ctx.lineTo(440, 525); ctx.lineTo(460, 560); ctx.lineTo(460, 600); ctx.lineTo(500, 600); ctx.lineTo(500, 640); ctx.lineTo(540, 640); ctx.lineTo(540, 700); ctx.fill();
    // collines violettes + sol brillant
    ctx.fillStyle = '#4a1a9a'; ctx.beginPath(); ctx.ellipse(110, 720, 330, 110, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#5f22b8'; ctx.beginPath(); ctx.ellipse(450, 730, 330, 95, 0, Math.PI, 0); ctx.fill();
    const ground = ctx.createLinearGradient(0, 710, 0, H);
    ground.addColorStop(0, '#7a2cff'); ground.addColorStop(.35, '#4b1fb0'); ground.addColorStop(1, '#1c0d66');
    ctx.fillStyle = ground; ctx.fillRect(-20, 710, W + 40, H);
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(-20, 708, W + 40, 5);
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(-20, 713, W + 40, 3);
  }

  function drawPedestal() {
    const cx = W / 2, px = cx - platformW / 2;
    // pied violet/or
    const pg = ctx.createLinearGradient(cx - 24, 0, cx + 24, 0);
    pg.addColorStop(0, '#5a2bd8'); pg.addColorStop(.5, '#a56bff'); pg.addColorStop(1, '#3a1590');
    ctx.fillStyle = pg; ctx.fillRect(cx - 24, PLATFORM_Y + PLATFORM_H, 48, 110);
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(cx - 32, PLATFORM_Y + 52, 64, 9); ctx.fillRect(cx - 32, PLATFORM_Y + 112, 64, 10);
    // socle
    ctx.fillStyle = '#3b0a6e'; ctx.beginPath(); ctx.ellipse(cx, PLATFORM_Y + 142, 62, 24, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.ellipse(cx, PLATFORM_Y + 135, 62, 22, 0, Math.PI, 0); ctx.fill();
    // joyau
    ctx.save(); ctx.translate(cx, PLATFORM_Y + 90); ctx.fillStyle = '#ff3fa4'; ctx.shadowColor = '#ff3fa4'; ctx.shadowBlur = 14 + 6 * Math.sin(time * 0.005);
    ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(9, 0); ctx.lineTo(0, 11); ctx.lineTo(-9, 0); ctx.closePath(); ctx.fill(); ctx.restore();
    // ombre
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(cx, PLATFORM_Y + 158, 130, 18, 0, 0, 7); ctx.fill();
    // plateau or + violet, avec reflets
    const tg = ctx.createLinearGradient(0, PLATFORM_Y, 0, PLATFORM_Y + PLATFORM_H);
    tg.addColorStop(0, '#fff3a0'); tg.addColorStop(.35, '#ffd23f'); tg.addColorStop(1, '#c97900');
    ctx.fillStyle = tg; ctx.beginPath(); ctx.roundRect(px, PLATFORM_Y, platformW, PLATFORM_H, [4, 4, 14, 14]); ctx.fill();
    ctx.strokeStyle = '#3b0a6e'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#ff3fa4';
    for (let x = px + 24; x < px + platformW - 12; x += 48) { ctx.beginPath(); ctx.moveTo(x, PLATFORM_Y + 9); ctx.lineTo(x + 6, PLATFORM_Y + 4); ctx.lineTo(x + 12, PLATFORM_Y + 9); ctx.lineTo(x + 6, PLATFORM_Y + 14); ctx.fill(); }
  }

  function drawCube(b) {
    const t = b.tech; if (!t) return;
    const s = CUBE - 2;
    ctx.save(); ctx.translate(b.position.x, b.position.y); ctx.rotate(b.angle);
    // halo coloré
    ctx.shadowColor = t.color; ctx.shadowBlur = 14;
    ctx.fillStyle = '#3b0a6e'; ctx.beginPath(); ctx.roundRect(-s / 2 - 2, -s / 2 - 1, s + 4, s + 6, 12); ctx.fill();   // contour violet
    ctx.shadowBlur = 0;
    ctx.fillStyle = tintColor(t.color, -0.35); ctx.beginPath(); ctx.roundRect(-s / 2, -s / 2 + 3, s, s, 10); ctx.fill();   // épaisseur
    const g = ctx.createLinearGradient(0, -s / 2, 0, s / 2);
    g.addColorStop(0, tintColor(t.color, 0.45)); g.addColorStop(1, tintColor(t.color, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(-s / 2, -s / 2, s, s - 3, 10); ctx.fill();
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fffbea'; ctx.beginPath(); ctx.roundRect(-s / 2 + 6, -s / 2 + 6, s - 12, s - 15, 7); ctx.fill();
    if (t.img && t.img.complete) ctx.drawImage(t.img, -s / 2 + 10, -s / 2 + 9, s - 20, s - 21);
    // reflet
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.roundRect(-s / 2 + 5, -s / 2 + 3, 16, 4, 2); ctx.fill();
    ctx.restore();
  }

  function drawBall(b) {
    // traînée lumineuse
    b.trail = b.trail || [];
    b.trail.push({ x: b.position.x, y: b.position.y }); if (b.trail.length > 10) b.trail.shift();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    b.trail.forEach((p, i) => { ctx.globalAlpha = i / b.trail.length * 0.5; ctx.fillStyle = i % 2 ? '#ff3fa4' : '#ffd23f'; ctx.beginPath(); ctx.arc(p.x, p.y, BALL_R * (i / b.trail.length), 0, 7); ctx.fill(); });
    ctx.restore();
    ctx.save(); ctx.translate(b.position.x, b.position.y); ctx.rotate(b.angle);
    ctx.shadowColor = '#ff3fa4'; ctx.shadowBlur = 20;
    const g = ctx.createRadialGradient(-5, -5, 1, 0, 0, BALL_R + 2);
    g.addColorStop(0, '#fff'); g.addColorStop(.3, '#ff9ad6'); g.addColorStop(.7, '#ff3fa4'); g.addColorStop(1, '#b0126b');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, BALL_R, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, BALL_R - 1.5, 0, 7); ctx.stroke();
    ctx.fillStyle = '#fff3a0'; drawStar(0, 0, 6, 0); ctx.fill();
    ctx.restore();
  }

  function drawAimGuide() {
    if (finished || ballsLeft === 0) return;
    let x = cannonX + Math.sin(aim) * 78, y = CANNON_Y - Math.cos(aim) * 78;
    let vx = Math.sin(aim) * BALL_SPEED, vy = -Math.cos(aim) * BALL_SPEED;
    const g = engine.gravity.y * engine.gravity.scale * (1000 / 60) ** 2;   // accélération par pas physique
    for (let i = 0; i < 70; i++) {
      x += vx; y += vy; vy += g;
      if (i % 2 === 0 && i > 1) {
        const pulse = 1 + 0.35 * Math.sin(time * 0.012 - i * 0.5);
        ctx.globalAlpha = Math.max(0.1, 1 - i / 75); ctx.fillStyle = i % 4 ? '#fff3a0' : '#ff9ad6';
        ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(x, y, 4.5 * pulse, 0, 7); ctx.fill();
      }
      if (y < PLATFORM_Y + 20 && cubes.some((c) => Math.abs(c.position.x - x) < CUBE / 2 + 6 && Math.abs(c.position.y - y) < CUBE / 2 + 6)) break;
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }

  function drawCannon() {
    ctx.save(); ctx.translate(cannonX, CANNON_Y + Math.sin(time * 0.004) * 1.5);
    // base dorée
    ctx.fillStyle = '#3b0a6e'; ctx.beginPath(); ctx.ellipse(0, 40, 88, 27, 0, 0, 7); ctx.fill();
    const bg = ctx.createLinearGradient(0, 14, 0, 56); bg.addColorStop(0, '#fff3a0'); bg.addColorStop(1, '#e09000');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(0, 34, 82, 23, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#7a2cff'; ctx.fillRect(-52, 8, 14, 38); ctx.fillRect(38, 8, 14, 38);
    ctx.rotate(aim); ctx.translate(0, cannonRecoil * 10);
    // fût violet
    const g = ctx.createLinearGradient(-36, 0, 36, 0);
    g.addColorStop(0, '#5a1fb8'); g.addColorStop(.35, '#b57bff'); g.addColorStop(1, '#3b0a8e');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-34, 30); ctx.lineTo(-27, -70); ctx.lineTo(27, -70); ctx.lineTo(34, 30); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#2a0654'; ctx.lineWidth = 4; ctx.stroke();
    // bandes or
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(-32, -30, 64, 7); ctx.fillRect(-33, 10, 66, 7);
    // bouche dorée
    const mg = ctx.createLinearGradient(0, -90, 0, -62); mg.addColorStop(0, '#fff3a0'); mg.addColorStop(1, '#e09000');
    ctx.fillStyle = mg; ctx.beginPath(); ctx.roundRect(-36, -86, 72, 24, 9); ctx.fill(); ctx.strokeStyle = '#3b0a6e'; ctx.stroke();
    ctx.fillStyle = '#12062e'; ctx.beginPath(); ctx.ellipse(0, -86, 28, 7, 0, 0, 7); ctx.fill();
    // joyau étoile magenta
    ctx.save(); ctx.shadowColor = '#ff3fa4'; ctx.shadowBlur = 12; ctx.fillStyle = '#ff3fa4'; ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3;
    drawStar(0, -8, 17, -Math.PI / 2 + Math.sin(time * 0.003) * 0.1); ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.restore();
  }

  return {
    W, H, loadTechs, start, stop, fire, moveCannon, rotate, setAimToward, canFire,
    get cannonX() { return cannonX; }, get cannonY() { return CANNON_Y; },
    set aiming(v) { aiming = v; }, get aiming() { return aiming; },
    get ballsLeft() { return ballsLeft; }, get cubesLeft() { return cubes ? cubes.length : 0; },
    // aide au debug / tests automatiques
    _debug: () => ({ cubes, balls, ballsLeft, finished, aim, time }),
    _advance(ms) { for (let t = 0; t < ms; t += 1000 / 60) step(1000 / 60); render(); },
  };
})();
