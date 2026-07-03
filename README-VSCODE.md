# ROCH Landing → VS Code

Единый self-contained файл: `index.html` (HTML + CSS + vanilla JS в одном файле, без сборки).
Открывается как есть, работает и без Vite. Никаких зависимостей.

---

## Как запустить

**Вариант 1 — просто открыть**
Двойной клик по `index.html` в браузере. Всё работает (кроме gif-аватара, см. ниже).

**Вариант 2 — в проекте (Vite / любой сервер)**
Положи `index.html` в проект и открой через dev-сервер (`npm run dev`) или Live Server в VS Code.
На проде — задеплой на `roch-audit.com/start`. Тестируй в Safari, НЕ в Quick Look.

---

## Подключить свой gif-аватар (блок «Обо мне» → Роман Чернявский)

В коде уже стоит умный загрузчик. В `<img id="avaImg">` есть `data-try` со списком путей —
JS пробует их по очереди, первый рабочий подхватывается, буква «R» скрывается сама.

Текущий список путей:
```
/avatar.gif, ./assets/avatar.gif, ./src/assets/avatar.gif, assets/avatar.gif
```

Выбери ОДИН способ:

### Способ A — самый простой (public)
1. Положи `avatar.gif` в папку `public/` в корне проекта.
2. Готово — путь `/avatar.gif` подхватится автоматически.

### Способ B — import в Vite (из src/assets)
1. Твой файл: `src/assets/avatar.gif`.
2. В любом своём JS-модуле:
   ```js
   import avatarUrl from './assets/avatar.gif';
   document.getElementById('avaImg').src = avatarUrl;
   ```
   (Vite вернёт правильный хешированный URL после сборки.)

### Способ C — вручную вписать путь
Найди в `index.html` строку с `id="avaImg"` и добавь готовый `src`:
```html
<img id="avaImg" src="ТВОЙ_ПУТЬ/avatar.gif" alt="Роман" data-try="...">
```

Если ни один путь не сработает — останется буква «R» на градиенте (не сломается).

---

## Что ещё нужно проверить перед печатью QR

- [ ] Telegram-хендл. В начале `<script>` найди `TG_USER = 'broch'` — убедись, что верный.
- [ ] Реквизиты оплаты в модалке предзаказа (USDT TRC-20 + IBAN TBC) — актуальны.
- [ ] Реальные скриншоты проектов: ищи в коде комментарии `СЮДА ПОЗЖЕ`.
- [ ] Ссылки «Обо мне»: CV → bio.roch-art.com/about-me, портфолио → youtu.be/uFlb1IN30FM.

---

## Технические константы (не ломай)

- Single-file HTML + vanilla JS. Без JSX/React (не рендерится на iOS).
- Никаких `?.` и `??` (iOS WebKit падает).
- `overflow-x: clip`, НЕ `hidden` (иначе ломается `position: sticky` у навбара).
- Никаких `filter` / `mix-blend-mode` на fixed/fullscreen-слоях (WebKit crash).
- Safe-area низ: `max(env(safe-area-inset-bottom), 20px)`.
- Проверка JS: `node --check` перед деплоем.
