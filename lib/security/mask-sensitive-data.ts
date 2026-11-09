export interface MaskingResult {
  text: string;
  counts: {
    iin: number;
    phone: number;
    card: number;
  };
}

const MASK_IIN = "[ИИН СКРЫТ ПО ЗАКОНУ РК]";
const MASK_PHONE = "[ТЕЛЕФОН СКРЫТ ПО ЗАКОНУ РК]";
const MASK_CARD = "[КАРТА СКРЫТА ПО ЗАКОНУ РК]";

// Границы исключают совпадение с частью более длинного числа.
const IIN_PATTERN = /(?<!\d)\d{12}(?!\d)/g;
const KZ_PHONE_PATTERN =
  /(?<!\d)(?:\+?7|8)[\s\-()]*\d{3}[\s\-()]*\d{3}[\s\-()]*\d{2}[\s\-()]*\d{2}(?!\d)/g;
const CARD_CANDIDATE_PATTERN = /(?<!\d)(?:\d[ -]?){13,19}(?!\d)/g;

function passesLuhn(rawCard: string): boolean {
  const digits = rawCard.replace(/\D/g, "");

  if (digits.length < 13 || digits.length > 19) {
    return false;
  }

  let sum = 0;
  let doubleDigit = false;

  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);

    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    doubleDigit = !doubleDigit;
  }

  return sum % 10 === 0;
}

/**
 * Маскирует ИИН, казахстанские телефоны и номера банковских карт.
 * Функция идемпотентна: повторная обработка уже скрытых данных безопасна.
 */
export function maskSensitiveText(input: string): MaskingResult {
  let text = input;
  const counts = { iin: 0, phone: 0, card: 0 };

  text = text.replace(IIN_PATTERN, () => {
    counts.iin += 1;
    return MASK_IIN;
  });

  text = text.replace(KZ_PHONE_PATTERN, () => {
    counts.phone += 1;
    return MASK_PHONE;
  });

  text = text.replace(CARD_CANDIDATE_PATTERN, (candidate) => {
    if (!passesLuhn(candidate)) {
      return candidate;
    }

    counts.card += 1;
    return MASK_CARD;
  });

  return { text, counts };
}

export function mergeMaskingCounts(
  target: MaskingResult["counts"],
  source: MaskingResult["counts"]
): void {
  target.iin += source.iin;
  target.phone += source.phone;
  target.card += source.card;
}
