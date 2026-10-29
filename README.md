# Princess Buster

Jeu web (futur Tauri) : tire sur les piles de cubes-technologies avec un nombre limité de balles.
Il reste des cubes sur la table quand les balles sont finies = défaite. Table vide = victoire, **points = balles restantes**.

## Lancer (test web)
```bash
npm start        # http://localhost:3000  (Node >= 22.5, aucune dépendance npm)
```

## Contrôles
- Glisser (souris/doigt) pour viser, relâcher pour tirer (glisser vers le bas = annuler)
- Le canon est fixe au centre : tu ne fais que l'orienter. Clavier : `←`/`→` (ou `A`/`D`) pour orienter, `Espace` pour tirer

## Gameplay
- Le canon est vu de derrière : la balle part vers le fond et **pousse la pièce visée en profondeur**. Elle glisse sur le plateau puis tombe **derrière la table** (ou sur les côtés si elle déborde).
- Pièces de formats variés (carrés, rectangles larges, hautes, 2x2, 3x1...). Plus lourdes = plusieurs tirs.
- À partir du niveau 5 : des pièces **derrière** d'autres pièces. Pousser celle de devant fait tomber celle de derrière d'abord.
- Difficulté croissante : pièces plus lourdes, plus de rangées cachées, balles plus justes.

## Adaptation écrans
Le jeu occupe tout l'écran (téléphone, tablette, ordinateur ; portrait ou paysage) : la scène logique (>= 540x700) s'adapte à la fenêtre. Bouton plein écran inclus. Aucun cube n'est suspendu : chaque colonne repose sur la table (générateur + garde-fou dans `game.js`).

## Structure
- `public/levels/levelNN.json` : 20 niveaux (balles, poids des cubes, grille de technos). Régénérables : `npm run levels` (`tools/generate-levels.js`)
- `public/assets/tech/*.svg` : 21 logos (devicon) ; `public/assets/logo.svg` : logo du jeu
- `server/server.js` : API + base SQLite `data/princess-buster.db` (tables `players`, `progress`)
- `public/js/storage.js` : couche de sauvegarde (API, repli localStorage) — à brancher sur `tauri-plugin-sql` pour Tauri
- `public/js/audio.js` : musique de fond + SFX synthétisés (WebAudio)

## Vers Tauri
`frontendDist` = `public/`. Remplacer les `fetch('/api/...')` de `storage.js` par `tauri-plugin-sql` (mêmes tables), puis `cargo tauri build` / `cargo tauri android build`.
