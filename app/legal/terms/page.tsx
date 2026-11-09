import type { Metadata } from "next";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";

export const metadata: Metadata = {
  title: "Условия использования",
  description: "Черновик условий использования QazRouter."
};

export default function TermsPage() {
  return (
    <main className="min-h-screen px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <BrandMark />
        <div className="mt-14 rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] p-4 text-xs leading-6 text-amber-100/70">
          Это рабочий черновик. Тарифы, ответственность, SLA и порядок возврата
          требуют утверждения до коммерческого запуска.
        </div>
        <article className="mt-8 space-y-7 text-sm leading-7 text-slate-400">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-mint-400">
              Legal
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">
              Условия использования
            </h1>
            <p className="mt-2 text-xs text-slate-600">
              Версия 1.0 · 9 ноября 2026 года
            </p>
          </div>

          <section>
            <h2 className="font-medium text-white">1. Назначение сервиса</h2>
            <p className="mt-2">
              QazRouter предоставляет программный доступ к выбранным AI-моделям
              через API, оплату в тенге и журналирование фактического
              использования.
            </p>
          </section>

          <section>
            <h2 className="font-medium text-white">2. Доступ и ключи</h2>
            <p className="mt-2">
              Пользователь отвечает за сохранность пароля и API-ключей. Ключ
              показывается один раз. При подозрении на компрометацию его
              необходимо отозвать в кабинете.
            </p>
          </section>

          <section>
            <h2 className="font-medium text-white">3. Баланс и тарифы</h2>
            <p className="mt-2">
              Запрос выполняется при достаточном балансе. Итоговая стоимость
              рассчитывается по фактическим токенам. Тарифы могут изменяться с
              предварительным отображением новой цены в кабинете.
            </p>
          </section>

          <section>
            <h2 className="font-medium text-white">4. Допустимое использование</h2>
            <p className="mt-2">
              Запрещены незаконный контент, атаки, обход ограничений провайдера,
              перепродажа доступа без соглашения и загрузка чувствительных данных
              способом, который нарушает применимое право.
            </p>
          </section>

          <section>
            <h2 className="font-medium text-white">5. Доступность</h2>
            <p className="mt-2">
              MVP предоставляется без гарантированного SLA. Плановые работы,
              ограничения провайдеров и недоступность внешних API могут влиять на
              работу. Платное SLA должно оформляться отдельным договором.
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
