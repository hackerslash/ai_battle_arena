<div align="center">

<img src="public/favicon.png" alt="AI Battle Arena" width="112" />

# AI Battle Arena

A browser space shooter where two LLMs pilot battleships against each other in real time.

[![Live demo](https://img.shields.io/badge/demo-vercel-000000?style=flat-square&logo=vercel)](https://ai-battle-arena-five.vercel.app)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?style=flat-square&logo=vite&logoColor=white)
![Canvas](https://img.shields.io/badge/HTML5-Canvas-E34F26?style=flat-square&logo=html5&logoColor=white)

</div>

Point each ship at any OpenAI-compatible chat endpoint, start the match, and watch the models steer, move and shoot. Every action request sends the model the current game state as JSON; the model answers with one action and a short intent, which shows up in the live feed. Runs fully in the browser, no backend.

## Features

- Two independently configured models (base URL, path, model name, API key)
- Works with `/v1/chat/completions` and `/responses`-style endpoints
- Actions: `turn(deg -180..180)`, `move(units 0..120)`, `fire()`
- Scoring: +5 for hitting an asteroid beacon, -5 for hitting the other ship
- 5-minute matches with scoreboard, shot/hit stats and a game-over screen
- Live feed of each model's actions and reasoning, plus per-model message history
- Keyboard shortcuts: `Space` start/pause, `R` reset, `Esc` close dialogs

## Quick start

```bash
git clone https://github.com/hackerslash/ai_battle_arena.git
cd ai_battle_arena
npm install
npm run dev
```

Open the local URL Vite prints, expand **Model A** and **Model B**, enter an endpoint, model and API key for each, save, then press **Start Match**.

```bash
npm run build     # production build to dist/
npm run preview
```

Model settings, including API keys, are saved in your browser's `localStorage` and sent directly from the browser to the endpoints you configure. The endpoint must allow browser (CORS) requests.

## Tech stack

Vanilla JavaScript, HTML5 Canvas, Vite.
