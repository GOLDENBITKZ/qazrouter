# QazRouter: безопасный AI Gateway и платёжная архитектура

## 1. Главное ограничение

Нельзя одновременно гарантировать:

- доступ к самым сильным моделям;
- цену ниже закупочной стоимости у провайдера;
- отсутствие любых утечек;
- отсутствие любых prompt injection;
- невозможность противоправного использования;
- нулевой бюджет и полноценный production SLA.

Провайдерам нужно платить за токены, а любые классификаторы имеют false
negatives. Цель QazRouter — сделать риск управляемым, снизить стоимость за счёт
маршрутизации и кэша и блокировать запросы при сбое защитного слоя.

## 2. Целевая схема

```text
Пользователь / приложение
        │
        ▼
KZ HTTPS Gateway
        │
        ├── Auth: GitHub / email / magic link / API key
        ├── Anti-abuse: rate limit / quotas / fraud score
        ├── Request schema validation
        │
        ▼
Policy Engine
        │
        ├── PII Scanner: regex + GLiNER + secret detection
        ├── Prompt Injection Firewall
        ├── Illegal-use classifier
        ├── Media allowlist: только поддерживаемые типы
        │
        ├── FAIL ─────────────► 4xx/503, провайдер не вызывается
        │
        ▼
Ephemeral tokenization
        │
        ▼
Model Router / LiteLLM
        │
        ├── budget cap
        ├── model allowlist
        ├── fallback
        ├── tenant cache namespace
        │
        ▼
AI Provider (ZDR / no-training, если доступно)
        │
        ▼
Output Firewall
        │
        ├── scan PII/secrets
        ├── illegal-use classification
        ├── tool-call validation
        ├── restore allowed PII tokens in memory
        │
        ▼
Client

Параллельно:
usage meter ──► reserve → settle/release ──► wallet ledger
                                        └── invoice / reconciliation
```

## 3. Что не сохраняется

- Исходный prompt.
- Ответ модели в полном виде.
- Карта `PII token → original`.
- Номер карты и её CVC.
- LiteLLM message logs.

Сохраняются:

- хеш API-ключа;
- tenant ID;
- модель и провайдер;
- количество токенов;
- стоимость;
- версия policy;
- количество PII по типам;
- decision/risk code без текста;
- provider request ID для сверки.

## 4. PII и защита от утечек

### Слои

1. Unicode normalisation, удаление zero-width и подозрительных управляющих
   символов.
2. Regex: ИИН, телефоны РК, карты с Luhn, IBAN, email, паспорт, банковские
   счета.
3. GLiNER: ФИО, адреса и дополнительные сущности на русском, казахском и
   английском.
4. Secret scanner: API keys, JWT, private keys, пароли.
5. Policy decision:

```text
PII найдены        → tokenize
scanner недоступен → block
NER не загружен    → block
unknown media      → block
```

### Обратимая токенизация

Провайдер получает:

```text
Клиент __KZ_PII_PERSON_1__, ИИН __KZ_PII_IIN_2__
```

Карта соответствий хранится только в RAM процесса и живёт до конца запроса.
Ответ восстанавливается после output firewall. В Redis и usage logs попадают
только токены.

### Ограничение гарантии

Даже эта схема не исключает косвенные идентификаторы: редкая должность,
уникальная сумма, адрес события и стиль текста. Для действительно
чувствительных данных нужен отдельный локальный контур и запрет на внешние
модели.

## 5. Prompt injection firewall

Защита строится не на одном system prompt, а на архитектуре:

- любой пользовательский текст и RAG-документ считаются недоверенными;
- системная инструкция неизменяема и не извлекается из запроса;
- содержимое документа передаётся в отдельном блоке `untrusted_data`;
- модели запрещено менять policy, роли, лимит стоимости и маршрут;
- tools выключены по умолчанию;
- разрешён только allowlist инструментов;
- аргументы tool calls валидируются по JSON Schema;
- действия с побочными эффектами требуют отдельного подтверждения;
- URL, HTML, base64 и файлы без поддержки блокируются;
- локальный classifier LLM Guard / PromptInjection проверяет prompt до вызова;
- output classifier проверяет попытку обхода policy и утечку системных данных;
- повторные попытки обхода блокируют ключ и создают security event.

Prompt injection нельзя свести к нулю, но можно исключить опасные последствия:
даже успешно внедрённая инструкция не должна получить доступ к инструментам,
базе или чужим данным.

## 6. Запрещённое использование

До отправки модели:

- проверка запрещённых категорий контента;
- проверка возраста/типа аккаунта, если требуется;
- KYC/KYB для повышенных лимитов;
- rate limits по аккаунту, IP, API-ключу и платёжному инструменту;
- blocklists и fraud score;
- отказ при отсутствии согласия с условиями.

После модели:

- toxicity/banned-content scan;
- блокировка инструкций для незаконных действий;
- анализ tool calls;
- security events без сохранения исходного текста.

Для критических сценариев добавляется ручная модерация. Юридическую
классификацию и порядок работы с запросами госорганов должен утвердить юрист.

## 7. Как сделать доступ дешёвым

### `kz-auto`

Добавить публичный alias `kz-auto`:

```json
{
  "model": "kz-auto",
  "metadata": {
    "route_policy": {
      "quality": "balanced",
      "max_cost_kzt": 2.5,
      "max_output_tokens": 800
    }
  }
}
```

Router выбирает самую качественную модель, которая помещается в лимит:

1. классифицирует сложность задачи;
2. считает максимальную стоимость;
3. исключает модели с недостаточной длиной контекста;
4. проверяет доступность провайдера;
5. выбирает минимальную цену при достаточном качестве;
6. делает fallback только в пределах бюджета.

### Реальные рычаги снижения цены

- context compression;
- provider prompt caching;
- tenant-specific response cache;
- routing easy tasks to cheaper models;
- batch API для асинхронных задач;
- объёмные корпоративные контракты;
- BYOK для крупных клиентов;
- free trial-модели только для демо без PII;
- лимит output tokens;
- отказ от повторной передачи неизменного контекста.

### Чего нельзя обещать

Кэш и routing снижают средний чек, но не отменяют закупочную цену frontier-
модели. Нельзя продавать premium-модель дешевле provider cost на постоянной
основе. Цена «лучше прямого доступа» должна финансироваться из:

- скидки за объём;
- кэша;
- разницы между лёгкой и сложной маршрутизацией;
- подписки/SLA;
- free credits;
- локальных open-weight моделей.

## 8. Платёжная система

### Принцип

Оплата — предоплаченный кошелёк в KZT. Пользователь не платит отдельно за каждый
запрос и не передаёт карту QazRouter.

### Простой пользовательский путь

1. Нажимает «Пополнить».
2. Выбирает готовую сумму: 5 000 / 10 000 / 25 000 / 50 000 ₸.
3. Выбирает Kaspi QR, банковскую карту или счёт для ТОО.
4. Платёж проходит на стороне провайдера.
5. Webhook атомарно зачисляет деньги.
6. Пользователь сразу видит баланс, чек и документ для бухгалтерии.

Для регулярного использования:

- авто-пополнение при балансе ниже порога;
- сохранение только токена платёжного метода, но не карты;
- лимит автоплатежа;
- уведомление до списания;
- отключение одной кнопкой.

### Каналы

- Kaspi Pay merchant QR/acquiring — после подключения ИП/ТОО.
- Банковский эквайринг для карт.
- B2B-счёт и платёжное поручение.
- Ручной Kaspi-перевод как временный MVP.

### Обязательные свойства

- сумма и валюта определены на сервере, не в браузере;
- `payment_intent` с идемпотентным ключом;
- проверка webhook signature;
- запрет повторного зачисления;
- конвертация только через зафиксированный курс;
- ledger append-only;
- reconciliation с провайдером;
- возврат и ручная корректировка только через отдельный audited flow;
- PCI DSS: карта вводится только на hosted page провайдера.

### Рекомендуемые таблицы

```text
payment_intents(id, user_id, provider, amount_kzt, currency,
                idempotency_key, provider_payment_id, status, expires_at)

wallet_entries(id, user_id, kind, amount_kzt, reference_id,
               balance_after, created_at)

billing_holds(id, request_id, user_id, reserved_kzt, status,
              expires_at, settled_kzt)

model_price_versions(id, model, provider, input_cost_usd,
                     output_cost_usd, retail_input_kzt,
                     retail_output_kzt, effective_at)

risk_events(id, user_id, request_id, category, decision,
            score, policy_version, created_at)
```

`wallet_entries` — источник истины. `users.balance_kzt` — кэш/materialized
balance, который меняется в той же транзакции.

### Антифрод

- не выдавать крупный бесплатный кредит;
- новые аккаунты — низкий лимит;
- блокировать параллельные ключи с одинаковым платёжным отпечатком;
- проверять webhook и возвраты;
- ограничивать скорость до/после оплаты;
- ручная проверка крупных пополнений;
- не позволять одному платёжному инструменту создавать много аккаунтов;
- сохранять только хешированные технические признаки.

## 9. Резервирование денег на запрос

Текущий MVP списывает фактическую стоимость после ответа. Для production
следует добавить:

```text
estimate max cost
      ↓
reserve in PostgreSQL (row lock)
      ↓
call model
      ↓
actual cost ≤ reserve → settle, вернуть остаток
provider error        → release hold
actual cost > reserve → вторая транзакция/долг/блокировка
```

Это исключает бесплатные дорогие вызовы и гонки параллельных запросов.

## 10. Этапы

### Этап A — уже работает

- Vercel;
- Supabase Auth и RLS;
- GitHub OAuth;
- email/пароль и magic link;
- баланс, API-ключи, usage logs;
- strict API закрыт без PII scanner.

### Этап B — бесплатный локальный gateway

- запуск PII Scanner + LiteLLM + Redis на отдельном ПК;
- Tailscale/Cloudflare Tunnel с mTLS;
- AI Gateway API key;
- только разрешённые free models или ключ одного провайдера;
- обязательный лог policy decisions.

### Этап C — первые продажи

- Kaspi merchant account;
- PostgreSQL ledger + holds;
- собственный SMTP;
- KZ VPS для gateway;
- ручной/полуавтоматический fraud review.

### Этап D — production

- self-hosted Supabase в РК;
- два gateway-узла;
- Redis cluster и backup;
- отдельный policy service;
- billing reconciliation;
- DPIA, security review и юридический пакет;
- SLA и мониторинг.

## 11. Метрики, которые надо контролировать

- доля запросов без AI-вызова из-за policy;
- false positive по PII;
- cache hit rate;
- provider cost / retail revenue;
- задержка PII + injection + provider отдельно;
- доля fallback;
- число security events по типам;
- расхождение usage с провайдерским счётом;
- время зачисления после webhook;
- fraud rate по пополнениям.

## 12. Вывод

Самая дешёвая безопасная архитектура — не «самая дешёвая модель для всего», а
контролируемый router:

```text
дешёвая модель для простого
+ лучшая модель для сложного
+ кэш
+ жёсткий budget cap
+ PII и injection firewall
+ предоплаченный кошелёк
```

Это даёт предсказуемую экономику. Обещание «любая frontier-модель всегда дешевле
рынка без ограничений» математически и коммерчески невыполнимо.
