<div align="center">

<img src="public/assets/logo.webp" alt="Princess Buster" width="220">

# Princess Buster

**Fais tomber toutes les technos !** Un jeu de tir en 2.5D où tu fais exploser des piles de cubes de langages et frameworks de programmation, avec un nombre de balles limité.

[![CI](https://github.com/princesse-aku/princess_buster/actions/workflows/ci.yml/badge.svg)](https://github.com/princesse-aku/princess_buster/actions/workflows/ci.yml)
[![Licence MIT](https://img.shields.io/badge/licence-MIT-ffd23f.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-%E2%89%A5%2022.5-3a3fe0.svg)
![Sans dépendance npm](https://img.shields.io/badge/d%C3%A9pendances%20npm-0-ff3fa4.svg)
[![PRs bienvenues](https://img.shields.io/badge/PRs-bienvenues-5fd4ff.svg)](CONTRIBUTING.md)

[Français](README.md) · [English](README.en.md)

</div>

<p align="center">
  <img src="docs/promo/princess-buster-promo.png" alt="Princess Buster : fais tomber toutes les technos" width="100%">
</p>

<p align="center">
  <img src="docs/screenshots/01-accueil.png" alt="Écran d'accueil" width="23%">
  <img src="docs/screenshots/02-niveaux.png" alt="Choix du niveau" width="23%">
  <img src="docs/screenshots/03-partie-niveau-3.png" alt="Niveau 3" width="23%">
  <img src="docs/screenshots/04-partie-niveau-12.png" alt="Niveau 12 avec pièces cachées" width="23%">
</p>

## Sommaire

- [Le jeu](#le-jeu)
- [Captures d'écran](#captures-décran)
- [Fonctionnalités](#fonctionnalités)
- [Démarrage rapide](#démarrage-rapide)
- [Contrôles](#contrôles)
- [Les 20 niveaux](#les-20-niveaux)
- [Créer ou modifier un niveau](#créer-ou-modifier-un-niveau)
- [Architecture du projet](#architecture-du-projet)
- [API et sauvegarde](#api-et-sauvegarde)
- [Raccourcis de développement](#raccourcis-de-développement)
- [Feuille de route](#feuille-de-route)
- [Contribuer](#contribuer)
- [Licence et crédits](#licence-et-crédits)

## Le jeu

Une pile de cubes (HTML, CSS, JavaScript, PHP, Laravel, Node.js, Docker…) est posée sur une table. Ton canon, fixe au bas de l'écran, tire des balles : chaque balle **pousse la pièce visée vers le fond**. Elle glisse sur le plateau puis **tombe derrière la table**.

- Tu **gagnes** quand il n'y a plus aucun cube sur la table. Le **score du niveau = le nombre de balles restantes**.
- Tu **perds** quand tu n'as plus de balles alors qu'il reste des cubes.
- Les niveaux deviennent plus durs : pièces plus lourdes et plus grandes, et à partir du niveau 5 des **pièces cachées derrière d'autres pièces** (celle de devant, poussée, fait tomber celle de derrière en premier).

## Captures d'écran

| Accueil | Choix du niveau |
| :---: | :---: |
| <img src="docs/screenshots/01-accueil.png" width="300"> | <img src="docs/screenshots/02-niveaux.png" width="300"> |

| Niveau 3 : formats variés | Niveau 12 : pièces cachées derrière |
| :---: | :---: |
| <img src="docs/screenshots/03-partie-niveau-3.png" width="300"> | <img src="docs/screenshots/04-partie-niveau-12.png" width="300"> |

Le jeu occupe tout l'écran : ici sur une tablette en mode paysage.

<p align="center"><img src="docs/screenshots/05-tablette-paysage.png" alt="Tablette en paysage" width="720"></p>

## Fonctionnalités

- 🎯 **20 niveaux** décrits dans des fichiers JSON, avec 21 technologies introduites progressivement (HTML5 et CSS3 d'abord)
- 🧱 **Pièces de formats variés** : carrés, rectangles larges ou hauts, 2×2, 3×1, 3×2
- 🌌 **Profondeur simulée** : les pièces glissent sur la table et tombent derrière ; rangées cachées derrière les premières
- 🔒 **Aucun cube suspendu dans le vide** : chaque pièce repose sur une autre ou sur la table (vérifié par `npm test`)
- 📱 **Plein écran adaptatif** : téléphone, tablette, ordinateur, en portrait comme en paysage (pas de cadre de téléphone dessiné)
- 💾 **Profils et scores en SQLite** : nom du joueur demandé au lancement, meilleurs scores, déblocage progressif, classement
- 🔊 **Musique de fond et bruitages** synthétisés en WebAudio (aucun fichier audio), avec boutons pour les couper
- ✨ Particules, combos (« Super ! », « INCROYABLE ! »), traînée de balle, vibration sur mobile
- 🧩 **0 dépendance npm** : Node.js et un navigateur suffisent (Matter.js est fourni dans `public/vendor/`)

## Démarrage rapide

Prérequis : [Node.js](https://nodejs.org) **22.5 ou plus** (pour le module `node:sqlite` intégré).

```bash
git clone https://github.com/princesse-aku/princess_buster.git
cd princess_buster
npm start
```

Ouvre ensuite <http://localhost:3000> (sur ton téléphone : `http://<ip-de-ton-pc>:3000` sur le même réseau).

```bash
npm test          # valide les 20 niveaux (formats, techs connues, aucun cube suspendu)
npm run levels    # régénère les niveaux (attention : écrase les fichiers de public/levels)
```

> La base SQLite est créée automatiquement dans `data/princess-buster.db` (ignorée par git). Si le serveur n'est pas joignable, le jeu sauvegarde dans le navigateur (`localStorage`).

## Contrôles

| Action | Souris / tactile | Clavier |
| --- | --- | --- |
| Viser | Glisser (le réticule suit ton doigt) | `←` `→` (ou `A` `D`) |
| Tirer | Relâcher | `Espace` ou `Entrée` |
| Annuler un tir | Ramener le doigt vers le canon avant de relâcher | — |
| Plein écran | Bouton ⛶ | — |

## Les 20 niveaux

Chaque niveau introduit une nouvelle technologie (HTML5 est présent dès le début) :

| Niv. | Techno | Niv. | Techno | Niv. | Techno | Niv. | Techno |
| :-: | --- | :-: | --- | :-: | --- | :-: | --- |
| 1 | CSS3 | 6 | jQuery | 11 | Express | 16 | Django |
| 2 | Sass | 7 | Tailwind CSS | 12 | React | 17 | MySQL |
| 3 | Bootstrap | 8 | PHP | 13 | Vue.js | 18 | MongoDB |
| 4 | JavaScript | 9 | Laravel | 14 | Angular | 19 | Docker |
| 5 | TypeScript | 10 | Node.js | 15 | Python | 20 | Git |

## Créer ou modifier un niveau

Un niveau est un fichier `public/levels/levelNN.json` :

```json
{
  "id": 3,
  "name": "Niveau 3 - Bootstrap",
  "newTech": "bootstrap",
  "balls": 15,
  "cubeWeight": 1.15,
  "techs": ["html5", "css3", "sass", "bootstrap"],
  "rows": 3,
  "cols": 3,
  "pieces": [
    {"tech":"html5","col":0,"row":2,"w":2,"h":1,"layer":0},
    {"tech":"bootstrap","col":2,"row":2,"w":1,"h":1,"layer":0},
    {"tech":"css3","col":0,"row":1,"w":1,"h":1,"layer":0},
    {"tech":"sass","col":0,"row":1,"w":1,"h":2,"layer":1}
  ]
}
```

| Champ | Rôle |
| --- | --- |
| `balls` | Nombre de balles disponibles |
| `cubeWeight` | Multiplicateur de poids des pièces (plus c'est lourd, plus il faut de tirs) |
| `rows` / `cols` | Taille de la grille (la ligne `0` est en haut) |
| `pieces[].col/row` | Coin supérieur gauche de la pièce dans la grille |
| `pieces[].w/h` | Taille en cases (1×1, 2×1, 1×2, 2×2…) |
| `pieces[].layer` | `0` = devant, `1` = derrière (plus profond) |
| `pieces[].tech` | Clé d'une techno de `public/levels/index.json` |

**Règles** (vérifiées par `npm test`) : pas de chevauchement dans une même rangée, tout dans la grille, et **chaque pièce doit reposer sur une pièce de la même rangée ou sur la table**. Le détail est dans [CONTRIBUTING.md](CONTRIBUTING.md#ajouter-ou-modifier-un-niveau).

## Architecture du projet

```
princess_buster/
├── public/                  # le jeu (statique, prêt pour Tauri)
│   ├── index.html
│   ├── css/style.css        # charte graphique (variables CSS issues du logo)
│   ├── js/
│   │   ├── game.js          # moteur : physique Matter.js, profondeur, rendu canvas, canon
│   │   ├── ui.js            # écrans, navigation, entrées (souris/tactile/clavier), plein écran
│   │   ├── audio.js         # musique + bruitages synthétisés (WebAudio)
│   │   └── storage.js       # sauvegarde : API SQLite avec repli localStorage
│   ├── levels/              # index.json + level01..20.json
│   ├── assets/              # logo.webp + tech/*.svg (logos des technologies)
│   └── vendor/matter.min.js
├── server/server.js         # serveur de test : fichiers statiques + API SQLite (node:sqlite)
├── tools/
│   ├── generate-levels.js   # générateur de niveaux (formes, pièces, difficulté)
│   └── validate-levels.js   # validateur utilisé par `npm test` et la CI
├── docs/screenshots/        # captures du README
└── .github/                 # CI, modèles d'issues et de pull requests
```

**Comment ça marche, en bref** : le moteur reste en 2D (Matter.js) pour l'empilement et les chutes sur les côtés. La profondeur est simulée par un axe `z` propre à chaque pièce : une balle ajoute de la vitesse en `z` (divisée par la masse), la pièce glisse sur le dessus du plateau, puis tombe derrière si elle dépasse la profondeur de la table. Une pièce poussée qui rencontre une pièce « derrière » lui transmet son élan.

## API et sauvegarde

Base SQLite (`data/princess-buster.db`), deux tables : `players` (nom unique) et `progress` (meilleur score, tentatives, niveau réussi).

| Méthode | Route | Rôle |
| --- | --- | --- |
| `POST` | `/api/player` | Crée ou retrouve un joueur `{ name }` et renvoie sa progression |
| `POST` | `/api/progress` | Enregistre un résultat `{ playerId, level, score, won }` |
| `GET` | `/api/leaderboard` | Top 10 des joueurs |

## Raccourcis de développement

```text
http://localhost:3000/?name=Ada                       → connexion directe, menu des niveaux
http://localhost:3000/?name=Ada&level=12              → lance directement le niveau 12
http://localhost:3000/?name=Ada&level=12&autoplay=1   → un petit robot joue (démo, captures)
http://localhost:3000/?name=Ada&level=12&autoplay=1&clean=1   → idem sans bandeau ni texte d'aide
```

## Feuille de route

- [ ] Application **desktop et Android/iOS avec [Tauri](https://tauri.app)** (`public/` est déjà le `frontendDist` ; `storage.js` à brancher sur `tauri-plugin-sql`, mêmes tables)
- [ ] Pièces spéciales (explosives, indestructibles, rebondissantes)
- [ ] Bonus achetables (triple tir, bombe…)
- [ ] Plus de niveaux et de technologies (Go, Rust, Kotlin, Swift…)
- [ ] Traductions (le jeu est en français)
- [ ] Éditeur de niveaux visuel

Une idée ? Ouvre une [issue](https://github.com/princesse-aku/princess_buster/issues/new/choose).

## Contribuer

Les contributions sont les bienvenues : bugs, niveaux, technologies, traductions, accessibilité, documentation…
Lis le [guide de contribution](CONTRIBUTING.md) et le [code de conduite](CODE_OF_CONDUCT.md). Pour une faille de sécurité, voir [SECURITY.md](SECURITY.md).

## Licence et crédits

- Code : [licence MIT](LICENSE) © 2026 princesse-aku
- Le **logo « Princess Buster »** (`public/assets/logo.webp`) n'est **pas** couvert par la licence MIT : tous droits réservés à l'auteur du projet
- Logos des technologies : [Devicon](https://devicon.dev) (MIT) ; les marques appartiennent à leurs propriétaires respectifs
- Physique : [Matter.js](https://brm.io/matter-js/) (MIT)
- Inspiration de gameplay : les jeux de tir de cubes en piles pour mobile. Aucun asset de ces jeux n'est utilisé ici
