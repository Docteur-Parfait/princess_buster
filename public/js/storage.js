// Couche de sauvegarde. Web : API SQLite du serveur (server/server.js), avec repli localStorage.
// Tauri : remplacer les appels fetch par tauri-plugin-sql (même schéma de tables) sans toucher au reste du jeu.
const Storage = (() => {
  const KEY = 'pb_local_players';
  let player = null; // { id, name, progress: [{level,bestScore,attempts,completed}] }

  const readLocal = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
  const writeLocal = (db) => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* ignore */ } };

  async function api(path, body) {
    const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
    if (!res.ok) throw new Error('API ' + res.status);
    return res.json();
  }

  async function login(name) {
    try {
      player = await api('/api/player', { name });
      player.offline = false;
    } catch (e) {
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
      try { const p = await api('/api/progress', { playerId: player.id, level, score, won }); player = { ...p, offline: false }; return player; } catch (e) { player.offline = true; }
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

  async function leaderboard() { try { return await api('/api/leaderboard'); } catch (e) { return []; } }

  return {
    login, saveResult, leaderboard,
    get player() { return player; },
    lastName() { try { return localStorage.getItem('pb_last_name') || ''; } catch (e) { return ''; } },
    progressOf(level) { return (player && player.progress.find((r) => r.level === level)) || null; },
    isUnlocked(level) { return level === 1 || !!this.progressOf(level - 1)?.completed; },
    totalScore() { return player ? player.progress.reduce((s, r) => s + r.bestScore, 0) : 0; },
  };
})();
