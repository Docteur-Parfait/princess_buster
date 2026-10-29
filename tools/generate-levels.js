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

PLAN.forEach(([shape, w, h], i) => {
  const id = i + 1;
  const pool = TECHS.slice(0, Math.min(TECHS.length, id + 1)).map((t) => t.key);
  const newest = pool[pool.length - 1];
  const rand = rng(id * 7919);
  let rows = shapes[shape](w, h);
  rows = dropToSupport(rows);
  const grid = rows.map((row) => [...row].map((c) => {
    if (c !== 'x') return '.';
    // la technologie « nouvelle » du niveau apparaît plus souvent
    return rand() < 0.3 ? newest : pool[Math.floor(rand() * pool.length)];
  }));
  const cubes = grid.flat().filter((c) => c !== '.').length;
  const ratio = Math.max(0.65, 1.0 - id * 0.014);
  const balls = Math.max(5, Math.round(cubes * ratio) + 1);
  const level = {
    id,
    name: `Niveau ${id} - ${TECHS.find((t) => t.key === newest).name}`,
    newTech: newest,
    balls,
    cubeWeight: +(1 + id * 0.04).toFixed(2),
    techs: pool,
    grid: grid.map((r) => r.join(' ')),
  };
  fs.writeFileSync(path.join(outDir, `level${String(id).padStart(2, '0')}.json`), JSON.stringify(level, null, 2));
  index.push({ id, file: `level${String(id).padStart(2, '0')}.json` });
  console.log(`niveau ${id}: ${shape} ${w}x${h} cubes=${cubes} balles=${balls}`);
});

fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify({ techs: TECHS, levels: index }, null, 2));
