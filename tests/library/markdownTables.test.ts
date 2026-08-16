import { describe, expect, test } from "vitest"
import { repairMarkdownTables } from "../../src/library/markdownTables.js"

describe("Markdown tables", () => {
  test("a well-formed table is left as separate rows", () => {
    const text = `| مورد | نقش |\n|------|------|\n| redirect_uri | آدرس بازگشت |`
    expect(repairMarkdownTables(text)).toBe(text)
  })

  test("a collapsed header, separator, and cells become a table", () => {
    const text =
      "| مورد | نقش |------|------| redirect_uri | آدرس بازگشت | response_type | نوع پاسخ |"
    expect(repairMarkdownTables(text)).toBe(
      [
        "| مورد | نقش |",
        "|------|------|",
        "| redirect_uri | آدرس بازگشت |",
        "| response_type | نوع پاسخ |"
      ].join("\n")
    )
  })

  test("HTML line breaks between table rows become Markdown newlines", () => {
    const text = "| A | B |<br>| --- | --- |<br>| 1 | 2 |"
    expect(repairMarkdownTables(text)).toBe("| A | B |\n| --- | --- |\n| 1 | 2 |")
  })

  test("prose with a pipe is not treated as a table", () => {
    expect(repairMarkdownTables("use code | scope as a query param")).toBe(
      "use code | scope as a query param"
    )
  })
})
