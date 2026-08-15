import { describe, expect, test } from "vitest"
import { textDirection } from "../../src/library/textDirection.js"

describe("textDirection", () => {
  test("Persian and Arabic letters are RTL", () => {
    expect(textDirection("خلاصه درس افکت")).toBe("rtl")
    expect(textDirection("هذا النص عربي")).toBe("rtl")
  })

  test("English letters are LTR", () => {
    expect(textDirection("useEffect runs after paint")).toBe("ltr")
  })

  test("majority script wins in mixed text", () => {
    expect(textDirection("در این جلسه useEffect را بررسی می‌کنیم و debounce را هم می‌بینیم")).toBe(
      "rtl"
    )
    expect(textDirection("This lecture covers افکت lightly")).toBe("ltr")
  })

  test("markdown punctuation does not decide direction", () => {
    expect(textDirection("## خلاصه\n\n- مورد یک\n- مورد دو")).toBe("rtl")
    expect(textDirection("## Summary\n\n- point one")).toBe("ltr")
  })

  test("empty or digits-only defaults to LTR", () => {
    expect(textDirection("")).toBe("ltr")
    expect(textDirection("12:04")).toBe("ltr")
  })
})
