/** 이름 뒤에 「으로」 나 「로」 를 붙인다. 받침이 없거나 ㄹ 받침이면 「로」 다(하린으로, 유나로, 노엘로). */
export function withRo(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return `${word}로`;
  const final = code % 28;
  return final === 0 || final === 8 ? `${word}로` : `${word}으로`;
}
