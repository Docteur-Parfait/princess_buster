<div align="center">

<img src="public/assets/logo.webp" alt="Princess Buster" width="220">

# Princess Buster

**Knock down all the techs!** A 2.5D shooter where you blast stacks of programming-language and framework cubes with a limited number of balls.

[![CI](https://github.com/princesse-aku/princess_buster/actions/workflows/ci.yml/badge.svg)](https://github.com/princesse-aku/princess_buster/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-ffd23f.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-%E2%89%A5%2022.5-3a3fe0.svg)
![Zero npm dependencies](https://img.shields.io/badge/npm%20dependencies-0-ff3fa4.svg)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-5fd4ff.svg)](CONTRIBUTING.md)

[Français](README.md) · [English](README.en.md)

</div>

<p align="center">
  <img src="docs/promo/princess-buster-promo.png" alt="Princess Buster: knock down all the techs" width="100%">
</p>

<p align="center">
  <img src="docs/screenshots/01-accueil.png" alt="Home screen" width="23%">
  <img src="docs/screenshots/02-niveaux.png" alt="Level select" width="23%">
  <img src="docs/screenshots/03-partie-niveau-3.png" alt="Level 3" width="23%">
  <img src="docs/screenshots/04-partie-niveau-12.png" alt="Level 12 with hidden pieces" width="23%">
</p>

> The game UI is currently in **French**. Translations are welcome (see the [roadmap](#roadmap)). The contribution guide is in French; feel free to open issues and PRs in English.

## The game

A stack of cubes (HTML, CSS, JavaScript, PHP, Laravel, Node.js, Docker…) sits on a table. Your cannon, fixed at the bottom of the screen, fires balls: each ball **pushes the targeted piece toward the back**. It slides along the table and **falls off behind it**.

- You **win** when no cube is left on the table. **Level score = balls left over.**
- You **lose** when you run out of balls while cubes remain.
- Difficulty ramps up: heavier and bigger pieces, and from level 5 on, **pieces hidden behind other pieces** (pushing the front piece knocks the one behind off first).

## Features

- 🎯 **200 levels** described in JSON files, with **40 technologies** introduced progressively
- 🎨 **12 backgrounds** that change from level to level: meadow, night, sunset, snow, desert, ocean, candy, forest, space, autumn, volcano, neon
- 🧱 **Mixed piece shapes**: squares, wide or tall rectangles, 2×2, 3×1, 3×2
- 🌌 **Simulated depth**: depending on shot angle and impact point a piece falls **behind the table, left or right**; up to 3 hidden rows behind the front pieces
- 🔒 **No floating cubes**: every piece rests on another piece or on the table (checked by `npm test`)
- 📱 **Adaptive full screen**: phone, tablet, desktop, portrait or landscape
- 💾 **SQLite profiles and scores**: player name asked at start, best scores, progressive unlocking, leaderboard
- 🔊 Background music and SFX synthesized with WebAudio (no audio files)
- 🧩 **Zero npm dependencies**: Node.js and a browser are enough (Matter.js is bundled)

## Quick start

Requires [Node.js](https://nodejs.org) **22.5+** (built-in `node:sqlite`).

```bash
git clone https://github.com/princesse-aku/princess_buster.git
cd princess_buster
npm start
```

Then open <http://localhost:3000>.

```bash
npm test          # validates the 200 levels
npm run levels    # regenerates levels (overwrites public/levels)
```

## Controls

| Action | Mouse / touch | Keyboard |
| --- | --- | --- |
| Aim | Drag (the reticle follows your finger) | `←` `→` (or `A` `D`) |
| Fire | Release | `Space` / `Enter` |
| Cancel a shot | Drag back toward the cannon, then release | — |
| Fullscreen | ⛶ button | — |

## Levels

Levels 1-20 each introduce a new technology (HTML5 from the start): CSS3, Sass, Bootstrap, JavaScript, TypeScript, jQuery, Tailwind CSS, PHP, Laravel, Node.js, Express, React, Vue.js, Angular, Python, Django, MySQL, MongoDB, Docker, Git. Levels 21-200 add 19 more (Go, Rust, Kotlin, Swift, Java, C#, C++, Ruby, Flutter, Dart, Next.js, Svelte, Redis, PostgreSQL, GraphQL, Kubernetes, Firebase, Nginx, Bash) and 12 rotating backgrounds.

A level is a `public/levels/levelNNN.json` file with `balls`, `cubeWeight`, `rows`, `cols` and a list of `pieces` (`tech`, `col`, `row`, `w`, `h`, `layer`). See the [French README](README.md#créer-ou-modifier-un-niveau) for the full format, and run `npm test` to validate your changes.

## Project layout

```
public/            the game (static, Tauri-ready): index.html, css/, js/ (game, ui, audio, storage), levels/, assets/, vendor/
server/server.js   test server: static files + SQLite API (node:sqlite)
tools/             generate-levels.js, validate-levels.js
docs/screenshots/  README screenshots
.github/           CI, issue and PR templates
```

API: `POST /api/player`, `POST /api/progress`, `GET /api/leaderboard`. Dev shortcuts: `/?name=Ada&level=12&autoplay=1`.

## Roadmap

- [ ] Desktop and Android/iOS apps with [Tauri](https://tauri.app)
- [ ] Special pieces (explosive, unbreakable, bouncy)
- [ ] Power-ups (triple shot, bomb…)
- [ ] More levels and technologies (Go, Rust, Kotlin, Swift…)
- [ ] Translations
- [ ] Visual level editor

## Contributing

Contributions are welcome! Read the [contributing guide](CONTRIBUTING.md) (French) and the [code of conduct](CODE_OF_CONDUCT.md). For security issues see [SECURITY.md](SECURITY.md).

## License and credits

- Code: [MIT](LICENSE) © 2026 princesse-aku
- The **"Princess Buster" logo** (`public/assets/logo.webp`) is **not** covered by the MIT license: all rights reserved by the project author
- Technology logos: [Devicon](https://devicon.dev) (MIT); trademarks belong to their respective owners
- Physics: [Matter.js](https://brm.io/matter-js/) (MIT)
