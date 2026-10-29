// Génère public/levels/levelNN.json + index.json  (node tools/generate-levels.js)
// Les niveaux sont ensuite éditables à la main : ce sont de simples fichiers JSON.
const fs = require('fs');
const path = require('path');

const TECHS = [
  { key: 'html5', name: 'HTML5', color: '#e44d26' },
  { key: 'css3', name: 'CSS3', color: '#2965f1' },
  { key: 'sass', name: 'Sass', color: '#cc6699' },
  { key: 'bootstrap', name: 'Bootstrap', color: '#7952b3' },
  { key: 'javascript', name: 'JavaScript', color: '#f7df1e' },
  { key: 'typescript', name: 'TypeScript', color: '#3178c6' },
  { key: 'jquery', name: 'jQuery', color: '#0769ad' },
  { key: 'tailwindcss', name: 'Tailwind CSS', color: '#38bdf8' },
  { key: 'php', name: 'PHP', color: '#777bb4' },
  { key: 'laravel', name: 'Laravel', color: '#ff2d20' },
  { key: 'nodejs', name: 'Node.js', color: '#6cc24a' },
  { key: 'express', name: 'Express', color: '#9ca3af' },
  { key: 'react', name: 'React', color: '#61dafb' },
  { key: 'vuejs', name: 'Vue.js', color: '#42b883' },
  { key: 'angular', name: 'Angular', color: '#dd0031' },
  { key: 'python', name: 'Python', color: '#3776ab' },
  { key: 'django', name: 'Django', color: '#44b78b' },
  { key: 'mysql', name: 'MySQL', color: '#f29111' },
  { key: 'mongodb', name: 'MongoDB', color: '#47a248' },
  { key: 'docker', name: 'Docker', color: '#2496ed' },
  { key: 'git', name: 'Git', color: '#f05032' },
];

// --- formes (rangées du haut vers le bas, 'x' = cube) -------------------------
const shapes = {
  wall: (w, h) => Array.from({ length: h }, () => 'x'.repeat(w)),
  pyramid: (w) => {
    const rows = [];
    for (let n = w % 2 ? 1 : 2; n <= w; n += 2) rows.push('x'.repeat(n).padStart((w + n) / 2, '.').padEnd(w, '.'));
    return rows;
  },
  stairs: (w, h) => Array.from({ length: h }, (_, i) => { const n = Math.min(i + 1, w); return '.'.repeat(w - n) + 'x'.repeat(n); }),
  columns: (w, h) => Array.from({ length: h }, () => Array.from({ length: w }, (_, i) => (i % 2 === 0 ? 'x' : '.')).join('')),
  checker: (w, h) => Array.from({ length: h }, (_, r) => Array.from({ length: w }, (_, i) => ((i + r) % 2 === 0 ? 'x' : '.')).join('')),
  arch: (w, h) => Array.from({ length: h }, (_, r) => (r === 0 ? 'x'.repeat(w) : 'x' + '.'.repeat(w - 2) + 'x')),
  tower: (w, h) => Array.from({ length: h }, () => '.'.repeat(Math.floor((w - 1) / 2)) + 'x' + '.'.repeat(Math.ceil((w - 1) / 2))),
  tower2: (w, h) => Array.from({ length: h }, () => '.'.repeat(Math.floor((w - 2) / 2)) + 'xx' + '.'.repeat(Math.ceil((w - 2) / 2))),
  letterH: (w, h) => Array.from({ length: h }, (_, r) => (r === Math.floor(h / 2) ? 'x'.repeat(w) : 'x' + '.'.repeat(w - 2) + 'x')),
  diamond: (w) => {
    const half = Math.ceil(w / 2), rows = [];
    for (let i = 1; i <= half; i++) { const n = i * 2 - 1; rows.push('x'.repeat(n).padStart((w + n) / 2 | 0, '.').padEnd(w, '.')); }
    for (let i = half - 1; i >= 1; i--) { const n = i * 2 - 1; rows.push('x'.repeat(n).padStart((w + n) / 2 | 0, '.').padEnd(w, '.')); }
    return rows;
  },
  twin: (w, h) => Array.from({ length: h }, (_, r) => { const a = Math.floor((w - 1) / 2); return 'x'.repeat(a) + '.' + 'x'.repeat(w - 1 - a); }),
  cross: (w, h) => Array.from({ length: h }, (_, r) => (r === 1 || r === Math.floor(h / 2) ? 'x'.repeat(w) : '.'.repeat(Math.floor(w / 2)) + 'x' + '.'.repeat(Math.ceil(w / 2) - 1))),
};

// niveau : [forme, largeur, hauteur]
const PLAN = [
  ['wall', 3, 3], ['pyramid', 5, 3], ['wall', 4, 4], ['columns', 5, 4], ['stairs', 5, 5],
  ['tower', 5, 6], ['arch', 5, 4], ['pyramid', 7, 4], ['checker', 6, 5], ['twin', 7, 4],
  ['letterH', 5, 5], ['diamond', 7, 4], ['tower2', 6, 6], ['wall', 6, 5], ['cross', 7, 5],
  ['columns', 7, 5], ['arch', 7, 6], ['checker', 7, 6], ['pyramid', 7, 6], ['wall', 7, 6],
];

// Aucun cube suspendu : chaque cube repose sur un cube (ou sur la table). Chaque colonne retombe vers le bas.
function dropToSupport(rows) {
  const cols = Math.max(...rows.map((r) => r.length));
  const out = rows.map(() => Array(cols).fill('.'));
  for (let c = 0; c < cols; c++) {
    let put = rows.length - 1;
    for (let r = rows.length - 1; r >= 0; r--) if (rows[r][c] === 'x') out[put--][c] = 'x';
  }
  return out.map((r) => r.join(''));
}

// pseudo-aléatoire déterministe
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

const outDir = path.join(__dirname, '..', 'public', 'levels');
fs.mkdirSync(outDir, { recursive: true });
const index = [];

// Remplit le masque avec des pièces de formats variés [largeur, hauteur] (carrés, rectangles larges, hautes...).
// On remplit de bas en haut : chaque pièce repose donc entièrement sur d'autres pièces ou sur la table.
function allowedSizes(id) {
  const sizes = [[1, 1, 4]];
  if (id >= 2) sizes.push([2, 1, 2]);
  if (id >= 4) sizes.push([1, 2, 2]);
  if (id >= 7) sizes.push([2, 2, 1.5]);
  if (id >= 10) sizes.push([3, 1, 1.5]);
  if (id >= 14) sizes.push([3, 2, 1]);
  return sizes;
}

function fillPieces(mask, id, rand) {
  const R = mask.length, C = Math.max(...mask.map((r) => r.length));
  const free = mask.map((r) => Array.from({ length: C }, (_, c) => r[c] === 'x'));
  const sizes = allowedSizes(id), pieces = [];
  for (let r = R - 1; r >= 0; r--) {
    for (let c = 0; c < C;) {
      if (!free[r][c]) { c++; continue; }
      const fits = ([w, h]) => {
        if (c + w > C || r - h + 1 < 0) return false;
        for (let y = r - h + 1; y <= r; y++) for (let x = c; x < c + w; x++) if (!free[y][x]) return false;
        return true;
      };
      const cand = sizes.filter(fits);
      let pick = rand() * cand.reduce((t, s2) => t + s2[2], 0), size = cand[0];
      for (const s2 of cand) { pick -= s2[2]; if (pick <= 0) { size = s2; break; } }
      const [w, h] = size;
      for (let y = r - h + 1; y <= r; y++) for (let x = c; x < c + w; x++) free[y][x] = false;
      pieces.push({ col: c, row: r - h + 1, w, h });
      c += w;
    }
  }
  return pieces;
}

// JSON lisible : une pièce par ligne
function formatLevel(l) {
  const { pieces, ...rest } = l;
  const head = JSON.stringify(rest, null, 2).slice(0, -2);
  return head + ',\n  "pieces": [\n' + pieces.map((p) => '    ' + JSON.stringify(p)).join(',\n') + '\n  ]\n}\n';
}

PLAN.forEach(([shape, w, h], i) => {
  const id = i + 1;
  const pool = TECHS.slice(0, Math.min(TECHS.length, id + 1)).map((t) => t.key);
  const newest = pool[pool.length - 1];
  const rand = rng(id * 7919);
  const mask = dropToSupport(shapes[shape](w, h));
  const cols = Math.max(...mask.map((r) => r.length));
  const pick = () => (rand() < 0.3 ? newest : pool[Math.floor(rand() * pool.length)]);

  // rangée devant (layer 0)
  let front = fillPieces(mask, id, rand).map((p) => ({ tech: pick(), layer: 0, ...p }));
  let rowsTotal = mask.length;

  // rangée(s) DERRIÈRE : à partir du niveau 5, des pièces cachées derrière les premières (il faut les faire tomber d'abord)
  let back = [];
  if (id >= 5) {
    const share = id < 10 ? 0.5 : id < 15 ? 0.75 : 1;
    const heights = Array.from({ length: cols }, (_, c) => mask.filter((r) => r[c] === 'x').length);
    const bh = heights.map((hh) => (hh > 0 && rand() < share ? hh : 0));
    rowsTotal = Math.max(rowsTotal, ...bh);
    const bmask = Array.from({ length: rowsTotal }, (_, r) => Array.from({ length: cols }, (_, c) => (rowsTotal - r <= bh[c] ? 'x' : '.')).join(''));
    back = fillPieces(bmask, id, rand).map((p) => ({ tech: pick(), layer: 1, ...p }));
  }
  front.forEach((p) => { p.row += rowsTotal - mask.length; });
  const pieces = [...front, ...back];
  pieces.sort((a, b) => a.layer - b.layer || a.row - b.row || a.col - b.col);
  const m = (list) => list.reduce((t, p) => t + Math.pow(p.w * p.h, 0.7), 0);
  const mass = m(front) + 0.8 * m(back);
  const balls = Math.max(5, Math.round(mass * Math.max(0.72, 0.9 - id * 0.008)) + 2);
  const level = {
    id,
    name: `Niveau ${id} - ${TECHS.find((t) => t.key === newest).name}`,
    newTech: newest,
    balls,
    cubeWeight: +(1 + id * 0.05).toFixed(2),
    techs: pool,
    rows: rowsTotal,
    cols,
    pieces,
  };
  fs.writeFileSync(path.join(outDir, `level${String(id).padStart(2, '0')}.json`), formatLevel(level));
  index.push({ id, file: `level${String(id).padStart(2, '0')}.json` });
  console.log(`niveau ${id}: ${shape} ${w}x${h} pièces=${pieces.length} (derrière ${back.length}) balles=${balls}`);
});

fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify({ techs: TECHS, levels: index }, null, 2));
