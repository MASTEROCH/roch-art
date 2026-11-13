# Контракт интеграции: продукты ROCH ↔ ROCH Client Engine

**Версия:** 0.1, черновик · **Дата:** 14.11.2026 · **Статус:** не подключён к production. Обе стороны включают его только после теста на preview и «да» Романа.

Документ для команды Client Engine (`~/code/roch-client-engine`) и для продуктов-источников: ROCH AI, roch-art.com, ROCH Motion, AppHUB. Схема согласована с тем, что уже есть в Client Engine:
- таблица `ecosystem_events` (`packages/db/src/schema.ts:167`);
- статусы согласия (`packages/core/src/router.ts:16-28`);
- `recordEcosystemEvent`, `findByCustomer`, `eraseCustomer` (`packages/db/src/repo.ts:49,75`);
- `ProductId` (`packages/core/src/catalog.ts`).

---

## 1. Шесть правил, которые не обсуждаются

1. **Разные базы.** Client Engine не читает базы продуктов, продукты не читают его базу. Service-role ключи Supabase и токены Upstash никуда не передаются. Единственный канал — подписанные события на один эндпоинт.
2. **Только коммерческий интерес.** Событие говорит «человек заинтересовался X», а не «вот что он загрузил». Содержимое разборов не уходит никогда.
3. **Согласие первично.** Без отметки согласия событие — метрика (`metric_only`), а не лид: писать такому человеку нельзя.
4. **Минимум данных.** Вместо Telegram id или почты передаётся непрозрачный `customer_ref`. Контакт передаётся отдельно и только при согласии на контакт.
5. **Идемпотентность.** Повтор события ничего не ломает: `event_id` — первичный ключ.
6. **Продукт не ждёт CRM.** Пока Client Engine недоступен, события копятся в исходящей очереди продукта. Пользователь об этом не узнаёт.

---

## 2. Участники

| `source_product` | Продукт | Шлёт события | Сейчас |
|---|---|---|---|
| `roch_ai` | бот @roch_ai_bot, Mini App, roch-art.com/rochai | да | нет инфраструктуры событий: только уведомления Роману в Telegram |
| `website` | roch-art.com | да, анонимно, пока нет заявки | маяк `track()` → `roch-audit.com/api/vibe-track`, без хранения |
| `roch_motion` | ROCH Motion | только `product.interest_registered`, если человек сам просит индивидуальную механику | счётчики в Redis |
| `apphub` | apphub.studio | `lead.created` из своих форм заявки | API заявок есть, событий нет |
| `roch_audit` | roch-audit.com | **не шлёт** — продукт на паузе | — |

Значения `source_product` совпадают с комментарием к `opportunities.source_product` в схеме Client Engine.

---

## 3. События

| `event_type` | Когда отправлять | Основание по умолчанию | Что делает Client Engine |
|---|---|---|---|
| `lead.created` | Человек сам оставил контакт и попросил связаться: форма заявки, «Позвать Рому лично», заявка AppHUB | `requested_contact` | создаёт или обновляет сделку → `lead_created` / `lead_updated` |
| `consultation.requested` | Нажал «Распаковка $480» / «Записаться» **и** оставил контакт | `requested_contact` | сделка с `product_id = unpacking` |
| `product.interest_registered` | Нажал CTA предложения (прототип, аудит, разработка, механика), но контакт не оставил | `unknown` | `metric_only`: сделки нет, интерес копится в воронке |
| `booking.completed` | Встреча назначена (сейчас Роман вручную; позже календарь) | наследует | двигает сделку по этапу |
| `service.purchased` | Подтверждена оплата **услуги**: распаковка, упаковка, запуск, разработка | наследует | закрывает сделку, пишет `amount` / `currency` |
| `consent.updated` | Согласие дано (`granted`) или отозвано (`withdrawn`) | — | при `withdrawn` — `eraseCustomer()` и стоп всех касаний |

**Самообслуживание в CRM не идёт.** Пакеты ROCH AI за Stars и механики Motion — экономика самих продуктов. Их покупки не создают лидов и не отправляются поштучно. Если понадобится общая воронка, это делается дневным агрегатом без `customer_ref` (раздел 11).

---

## 4. Конверт события (schema 1.0)

```json
{
  "event_id": "01JCX9W8ZQ7M3V0F6K2B4N8TQR",
  "event_type": "consultation.requested",
  "schema_version": "1.0",
  "source_product": "roch_ai",
  "occurred_at": "2026-11-14T18:20:11Z",
  "consent": {
    "status": "requested_contact",
    "captured_at": "2026-11-14T18:20:05Z",
    "text_version": "roch_ai.contact.v1",
    "channel": "telegram_button"
  },
  "customer_ref": "rai_7f3c…(HMAC)",
  "external_ref": null,
  "service_interest": "unpacking",
  "amount": null,
  "currency": null,
  "contact": { "telegram_username": "example_user" },
  "attribution": {
    "first_touch": "tg:startapp=ref",
    "last_touch": "site:utm_source=instagram",
    "start_param": "intake_idea",
    "utm_source": "instagram", "utm_medium": "reels", "utm_campaign": "nov_launch",
    "ce_ref": null
  },
  "context": { "locale": "ru", "trigger": "ai.idea_draft.done" },
  "test": false
}
```

| Поле | Правило | Колонка в `ecosystem_events` |
|---|---|---|
| `event_id` | ULID или UUIDv7, генерирует продукт **при записи в очередь**, а не при отправке | `event_id` (PK) |
| `event_type` | только из таблицы раздела 3 | `event_type` |
| `schema_version` | `1.0`; Client Engine принимает текущую и предыдущую минорную | `schema_version` |
| `source_product` | раздел 2 | `source_product` |
| `occurred_at` | ISO 8601 UTC, время действия человека | `occurred_at` |
| `consent.status` | раздел 5 | `consent_status` |
| `customer_ref` | `HMAC-SHA256(секрет_продукта, внутренний id)`, префикс продукта; стабилен внутри продукта, необратим, **не** Telegram id и не почта | `customer_ref` |
| `external_ref` | id платежа или заявки в продукте; для `service.purchased` обязателен | `external_ref` |
| `service_interest` | `product_id` из `docs/catalog/services.json` (= `ProductId` Client Engine) | `service_interest` |
| `amount`, `currency` | только `booking.completed` и `service.purchased`; валюта `USD` или `XTR` | `amount`, `currency` |
| `contact` | **только** при `requested_contact` или `granted`; поля: `telegram_username`, `email`, `name` — без свободного текста | в журнал не пишется; Client Engine переносит в сделку |
| `attribution` | раздел 9; только перечисленные ключи | `attribution` |
| `context.trigger` | id момента из CTA Router (например `ai.idea_draft.done`) — без текста пользователя | в `attribution.trigger` |
| `test` | `true` на preview; Client Engine сохраняет как `metric_only` и не показывает в CRM | — |

**Строгая схема.** Неизвестное поле — ответ `422`, событие не принимается. Так случайная утечка нового поля не пройдёт молча.

---

## 5. Согласие

Статусы — ровно как в Client Engine: `public_post · requested_contact · granted · not_granted · unknown · withdrawn`. Контактировать можно только при `public_post`, `requested_contact` и `granted`.

Правила для продуктов:
1. **По умолчанию `unknown`.** Клик, просмотр, разбор, покупка Stars согласием не являются.
2. **`requested_contact`** — человек сам нажал кнопку, текст которой прямо говорит о контакте: «Связаться со мной», «Позвать Рому лично», «Записаться на распаковку». Согласие действует для этого запроса, а не для рассылок.
3. **`granted`** — отдельная отметка «Можно писать мне о продуктах ROCH и AppHUB» с версией текста (`text_version`). Не предзаполнена и не совмещена с оплатой или разбором.
4. **Продукт хранит запись согласия у себя:** кто, когда, версия текста, канал. Client Engine получает только статус. Повышать статус задним числом нельзя.
5. **`withdrawn`** — кнопка «Не писать мне» или ответ «стоп» в любом канале. Продукт шлёт `consent.updated`, Client Engine стирает данные (раздел 10).
6. **`public_post`** ставит только сам Client Engine: человек сам опубликовал запрос на площадке. Продукты этот статус не отправляют.

---

## 6. Что не передаётся никогда

Ни в каком поле, ни в каком виде, ни «для отладки»:
- текст идеи, паспорт идеи, ответы `/start biz`;
- скриншоты, PDF, исходный код, адреса проверяемых сайтов;
- результаты разборов, оценки Trust/Funnel/Retention, сгенерированный HTML;
- переписка, сообщения боту, комментарии;
- Telegram id, телефон, платёжные идентификаторы Telegram (`telegram_payment_charge_id` — только как HMAC в `external_ref`);
- данные третьих лиц: клиентов клиента, персонала, пользователей их продуктов.

Обе стороны проверяют список разрешённых полей: продукт — перед записью в очередь, Client Engine — на входе.

---

## 7. Транспорт

**Эндпоинт:** `POST https://<client-engine-host>/api/ecosystem/events`. Сейчас его нет — спецификация в разделе 12.

**Заголовки:**
```
Content-Type: application/json
X-Roch-Source: roch_ai
X-Roch-Timestamp: 1763144411
X-Roch-Signature: sha256=<hex HMAC-SHA256(secret[source], timestamp + "." + raw_body)>
```
- У каждого продукта свой секрет. Два активных секрета на время ротации.
- Подпись проверяется сравнением за постоянное время: в Client Engine уже есть `apps/web/lib/auth.ts`. Отклонение времени — не больше ±300 с. Повтор того же `event_id` безопасен (раздел 8).
- Тело — `{ "events": [ … ] }`: до 50 событий, до 64 КБ. Только HTTPS.

**Ответы:**

| Код | Значение | Что делает продукт |
|---|---|---|
| `200` | `{ accepted: [...], duplicates: [...] }` | помечает отправленным |
| `401` | подпись или время | не повторяет; оповещение владельцу |
| `413` / `422` | размер / схема | не повторяет; событие в «мёртвые» с причиной |
| `429` | лимит | повтор после `Retry-After` |
| `5xx`, таймаут | сбой | повтор по расписанию |

**Исходящая очередь в продукте** (для ROCH AI — таблица Supabase, для Motion — список в Redis):
```
eco_outbox(event_id pk, payload jsonb, status text, attempts int, next_at timestamptz, last_error text, created_at timestamptz)
```
- Отправка — cron раз в минуту, пачками.
- Повторы через 1 мин, 5 мин, 30 мин, 2 ч, 12 ч. Потом статус `dead` и одно уведомление Роману.
- Выключатель — `ECO_EVENTS_ENABLED`. По умолчанию `false`, в production включается только по слову Романа.

---

## 8. Дедупликация

1. **Технический повтор.** `event_id` — первичный ключ. `recordEcosystemEvent()` уже делает `onConflictDoNothing`; такой повтор попадает в `duplicates`.
2. **Смысловые повторы** — Client Engine сводит их в одну сделку:
   - `lead.created` / `consultation.requested`: тот же `(source_product, customer_ref, service_interest)` в течение 7 дней → `lead_updated`;
   - `service.purchased`: уникален по `(source_product, external_ref)`;
   - `product.interest_registered`: копится счётчиком, сделку не плодит.
3. **Между продуктами личности не склеиваются.** `customer_ref` из ROCH AI и с сайта — разные люди, пока человек сам не оставил один и тот же контакт с согласием. Даже тогда склейку делает Client Engine с записью в журнал, а не продукт.

---

## 9. Атрибуция

Нормализованные ключи: `first_touch`, `last_touch`, `start_param`, `utm_source`, `utm_medium`, `utm_campaign`, `ref`, `landing`, `ce_ref`, `trigger`.

Существующие метки не ломаем, а переводим в эти ключи:

| Продукт | Как сейчас | Куда |
|---|---|---|
| ROCH AI | `startapp=ref…`, `?intake=idea` | `start_param`, `ref` |
| ROCH Motion | `startapp=f_<id>`, `w`, `w__f_<id>` | `start_param` |
| roch-art.com | `utm_*`, ссылки в бот с `startapp` | `utm_*`, `landing` |

**Замыкание петли.** Ссылки, которые сам Client Engine кладёт в предложения, несут `ce_<короткий id сделки>`: `?startapp=ce_ab12` для ботов, `?ce=ab12` для сайта. Продукт возвращает его в `attribution.ce_ref`. Так видно, какой найденный лид дошёл до продукта.

---

## 10. Удаление и хранение

- **Удаление.** `consent.updated` с `withdrawn` или запрос человека → Client Engine вызывает `eraseCustomer(source_product, customer_ref)`, продукт удаляет свои строки из `eco_outbox`.
- **Срок хранения журнала событий в Client Engine:** `metric_only` — 13 месяцев, затем агрегат без `customer_ref`. Сделки — пока есть основание.

---

## 11. Связь с каталогом и аналитикой

- `service_interest` и `amount` берутся из `docs/catalog/services.json`. Позицию со статусом `conflict` Client Engine клиенту не называет; так уже устроено его поле `quotable`.
- Страж `node docs/catalog/check.mjs` держит цены продуктов в согласии с каталогом.
- **Воронка без CRM.** Для общей картины (покупки Stars, разборы) продукты могут слать раз в сутки `metric.daily`: только числа по дням, без `customer_ref` и контактов. Это отдельный тип, лидов из него не бывает. Включается вторым этапом.

---

## 12. Минимальный эндпоинт в Client Engine (спецификация, не код в прод)

`apps/web/app/api/ecosystem/events/route.ts`:
1. Читает сырое тело, проверяет `X-Roch-Source`, время и подпись. Сравнение за постоянное время — из `apps/web/lib/auth.ts`.
2. Валидирует каждое событие строгой zod-схемой раздела 4; лишнее поле → `422`.
3. Пишет через `recordEcosystemEvent()`; при `false` событие идёт в `duplicates`.
4. Маршрутизация:
   - `isContactable(consent.status)` и тип из `lead.created`, `consultation.requested`, `booking.completed`, `service.purchased` → найти сделку через `findByCustomer()` или создать с `leadOrigin = internal`, `sourceProduct`, `customerRef`, `productId`, `attribution` → `setEventOutcome(lead_created | lead_updated)`;
   - иначе → `metric_only`;
   - `consent.updated` с `withdrawn` → `eraseCustomer()`.
5. Лимит — 60 запросов в минуту на источник. Журнал без контактов.
6. Панель Client Engine без авторизации (найдено разведкой) — **до подключения эндпоинта закрыть её авторизацией**, иначе внутренние лиды увидит кто угодно.

---

## 13. Как проверяем до production

1. **Фикстуры** в обоих репозиториях: по одному событию каждого типа плюс негативные — неверная подпись, старый timestamp, лишнее поле, контакт при `unknown`, повтор `event_id`.
2. **Контрактный тест:** продукт генерирует события из фикстур, Client Engine их принимает. Сравниваем исходы `lead_created / lead_updated / metric_only / duplicate`.
3. **Сквозной прогон на preview:** оба деплоя с `ECO_EVENTS_ENABLED=true` и `test: true`. Нажать CTA в ROCH AI → событие в журнале Client Engine → сделка только при согласии.
4. **Сбой Client Engine:** выключить эндпоинт → события копятся в `eco_outbox` → включить → доходят без дублей.
5. **Отзыв согласия:** `withdrawn` → `eraseCustomer` стёр сделку и журнал.
6. **Подключение к production** — отдельным решением Романа после пунктов 1–5.

---

## 14. Открытые вопросы к Роману

1. Текст согласия на коммерческий контакт (`granted`) — нужен ли он вообще на первом этапе, или достаточно `requested_contact` по кнопкам?
2. Кто отмечает `booking.completed` и `service.purchased`: Роман вручную в панели Client Engine (проще) или продукты (нужен календарь и учёт оплат USD/USDT)?
3. Хост Client Engine в production и где хранить секреты источников.
