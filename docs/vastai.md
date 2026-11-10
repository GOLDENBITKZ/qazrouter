# Vast.ai: модели на своих GPU

## Что реализовано

Кабинет → точная модель → самое дешёвое подходящее предложение → подтверждение
цены → Vast.ai create instance → загрузка весов → проверка TLS и `/v1/models`
→ OpenAI-совместимый API QazRouter. UI проверяет статус каждые 15 секунд,
пока вкладка открыта. Закрытие вкладки не отменяет заказ и не мешает cron.

| Алиас API | Точная модель | Вход / выход, ₸ за 1M |
| --- | --- | --- |
| `kz-vast-qwen` | `Qwen/Qwen2.5-7B-Instruct` | 45 / 180 |
| `kz-vast-coder` | `Qwen/Qwen2.5-Coder-7B-Instruct` | 45 / 180 |
| `kz-vast-llama` | `meta-llama/Llama-3.1-8B-Instruct` | 30 / 120 |

Это пилотные розничные тарифы. GPU оплачивается из подключённого аккаунта
Vast.ai, API-токены — из баланса пользователя QazRouter. Аренда идёт и во время
загрузки/простоя; трафик Vast.ai оплачивается отдельно. Цена предложения
учитывает выделенный диск 40 GB через `allocated_storage`. Это оценка аренды,
а не обещание полной фиксированной стоимости, доходности или окупаемости.

У Qwen/Llama этих размеров другая производительность и качество, чем у крупных
моделей в исходном каталоге. Их алиасы не заменяют существующие модели.
Для снижения себестоимости в production измерьте фактический throughput,
загрузку GPU, задержки и стоимость простоя, затем утвердите тарифы в
`lib/vast/catalog.ts`. Гарантировать экономию только низкой ценой GPU нельзя.

Подбор: verified on-demand, один GPU с минимум 24 GB VRAM, compute capability
от 8.0, CUDA от 12.8, надёжность от 0.99, доступный TLS-порт и диск.
Рынок может не дать подходящего предложения в пределах лимита.

## 1. Подготовить worker image

Нужен Docker с NVIDIA runtime на GPU-хосте; Vast.ai предоставляет такой хост.
Локально GPU для сборки не требуется. Возьмите совместимый официальный образ
vLLM с CUDA 12.8, проверьте его версию и зафиксируйте digest. Образ должен
поддерживать `vllm serve`, `VLLM_API_KEY`, `--disable-log-requests` и
`--disable-uvicorn-access-log`.

```bash
docker build \
  --build-arg VLLM_IMAGE=vllm/vllm-openai@sha256:<reviewed-base-image-digest> \
  -t ghcr.io/<owner>/qazrouter-vast-worker:1 \
  services/vast-worker
docker push ghcr.io/<owner>/qazrouter-vast-worker:1
docker inspect --format='{{index .RepoDigests 0}}' ghcr.io/<owner>/qazrouter-vast-worker:1
```

Используйте публично скачиваемый образ без встроенных секретов; интеграция не
передаёт registry credentials. В `VAST_WORKER_IMAGE` укажите полученный
`ghcr.io/...@sha256:...`, а не изменяемый tag. В production сначала проверьте
этот образ на тестовой аренде. Здесь без ключа Vast.ai и GPU полный запуск
vLLM не проверялся.

Worker поднимает vLLM на `127.0.0.1:8000`. Наружу опубликован только TLS gateway
на `8443`, с разрешёнными `GET /v1/models` и `POST /v1/chat/completions`.
Запросы требуют отдельный worker token. Управляющий ключ Vast.ai на GPU не
попадает. Размеры, параллелизм и время запросов ограничены; streaming отключён.
Контекст vLLM — 8192 токена вместе с ответом; слишком длинный запрос отклоняется,
а не обрезается. Для этих моделей по умолчанию выдаётся до 1024 токенов ответа.

## 2. Применить миграцию

После основной `supabase/schema.sql` выполните `supabase/vast.sql`.
Миграция повторно применима. Таблица `vast_deployments` доступна только
`service_role`, RLS включён, прямой доступ `anon`/`authenticated` отозван.
Уникальный частичный индекс допускает ровно одну активную аренду на аккаунт.

Запись содержит только ID, модель, состояние, цену, адрес, публичный сертификат
и срок аренды. Prompt, карта PII, приватный TLS-ключ и worker token не
сохраняются. Ссылка на владельца не удаляется каскадно, чтобы удаление аккаунта
не потеряло учёт оплачиваемого GPU. Для удаления профиля сначала освободите
все его GPU и архивируйте записи по утверждённой политике хранения.

## 3. Настроить Next.js

```dotenv
VAST_API_KEY=<scoped-vast-api-key>
VAST_WORKER_IMAGE=ghcr.io/<owner>/qazrouter-vast-worker@sha256:<64-hex-digest>
VAST_DEPLOYMENT_SECRET=<random-at-least-32-characters>
VAST_ALLOWED_USER_IDS=<supabase-user-uuid>,<another-user-uuid>
VAST_MAX_HOURLY_USD=0.5
VAST_SESSION_MINUTES=60
CRON_SECRET=<another-random-secret>
# Только для gated Llama, после принятия условий модели в Hugging Face:
VAST_HF_TOKEN=<scoped-read-token>
```

Сгенерируйте разные секреты: `openssl rand -hex 32`. Не помещайте их в
`NEXT_PUBLIC_*`, репозиторий, параметры URL или клиентские компоненты.
Разрешения Vast API key: поиск offers, создание, список/чтение и уничтожение
instances. Финансовые операции и доступ к другим ресурсам этому ключу не нужны.

Незаполненный allowlist запрещает аренду всем. Разрешения выдаются владельцем
платящего аккаунта Vast.ai по UUID Supabase. Пользователь видит и использует
только свою аренду. После отзыва доступа к запуску он всё ещё может освободить
уже заказанный ресурс. GPU не создаётся при открытии страницы или API-вызове.

Лимит цены обязателен и ограничен значениями от 0 до $10/час, срок — 10–120
минут. Лимит цены проверяется при подборе и повторно перед платным запросом.
Браузер не может передать произвольный image, модель, shell-команду, адрес или
цену. Предложение подписано HMAC, привязано к пользователю и действует 5 минут.

Не меняйте `VAST_API_KEY`/`VAST_DEPLOYMENT_SECRET`, пока есть активные аренды:
первый нужен для удаления, второй — для worker authentication. Сначала
освободите аренды, затем выполните ротацию.

## 4. Включить освобождение ресурсов

Для освобождения GPU нужен внешний scheduler, вызывающий endpoint каждые 5 минут:

```text
GET /api/internal/vast/reconcile
Authorization: Bearer <CRON_SECRET>
```

В `vercel.json` расписание намеренно не включено: Vercel Hobby допускает только
один запуск cron в сутки, а более частое расписание блокирует deployment.
Используйте Supabase Cron или cron/systemd scheduler на вашем сервере.
На Vercel Pro можно отдельно добавить cron `*/5 * * * *` с указанным path.
Секрет передавайте через Vault/серверное хранилище секретов, а не в открытом SQL.
Развёртывание не настраивает внешний scheduler автоматически.
Ограничьте сетевой доступ к endpoint и настройте alert на неуспешные вызовы,
зависшие аренды и фактические расходы в аккаунте Vast.ai.

Cron сверяет durable label `qzr-<deployment-id>` и удаляет истёкшие инстансы,
даже если вкладка закрыта или первоначальный create завершился таймаутом.
Повторное создание после неопределённого ответа запрещено. Сверка повторяется
после ошибки удаления; запись не считается завершённой без подтверждения.
Параллелизм и длительность прохода ограничены; при большой очереди вызывайте
endpoint чаще или добавьте очередь cleanup с постоянным worker.

Worker сам прекращает inference по истечении срока, но это **не прекращает
оплату аренды Vast.ai**. Её прекращает подтверждённый `DELETE instance`.
При недоступном scheduler/control plane расходы могут продолжаться сверх
показанного срока; необходим мониторинг со стороны владельца аккаунта.

Если статус заказа `unknown`, не создавайте новый инстанс вручную по той же
кнопке. Сначала проверьте label в Vast.ai и восстановите/завершите запись.
Если API стабильно не показывает инстанс с этой меткой, владелец может после
проверки пометить запись `failed`. Система намеренно не освобождает такой
резерв автоматически по отсутствию результата в одном списке.

## 5. Проверить сценарий

1. Войти разрешённым пользователем, выбрать модель и подобрать GPU.
2. Проверить GPU, регион, $/час и время сеанса; подтвердить заказ.
3. Дождаться «Модель готова»: контейнер `running` сам по себе недостаточен.
4. Вызвать обычный QazRouter API с выбранным `kz-vast-*` алиасом.
5. Убедиться, что токены/списание попали в usage logs с `provider=vastai`.
6. Освободить GPU кнопкой и проверить удаление в Vast.ai.
7. На короткой тестовой аренде проверить освобождение cron при закрытой вкладке.

```bash
curl https://<qazrouter-host>/api/v1/chat/completions \
  -H "Authorization: Bearer <qazrouter-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"model":"kz-vast-qwen","messages":[{"role":"user","content":"Привет!"}],"max_tokens":128}'
```

Без готовой личной аренды вернётся `503`. Неуспешный inference не списывает
токены. Закупочная цена за запрос остаётся `null`: почасовую GPU-аренду нельзя
выдавать за точную себестоимость конкретного запроса.

## Защита данных

```text
Client → QazRouter auth/balance → local strict PII scanner
       → only redacted messages → per-instance authenticated TLS → Vast vLLM
       → response → in-memory PII restore → Client
```

Динамические Vast endpoints обслуживает `lib/providers/vastai.ts`, после того же
`protectChatMessages`, что и LiteLLM-модели. Прямой маршрут нужен для личного
инстанса и проверки его собственного TLS-сертификата. Альтернативный провайдер
при ошибке не вызывается. Worker не получает raw prompt, карту восстановления,
Supabase credentials или Vast management key. Контент не пишется в HTTP/vLLM
логи; ошибки upstream не пересылают исходные тела. Redis/context cache не
используется для Vast-моделей.

Сертификат генерируется до аренды, приватный ключ передаётся только выбранному
worker, публичный сертификат сохраняется в server-only таблице. Next.js проверяет
цепочку и SNI `qazrouter-worker` с доверием только этому сертификату; TLS validation
не отключается. Адрес берётся из authenticated Vast API, допускается только
публичный IPv4 и порт mapping `8443/tcp`; DNS и redirects не используются.

Хозяин GPU технически контролирует свой хост и может видеть обезличенные
сообщения. PII masking не гарантирует удаление косвенных идентификаторов и
бизнес-секретов. Для данных, которым нельзя покидать РК, требуется локальный
Next.js/БД/scanner и отдельная оценка допустимости обезличенного egress.
Это не обещание абсолютного отсутствия утечек или data residency Vast.ai в РК.

## Локальные проверки

```bash
npm ci
npm run typecheck
npm test
python -m unittest discover -s services/vast-worker -v
npm run build
# Если локальный Turbopack аварийно завершается:
npm run build -- --webpack
```

Тесты не арендуют платные GPU. Проверяются PostgreSQL permissions/unique index,
подпись цены, ownership, лимиты, неопределённый create, освобождение аренды,
настоящий локальный TLS handshake, валидация usage и worker gateway.

Официальные протоколы: [Vast.ai get started](https://docs.vast.ai/guides/get-started),
[search offers](https://docs.vast.ai/api-reference/search/search-offers),
[create instance](https://docs.vast.ai/api-reference/instances/create-instance),
[networking](https://docs.vast.ai/guides/instances/connect/networking),
[destroy instance](https://docs.vast.ai/api-reference/instances/destroy-instance).
