export type TextDir = "rtl" | "ltr"

const RTL_CHAR = /\p{Script=Arabic}|\p{Script=Hebrew}/u
const LTR_CHAR = /\p{Script=Latin}/u

export function textDirection(text: string): TextDir {
  let rtl = 0
  let ltr = 0
  for (const char of text) {
    if (RTL_CHAR.test(char)) rtl += 1
    else if (LTR_CHAR.test(char)) ltr += 1
  }
  return rtl > ltr ? "rtl" : "ltr"
}
