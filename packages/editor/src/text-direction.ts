export type TextDirection = "rtl" | "ltr";

const LETTER = /\p{L}/u;
const RIGHT_TO_LEFT =
  /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Adlam}\p{Script=Samaritan}\p{Script=Mandaic}]/u;

// The base direction a bidi paragraph gets from its first strong character
// (UAX #9 P2/P3), the rule `dir="auto"` follows. Digits and punctuation are
// weak, so they never decide it; no letter at all means no direction.
export function textDirection(text: string): TextDirection | null {
  for (const char of text) {
    if (LETTER.test(char)) return RIGHT_TO_LEFT.test(char) ? "rtl" : "ltr";
  }
  return null;
}
