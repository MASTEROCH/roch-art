# Деплой на roch-art.com

## Состав
- `index.html` — весь лендинг (single-file, vanilla)
- `assets/` — favicon, avatar.gif, скриншоты кейсов (`cases/`), спрайты маскота (`mascot/`)
- `vercel.json` — кэш ассетов на неделю, index без кэша

## Шаги (один раз)
1. GitHub: создать репо `MASTEROCH/roch-art` → запушить эту папку.
2. Vercel: **Add New Project** → импорт `roch-art` → Framework: **Other**, build command пустой, output — корень. Deploy.
3. Vercel → Settings → Domains → добавить `roch-art.com` (+ `www.roch-art.com` → redirect на apex).
4. У регистратора домена: `A @ → 76.76.21.21`, `CNAME www → cname.vercel-dns.com` (Vercel покажет точные значения).
   ⚠️ `bio.roch-art.com` — отдельная A/CNAME запись, её НЕ трогать.

## Серверная часть (живёт в проекте roch-audit, уже написана)
- `/api/vibe-chat` — мозг ROCH bot (задеплоен)
- `/api/vibe-checkout` — он-чейн проверка USDT + слот + TG-пинг
- `/api/vibe-slots` — счётчик live-слотов для HUD
- `/api/vibe-track` — события лендинга → Telegram

Env в Vercel-проекте **roch-audit** (все уже стоят для crypto-verify/lead, новая одна):
- `VIBE_ADMIN_KEY` — придумать секрет для ручного сброса слотов.

## Управление слотами
- Оплата предоплаты через лендинг → счётчик live растёт сам.
- Проект сдан → сбросить/уменьшить: открой
  `https://roch-audit.com/api/vibe-slots?key=<VIBE_ADMIN_KEY>&set=0`
  (`set=N` — сколько сейчас в работе).

## Обновление лендинга
Правка `index.html` → commit → push → Vercel автодеплой. Перед пушем:
`node --check` на извлечённом скрипте (см. память проекта).
