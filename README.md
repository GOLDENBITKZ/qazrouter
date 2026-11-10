# QazRouter

OpenAI-совместимый AI-роутер для бизнеса в Казахстане: оплата в KZT,
маршрутизация через LiteLLM, локальный PII-шлюз, журналирование токенов и
атомарное списание баланса.

## Стек

- Next.js 16 App Router + TypeScript;
- Tailwind CSS;
- Supabase Auth, PostgreSQL и RLS;
- LiteLLM Proxy — единая маршрутизация к нескольким AI-провайдерам;
- локальный сервис PII detection на FastAPI, GLiNER и regex;
- Redis для кэша уже обезличенных запросов;
- Vercel Functions или self-hosted Next.js для закрытого контура.

## Модели

Публичные алиасы скрывают upstream-провайдеров и позволяют менять модели без
изменения клиентского кода.

| Публичная модель | LiteLLM route | Upstream по умолчанию |
| --- | --- | --- |
| `kz-deepseek` | `kz-deepseek` | `deepseek/deepseek-chat` |
| `kz-gemini` | `kz-gemini` | `gemini/gemini-2.5-flash` |
| `kz-gpt` | `kz-gpt` | `KZ_GPT_UPSTREAM_MODEL`, по умолчанию `openai/gpt-5.5` |
| `kz-claude` | `kz-claude` | `KZ_CLAUDE_UPSTREAM_MODEL` |
| `kz-qwen` | `kz-qwen` | `KZ_QWEN_UPSTREAM_MODEL` через OpenRouter |
| `kz-llama` | `kz-llama` | `KZ_LLAMA_UPSTREAM_MODEL` через Groq |

Модели и upstream-идентификаторы находятся в
[litellm/config.yaml](litellm/config.yaml). Клиентские алиасы, отображаемые
названия и тенговые тарифы — в [lib/billing/pricing.ts](lib/billing/pricing.ts).

## GPU Vast.ai из кабинета

В кабинете доступен выбор Qwen 2.5 7B Instruct, Qwen 2.5 Coder 7B Instruct
или Llama 3.1 8B Instruct, подбор дешёвого GPU, подтверждение цены, запуск,
проверка готовности и освобождение аренды. Это отдельные модели с алиасами
`kz-vast-qwen`, `kz-vast-coder`, `kz-vast-llama` и пилотными тарифами ниже
существующих Qwen/Llama; качество небольших моделей отличается.

Заказ создаётся сразу. Загрузка весов и запуск vLLM занимают несколько минут.
GPU арендуется только после подтверждения цены. Один активный инстанс на
пользователя, серверный лимит $/час и ограниченный срок аренды защищают расходы.

Vast.ai получает только результат локального strict PII-сканирования.
Для динамических личных инстансов используется отдельный HTTPS-провайдер с
сертификатом и ключом каждого инстанса; остальные модели работают через LiteLLM.

**Подключение и ограничения:** [docs/vastai.md](docs/vastai.md).
Нужно применить [supabase/vast.sql](supabase/vast.sql), опубликовать worker image,
настроить серверные переменные и включить cron освобождения GPU.

## Защита PII

Запрос проходит следующий путь:

```text
Client
  │  Bearer kz_live_...
  ▼
Next.js API: auth + balance
  │  raw prompt только по приватной сети
  ▼
PII Scanner: regex + GLiNER
  │  __KZ_PII_PERSON_1__ вместо ФИО
  │  ephemeral replacement map в памяти
  ▼
LiteLLM Proxy
  │  только обезличенный prompt
  ▼
DeepSeek / Gemini / OpenAI / Anthropic / Qwen / Llama
  │  ответ с токенами вместо PII
  ▼
Next.js: ephemeral reverse mapping
  │
  ▼
Client получает нормальный ответ
```

Реализованная политика:

- `PII_STRICT_MODE=true` включён по умолчанию;
- при недоступности scanner API возвращает `503` и не вызывает LiteLLM;
- при ошибке загрузки NER-модели scanner не проходит healthcheck;
- ИИН, телефоны, карты, email, IBAN, паспортные номера и банковские счета
  обнаруживаются детерминированными правилами;
- ФИО и адреса ищет локальная multilingual GLiNER-модель;
- пересекающиеся сущности разрешаются до замены;
- исходные значения проверяются на отсутствие в очищенном prompt;
- карта соответствия `token → original` живёт только в памяти одного запроса;
- в PostgreSQL сохраняются только типы, количества и risk score, но не PII;
- LiteLLM message logging отключён;
- Redis кэширует только уже очищенные сообщения;
- ключи провайдеров находятся у LiteLLM и не передаются публичному API.

Даже такая схема не даёт математической гарантии «нулевой утечки»: косвенные
идентификаторы, уникальные факты, изображения и документы с текстом внутри
требуют отдельного DLP. Поэтому strict-шлюз блокирует неподдерживаемый контент,
а юридическая гарантия требует аудита конкретной инфраструктуры и договоров с
провайдерами.

## Статус production MVP

Публичный MVP развёрнут на `https://qazrouter.vercel.app`. Работают лендинг,
регистрация через GitHub, email/пароль и magic-link, профиль, баланс и
управление ключами.

AI API остаётся закрытым в strict-режиме, пока рядом с ним не развернуты PII
Scanner и LiteLLM. Если scanner недоступен, Vercel не отправляет prompt
провайдеру. Это ограничение нельзя отключать для реальных персональных данных.

Vercel AI Gateway предоставляет единый API к большому каталогу моделей,
routing и spend tracking. На ноябрь 2026 бесплатный кредит $5 в месяц требует
верификации карты без списания. Без карты доступны отдельные бесплатные модели.
AI Gateway можно использовать как upstream LiteLLM, но он не заменяет локальный
PII scanner.

### OpenRouter без downgrade модели

Файл [litellm/openrouter.config.yaml](litellm/openrouter.config.yaml) содержит
quality-preserving маршрутизацию:

- запрос всегда остаётся на конкретном model slug;
- fallback разрешён только между провайдерами этой же модели;
- `sort: price` выбирает дешёвый endpoint;
- `zdr: true` требует zero-retention;
- `data_collection: deny` исключает сбор данных;
- `require_parameters: true` не позволяет тихо выбросить параметры.

Включение:

```dotenv
LITELLM_CONFIG_FILE=./litellm/openrouter.config.yaml
OPENROUTER_API_KEY=sk-or-v1-...
```

`allow_fallbacks` в этом конфиге не означает переход на другую модель. Он
разрешает только резервного провайдера того же точного model slug. Это
сохраняет качество и тип модели, но провайдеры могут отличаться квантованием,
лимитами и доступностью.

## Быстрый запуск

### 1. Установить зависимости

```bash
npm install
```

### 2. Создать локальные переменные

```powershell
Copy-Item .env.local.example .env.local
```

Заполните Supabase и как минимум один AI-провайдер. Ключи остальных моделей
можно добавить позже.

Сгенерируйте секреты:

```bash
openssl rand -hex 32
```

Значения `API_KEY_HASH_PEPPER`, `PII_SCANNER_TOKEN`,
`LITELLM_MASTER_KEY` и `REDIS_PASSWORD` должны быть разными.

### 3. Применить SQL

Выполните [supabase/schema.sql](supabase/schema.sql) в Supabase SQL Editor.
Схема идемпотентно обновляет `usage_logs` и RPC `charge_usage`, если проект уже
создавался по первой версии.

### 4. Поднять закрытый AI-шлюз

```bash
docker compose --env-file .env.local -f docker-compose.kz.yml up --build
```

Запустятся:

- PII Scanner: `127.0.0.1:8001`;
- LiteLLM Proxy: `127.0.0.1:4000`;
- Redis без публикации порта.

Первая сборка scanner занимает заметно больше времени: в Docker image
скачивается GLiNER-модель. Это сделано специально, чтобы production-контейнер
не зависел от Hugging Face во время запуска.

Проверить scanner:

```bash
curl http://127.0.0.1:8001/health
```

### 5. Запустить Next.js

```bash
npm run dev
```

Приложение откроется на `http://localhost:3000`.

### 6. Настроить GitHub OAuth

- Authentication → Providers → GitHub в Supabase.
- Создайте GitHub OAuth App.
- Supabase callback: `https://<project>.supabase.co/auth/v1/callback`.
- Redirect URL: `http://localhost:3000/auth/callback` для разработки.
- Для production добавьте `https://your-domain.kz/auth/callback`.

Вход по email включается автоматически через Supabase Email provider. В
Supabase Authentication → URL Configuration должны быть разрешены:

- `http://localhost:3000/auth/callback`;
- `https://qazrouter.vercel.app/auth/callback`;
- callback нового домена после его подключения.

Встроенный SMTP Supabase подходит для ограниченного MVP. Для публичной
регистрации необходимо подключить собственный SMTP-провайдер и настроить
ограничения частоты.

## Переменные окружения

Основные группы:

```dotenv
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
API_KEY_HASH_PEPPER=long-random-secret

# Next.js
NEXT_PUBLIC_SITE_URL=http://localhost:3000
LITELLM_BASE_URL=http://127.0.0.1:4000
LITELLM_MASTER_KEY=sk-long-random-secret
PII_SCANNER_URL=http://127.0.0.1:8001
PII_SCANNER_TOKEN=long-random-scanner-token
PII_STRICT_MODE=true
PII_POLICY_VERSION=kz-pii-v2
PII_REQUIRED_ENGINE=gliner+regex-v2

# LiteLLM providers
DEEPSEEK_API_KEY=...
GEMINI_API_KEY=...
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
OPENROUTER_API_KEY=...
GROQ_API_KEY=...

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=long-random-password
```

Полный шаблон: [.env.local.example](.env.local.example).

## API

```bash
curl http://localhost:3000/api/v1/chat/completions \
  -H "Authorization: Bearer kz_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kz-claude",
    "messages": [
      {
        "role": "user",
        "content": "Клиент Алия, ИИН 940512300123. Проверь договор."
      }
    ],
    "temperature": 0.2,
    "max_tokens": 800
  }'
```

Провайдер увидит примерно:

```text
Клиент __KZ_PII_PERSON_1__, ИИН __KZ_PII_IIN_2__. Проверь договор.
```

Клиент получит обычный OpenAI-совместимый ответ, в котором разрешённые токены
локально восстановлены из памяти текущего запроса.

Основные статусы:

- `400` — некорректный запрос, неизвестная модель, `stream: true`;
- `401` — отсутствующий или отключённый API-ключ;
- `402` — нулевой или недостаточный баланс;
- `429` — ограничение провайдера;
- `502` — недоступность AI-провайдера;
- `503` — недоступен или не прошёл проверку PII scanner.

В текущей версии поддерживается не-streaming текст. `stream: true`, изображения,
аудио и документы возвращают понятную ошибку до вызова провайдера.

## Кэширование контекста

LiteLLM/Redis кэширует только сообщения после PII-замены. Клиент может передать
стабильный ключ:

```json
{
  "metadata": {
    "context_cache": {
      "enabled": true,
      "key": "contract-42-v3",
      "ttl_seconds": 3600
    }
  }
}
```

Кэш не должен включаться для запросов, где исходный текст содержит PII: в Redis
попадут токены, а не оригиналы, но сам факт хранения контекста нужно отразить в
политике конфиденциальности.

## Тарифы

| Модель | Вход, KZT / 1M | Выход, KZT / 1M |
| --- | ---: | ---: |
| `kz-deepseek` | 150 | 600 |
| `kz-gemini` | 180 | 720 |
| `kz-gpt` | 1 200 | 4 800 |
| `kz-claude` | 1 500 | 7 500 |
| `kz-qwen` | 90 | 360 |
| `kz-llama` | 60 | 240 |

Это стартовые значения, а не подтверждённый прайс-лист. Тарифы GPT/Claude/Qwen/
Llama особенно чувствительны к выбранной upstream-модели, курсу USD/KZT и
условиям провайдера.

Одновременно получить «очень большую маржу», цену ниже закупки и гарантию
качества нельзя. Экономика должна учитывать:

```text
маржа = цена клиенту
      - закупка токенов
      - cache miss
      - DLP и NER compute
      - платёжные расходы
      - налоги
      - поддержка
      - инфраструктура Казахстана
```

Для маржи лучше продавать пакеты, SLA, закрывающие документы, приватный контур и
кэширование повторяющегося контекста, а не субсидировать каждый frontier-токен.

## Резидентность и Vercel

Supabase Cloud не предоставляет регион в Казахстане. Vercel получает исходный
запрос до того, как он попадёт в локальный PII scanner. Поэтому:

### Пилот на Vercel

Подходит, если юридическая оценка допускает обработку raw prompt за пределами
РК. Next.js обращается к PII scanner и LiteLLM по HTTPS с mTLS. Провайдеры
получают только очищенный текст.

### Строгий контур в Казахстане

Для требования «raw prompt и база не покидают РК» нужен следующий deployment:

1. Next.js API на сервере или в Kubernetes в Казахстане.
2. Self-hosted Supabase/PostgreSQL в казахстанском ЦОД.
3. PII Scanner и LiteLLM в той же приватной сети.
4. Egress allowlist только к API выбранных AI-провайдеров.
5. mTLS между Next.js, scanner и LiteLLM.
6. Шифрование диска, audit logs, ротация секретов и бэкапы в РК.
7. DPIA, договоры с провайдерами, проверка требований МЦРИАП.

Только этот вариант соответствует заявлению о локальной обработке персональных
данных. Vercel-вариант оставляйте для MVP и не называйте абсолютным
комплаенсом.

## Полный контроль утечек

Технически «полный контроль» означает не «одна регулярка», а комбинацию мер:

- strict fail-closed: нет scanner → нет AI-вызова;
- raw prompt не сохраняется в БД и application logs;
- PII не переходит границу в LiteLLM;
- LiteLLM не логирует тела сообщений;
- Redis получает только токенизированный context;
- у каждого провайдера включён zero-retention/no-training режим;
- запрещены unsupported media и вложения без отдельного DLP;
- ответ проверяется и восстанавливается только в памяти;
- сервисы scanner/LiteLLM недоступны из публичного интернета;
- mTLS и сетевые политики запрещают прямой доступ к DLP;
- регулярно прогоняется adversarial-корпус на казахском, русском, английском;
- инциденты и изменения политики логируются без содержимого prompt.

Остаточные риски: косвенные идентификаторы, уникальные бизнес-факты, стилометрия,
ошибки самой NER-модели и политика хранения upstream-провайдера. Для банковских
или медицинских данных нужен отдельный on-prem/private-cloud DLP и независимый
security review.

## Проверки

```bash
npm run typecheck
npm test
npm run build
```

Тесты покрывают маскирование, strict fail-closed, проверку ответа scanner,
обратное восстановление токенов, наличие всех моделей и тенговый биллинг.

## Структура

```text
app/api/v1/chat/completions/route.ts   OpenAI-compatible API
lib/providers/litellm.ts               единый provider gateway
lib/security/pii-protection.ts         strict DLP client
services/pii-scanner/                  FastAPI + GLiNER scanner
litellm/config.yaml                     алиасы и модели LiteLLM
docker-compose.kz.yml                   scanner + LiteLLM + Redis
supabase/schema.sql                     таблицы, RLS и billing RPC
tests/                                  unit-тесты
```

## Перед production

- Замените демонстрационные Kaspi-реквизиты и QR.
- Выберите upstream-модели и утвердите тенговые тарифы.
- Настройте `approve_topup` и закрывающие документы.
- Ограничьте service-role, LiteLLM master key и scanner token.
- Включите mTLS, WAF/rate limiting, резервное копирование и мониторинг.
- Проведите нагрузочный тест NER и финансовую сверку с провайдерами.
- Проведите юридический, privacy и security-аудит.
