import { describe, expect, test } from "vitest"
import { selectAllBehavior } from "../../src/main/selectAll.js"

describe("selectAllBehavior", () => {
  test("inputs and textareas keep native Select All", () => {
    expect(
      selectAllBehavior({ tagName: "INPUT", isContentEditable: false, inSelectable: false })
    ).toBe("native")
    expect(
      selectAllBehavior({ tagName: "TEXTAREA", isContentEditable: false, inSelectable: true })
    ).toBe("native")
  })

  test("Summary and other shown text select that block only", () => {
    expect(
      selectAllBehavior({ tagName: "P", isContentEditable: false, inSelectable: true })
    ).toBe("block")
  })

  test("chrome and labels are not selected", () => {
    expect(
      selectAllBehavior({ tagName: "BUTTON", isContentEditable: false, inSelectable: false })
    ).toBe("prevent")
    expect(
      selectAllBehavior({ tagName: "BODY", isContentEditable: false, inSelectable: false })
    ).toBe("prevent")
  })
})
