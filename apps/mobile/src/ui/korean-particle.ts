/** 이름 뒤에 「으로」 나 「로」 를 붙인다. 받침이 없거나 ㄹ 받침이면 「로」 다(하린으로, 유나로, 노엘로). */
export function withRo(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return `${word}로`;
  const final = code % 28;
  return final === 0 || final === 8 ? `${word}로` : `${word}으로`;
}

/** 숫자를 읽었을 때 받침이 있는지(영, 일, 삼, 육, 칠, 팔). */
const DIGIT_HAS_FINAL: Record<string, boolean> = {
  "0": true,
  "1": true,
  "2": false,
  "3": true,
  "4": false,
  "5": false,
  "6": true,
  "7": true,
  "8": true,
  "9": false,
};

/** 이름 뒤에 「을」 이나 「를」 을 붙인다. 숫자는 읽는 소리로 고르고, 한글과 숫자가 아니면 「을(를)」 이다. */
export function withObject(word: string): string {
  const last = word.at(-1) ?? "";
  if (last in DIGIT_HAS_FINAL) return `${word}${DIGIT_HAS_FINAL[last] ? "을" : "를"}`;
  const code = last.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return `${word}을(를)`;
  return code % 28 === 0 ? `${word}를` : `${word}을`;
}

/** 이름 뒤에 「은」 이나 「는」 을 붙인다. 한글이 아니면 「은(는)」 이다. */
export function withTopic(word: string): string {
  const code = (word.at(-1) ?? "").charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return `${word}은(는)`;
  return code % 28 === 0 ? `${word}는` : `${word}은`;
}
