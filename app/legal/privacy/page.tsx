import type { Metadata } from "next";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";

export const metadata: Metadata = {
  title: "Политика конфиденциальности",
  description: "Черновик политики обработки персональных данных QazRouter."
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <BrandMark />
        <div className="mt-14 rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] p-4 text-xs leading-6 text-amber-100/70">
          Это рабочий черновик до юридического аудита. До подключения реальных
          клиентских данных документ должен быть проверен казахстанским юристом и
          дополнен реквизитами оператора.
        </div>
        <article className="mt-8 space-y-7 text-sm leading-7 text-slate-400">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-mint-400">
              Legal
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">
              Политика конфиденциальности
            </h1>
            <p className="mt-2 text-xs text-slate-600">
              Версия 1.0 · 9 ноября 2026 года
            </p>
          </div>

          <section>
            <h2 className="font-medium text-white">1. Какие данные мы получаем</h2>
            <p className="mt-2">
              При регистрации: email, имя или название компании, идентификатор
              GitHub, дата создания аккаунта. При использовании сервиса: хеши
              API-ключей, баланс, суммы, количество токенов, модель, задержка,
              версия PII-политики и счётчики скрытых сущностей. Тексты запросов и
              ответов не записываются в PostgreSQL.
            </p>
          </section>

          <section>
            <h2 className="font-medium text-white">2. Цели обработки</h2>
            <p className="mt-2">
              Аутентификация, предоставление доступа к API, расчёт стоимости,
              предотвращение злоупотреблений, поддержка и выполнение требований
              законодательства.
            </p>
          </section>

          <section>
            <h2 className="font-medium text-white">3. PII и AI-провайдеры</h2>
            <p className="mt-2">
              Перед обращением к AI-модели должен работать локальный PII scanner.
              Он заменяет явные и распознанные персональные данные на безопасные
              токены. Соответствие токенов исходным значениям хранится в памяти
              только на время одного запроса и не записывается в базу. При
              недоступности scanner AI-запрос блокируется.
            </p>
          </section>

          <section>
            <h2 className="font-medium text-white">4. Инфраструктура</h2>
            <p className="mt-2">
              Текущий MVP использует Vercel и Supabase Cloud. Эти сервисы могут
              обрабатывать данные за пределами Казахстана. Поэтому MVP не
              предназначен для конфиденциальных или регулируемых данных до
              переноса raw prompt, базы и gateway в контур в Республике Казахстан.
            </p>
          </section>

          <section>
            <h2 className="font-medium text-white">5. Передача третьим лицам</h2>
            <p className="mt-2">
              Обезличенный AI-запрос может передаваться выбранному провайдеру
              модели. Для production необходимо использовать договоры
              no-training/zero-retention там, где они доступны, и вести реестр
              получателей и стран передачи.
            </p>
          </section>

          <section>
            <h2 className="font-medium text-white">6. Права пользователя</h2>
            <p className="mt-2">
              Пользователь может запросить доступ, исправление или удаление
              аккаунта. Порядок подачи запроса должен быть окончательно определён
              оператором до публичного запуска.
            </p>
          </section>
        </article>
        <Link
          href="/login"
          className="mt-10 inline-flex text-xs text-mint-400 hover:text-white"
        >
          Вернуться к регистрации
        </Link>
      </div>
    </main>
  );
}
