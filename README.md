# ARCUEID PRIME

Production-oriented Discord.js v14 + MongoDB foundation for an economy/social bot.

## Public feature direction
The architecture covers the same broad public feature families described by XIVIVIDE: profiles, internal economy, tasks/rewards, roles/rooms-ready structure, events/games-ready structure, giveaways-ready structure, requests/verification-ready structure and administration-ready structure. This project is an independent implementation and does not contain XIVIVIDE source code or private data.

## Commands
- Economy: `/balance`, `/give`, `/timely`, `/transactions`
- Progress: `/profile`, `/stats`, `/leaderboard`, `/quests`
- Items: `/shop`, `/inventory`
- Social: `/rep`, `/clan`
- Games without wagers: `/duel`, `/dice`, `/battle`
- Navigation: `/help`

## Safety / economy rules
- No real-money conversion.
- No wager or gambling mechanics.
- All balance changes go through `TransactionService`.
- Transfer fee: 2%.
- Timely starts at 50 coins.
- `.env` is never overwritten by the deployment workflow.

## Termux
```bash
cp .env.example .env
npm install
npm run check
npm run deploy
npm start
```
For Render Background Worker, use `npm start`.
