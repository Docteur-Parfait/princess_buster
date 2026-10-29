// Couche de sauvegarde. Trois moteurs, mêmes données (players / progress) :
//  1. Tauri (APK, desktop) : vraie base SQLite locale via tauri-plugin-sql
//  2. Web : API SQLite du serveur de test (server/server.js)
//  3. Repli : localStorage si rien d'autre n'est disponible
const Storage = (() => {
  const KEY = 'pb_local_players';
  const tauri = window.__TAURI__ && window.__TAURI__.core ? window.__TAURI__.core : null;
  let player = null; // { id, name, progress: [{level,bestScore,attempts,completed}], offline }

  // ---------- 1. SQLite natif (Tauri) ----------
  const DB = 'sqlite:princess-buster.db';
  let dbReady = null;
  const exec = (query, values = []) => tauri.invoke('plugin:sql|execute', { db: DB, query, values });
  const select = (query, values = []) => tauri.invoke('plugin:sql|select', { db: DB, query, values });

  function openDb() {
    if (!dbReady) {
      dbReady = (async () => {
        await tauri.invoke('plugin:sql|load', { db: DB });
        await exec(`CREATE TABLE IF NOT EXISTS players (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE COLLATE NOCASE,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          last_played_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
        await exec(`CREATE TABLE IF NOT EXISTS progress (
          player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
          level INTEGER NOT NULL,
          best_score INTEGER NOT NULL DEFAULT 0,
          attempts INTEGER NOT NULL DEFAULT 0,
          completed INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (player_id, level))`);
      })().catch((e) => { dbReady = null; throw e; });
    }
    return dbReady;
  }

  async function sqlPlayer(name) {
    await openDb();
    await exec('INSERT OR IGNORE INTO players (name) VALUES ($1)', [name]);
    const [row] = await select('SELECT id, name FROM players WHERE name = $1', [name]);
    await exec('UPDATE players SET last_played_at = CURRENT_TIMESTAMP WHERE id = $1', [row.id]);
    return sqlProgress(row);
  }
  async function sqlProgress(row) {
    const progress = await select('SELECT level, best_score AS bestScore, attempts, completed FROM progress WHERE player_id = $1 ORDER BY level', [row.id]);
    return { id: row.id, name: row.name, progress, offline: false };
  }
  async function sqlSave(level, score, won) {
    await openDb();
    await exec(`INSERT INTO progress (player_id, level, best_score, attempts, completed) VALUES ($1, $2, $3, 1, $4)
      ON CONFLICT(player_id, level) DO UPDATE SET
        best_score = MAX(best_score, excluded.best_score),
        attempts = attempts + 1,
        completed = MAX(completed, excluded.completed),
        updated_at = CURRENT_TIMESTAMP`, [player.id, level, won ? Math.max(0, score | 0) : 0, won ? 1 : 0]);
    return sqlProgress({ id: player.id, name: player.name });
  }
  async function sqlLeaderboard() {
    await openDb();
    return select(`SELECT p.name, SUM(g.best_score) AS total, SUM(g.completed) AS levels
      FROM progress g JOIN players p ON p.id = g.player_id
      GROUP BY p.id ORDER BY total DESC, levels DESC LIMIT 10`);
  }

  // ---------- 2. API web ----------
  async function api(path, body) {
    const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
    if (!res.ok) throw new Error('API ' + res.status);
    return res.json();
  }

  // ---------- 3. localStorage ----------
  const readLocal = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
  const writeLocal = (db) => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* ignore */ } };

  async function login(name) {
    if (tauri) {
      try { player = await sqlPlayer(name); } catch (e) { console.warn('SQLite indisponible, repli localStorage', e); }
    } else {
      try { player = await api('/api/player', { name }); player.offline = false; } catch (e) { /* repli ci-dessous */ }
    }
    if (!player) {
      const db = readLocal();
      const key = name.toLowerCase();
      db[key] = db[key] || { id: 0, name, progress: [] };
      writeLocal(db);
      player = { ...db[key], offline: true };
    }
    try { localStorage.setItem('pb_last_name', player.name); } catch (e) { /* ignore */ }
    return player;
  }

  async function saveResult(level, score, won) {
    if (!player) return;
    if (!player.offline) {
      try {
        const p = tauri ? await sqlSave(level, score, won) : await api('/api/progress', { playerId: player.id, level, score, won });
        player = { ...p, offline: false };
        return player;
      } catch (e) { player.offline = true; }
    }
    const db = readLocal();
    const key = player.name.toLowerCase();
    const rec = db[key] || { id: 0, name: player.name, progress: [] };
    let row = rec.progress.find((r) => r.level === level);
    if (!row) { row = { level, bestScore: 0, attempts: 0, completed: 0 }; rec.progress.push(row); }
    row.attempts++;
    if (won) { row.bestScore = Math.max(row.bestScore, score); row.completed = 1; }
    db[key] = rec; writeLocal(db);
    player = { ...rec, offline: true };
    return player;
  }

  async function leaderboard() {
    try { return tauri ? await sqlLeaderboard() : await api('/api/leaderboard'); } catch (e) { return []; }
  }

  return {
    login, saveResult, leaderboard,
    get player() { return player; },
    lastName() { try { return localStorage.getItem('pb_last_name') || ''; } catch (e) { return ''; } },
    progressOf(level) { return (player && player.progress.find((r) => r.level === level)) || null; },
    isUnlocked(level) { return level === 1 || !!this.progressOf(level - 1)?.completed; },
    totalScore() { return player ? player.progress.reduce((s, r) => s + r.bestScore, 0) : 0; },
  };
})();
