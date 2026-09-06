/**
 * 한국어 조사 선택 — 받침 유무로 갈린다.
 *
 * "인터넷는", "대형가전는"처럼 어긋난 조사는 자동 생성 문장이라는 걸
 * 드러내서 읽는 사람의 신뢰를 깎는다. 라틴 문자·숫자로 끝나면 읽는 법이
 * 갈려 판정이 안 되므로 받침 없는 쪽을 쓴다("SK" → "SK는").
 */
export function particle(word: string, withFinal: string, withoutFinal: string) {
  const ch = word.trim().slice(-1);
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    return (code - 0xac00) % 28 !== 0 ? withFinal : withoutFinal;
  }
  return withoutFinal;
}

/** 주제 조사 — "정수기는" / "인터넷은" */
export const topic = (word: string) => `${word}${particle(word, "은", "는")}`;
