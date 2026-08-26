# ARCUEID Economy + Core

## Запуск в Termux

```bash
pkg update && pkg upgrade
pkg install nodejs-lts git

git clone <твой репозиторий>
cd arcueid-economy
npm install

cp .env.example .env
# открой .env и заполни:
#   DISCORD_TOKEN, DISCORD_CLIENT_ID — из Discord Developer Portal
#   MONGODB_URI — из MongoDB Atlas
#   ALLOWED_GUILD_IDS — ID твоих 10 серверов через запятую
#   BOT_OWNER_ID — твой Discord ID

npm run deploy-commands   # регистрирует /balance /give /timely /profile /ping на разрешённых серверах
npm start                 # запускает бота
```

## Что уже готово

- `/ping` `/balance` `/give` `/timely` `/profile` — рабочие команды.
- `TransactionService` — единственное место, где меняется баланс. Атомарные операции,
  идемпотентность (двойной клик / повтор не спишут деньги дважды), защита от гонок
  на `/give` через Mongo session transaction.
- `/balance` эфемерный по умолчанию, с кнопкой «Показать всем».
- `/timely` со стрик-бонусом, показывает баланс сразу в ответе.
- `/profile` — пока обычный эмбед; Canvas-карточка (premium dark, баннер, аватар,
  титул) добавляется отдельным патчем — см. `TODO(Canvas patch)` в `src/commands/profile.js`.
- Бот сам покидает любой сервер вне `ALLOWED_GUILD_IDS`.
- Ошибки никогда не показываются пользователю напрямую (`src/utils/embeds.js#errorEmbed`).

## Дальше по плану

1. `/shop /buy /inventory /use /sell /leaderboard /transactions` — Economy добивается.
2. `/coinflip`, затем `/duel` (с escrow) и `/blackjack` (persistent game state).
3. Canvas-профиль.
4. Moderation-бот.
5. `/app` — Discord Activity (отдельный веб-проект).

## Проверено (2 прохода по коду)

- Синтаксис всех файлов — `node --check` прошёл без ошибок.
- Race condition на `/give`: атомарный `findOneAndUpdate` с условием на баланс +
  Mongo transaction на пару документов.
- Двойной клик на кнопках `/give`: collector резолвится один раз, кнопки убираются
  сразу после первого клика; плюс idempotencyKey на уровне транзакции — если что-то
  всё же повторится, спишется 0 раз, а не дважды.
- `/timely` до кулдауна: атомарный `findOneAndUpdate` с условием по `lastTimelyAt`
  не даст забрать награду дважды даже при одновременных запросах.

Не проверено вживую (нужен реальный Discord-токен и MongoDB — этого у меня в
песочнице нет): фактический деплой команд, поведение в реальном Discord-клиенте,
поведение MongoDB Atlas session transactions на твоём кластере. Первое, что стоит
сделать после `npm start` — вручную пройтись по `/balance`, `/timely`, `/give` (в
том числе попробовать кликнуть «Подтвердить» дважды подряд) и посмотреть логи.
