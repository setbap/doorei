import { describe, expect, test } from "vitest"
import {
  activeMention,
  filterMentionable,
  highlightRanges,
  mentionableItems,
  mentionCaptionHits,
  resolveMentionedVideoIds,
  resolveMentions,
  userTurnText,
  type MentionableItem
} from "../../src/library/askMentions.js"
import { packAskHits } from "../../src/library/askPack.js"
import type { Hit } from "../../src/library/types.js"

const items: MentionableItem[] = [
  { kind: "session", id: "ses_heat", name: "Heat", path: "" },
  { kind: "video", id: "vid_boil", name: "boiling-point.mp4", path: "Heat" },
  { kind: "video", id: "vid_copper", name: "conduction.mp4", path: "Heat" },
  { kind: "session", id: "ses_food", name: "Ingredients", path: "" },
  { kind: "video", id: "vid_yeast", name: "yeast.mp4", path: "Ingredients" }
]

describe("Ask mention picker", () => {
  test("lists Sessions then their Videos in the current Course", () => {
    expect(
      mentionableItems({
        selectedCourseId: "crs_1",
        sessions: [
          { id: "ses_heat", courseId: "crs_1", name: "Heat", date: null, position: 0 },
          { id: "ses_other", courseId: "crs_2", name: "Other", date: null, position: 0 },
          { id: "ses_food", courseId: "crs_1", name: "Ingredients", date: null, position: 1 }
        ],
        videos: [
          {
            id: "vid_yeast",
            sessionId: "ses_food",
            path: "/yeast.mp4",
            name: "yeast.mp4",
            position: 0,
            spokenLanguage: "en",
            playbackPositionSeconds: 0,
            watched: false,
            fileMissing: false,
            captioningProgress: null,
            hasSummary: false
          },
          {
            id: "vid_boil",
            sessionId: "ses_heat",
            path: "/boiling-point.mp4",
            name: "boiling-point.mp4",
            position: 0,
            spokenLanguage: "en",
            playbackPositionSeconds: 0,
            watched: false,
            fileMissing: false,
            captioningProgress: null,
            hasSummary: false
          }
        ]
      }).map((item) => `${item.kind}:${item.name}`)
    ).toEqual(["session:Heat", "video:boiling-point.mp4", "session:Ingredients", "video:yeast.mp4"])
  })

  test("filters by name or Session path, case-insensitive", () => {
    expect(filterMentionable(items, "heat").map((item) => item.name)).toEqual([
      "Heat",
      "boiling-point.mp4",
      "conduction.mp4"
    ])
    expect(filterMentionable(items, "YEA").map((item) => item.name)).toEqual(["yeast.mp4"])
  })

  test("activeMention reads the @ query at the cursor", () => {
    expect(activeMention("ask @fi more", 7)).toEqual({ at: 4, query: "fi" })
    expect(activeMention("ask @fi more", 8)).toBeNull()
    expect(activeMention("email@x.com", 7)).toBeNull()
    expect(activeMention("@", 1)).toEqual({ at: 0, query: "" })
  })

  test("highlightRanges marks every query match", () => {
    expect(highlightRanges("ProviderFields", "fi")).toEqual([
      { text: "Provider", match: false },
      { text: "Fi", match: true },
      { text: "elds", match: false }
    ])
  })
})

describe("Ask mention packing", () => {
  const videos = [
    { id: "vid_boil", sessionId: "ses_heat", position: 0 },
    { id: "vid_copper", sessionId: "ses_heat", position: 1 },
    { id: "vid_yeast", sessionId: "ses_food", position: 0 }
  ]

  test("a Session mention includes every Video in that Session", () => {
    expect(resolveMentionedVideoIds([{ kind: "session", id: "ses_heat" }], videos as never)).toEqual([
      "vid_boil",
      "vid_copper"
    ])
  })

  test("Video mentions stay in selection order and skip duplicates", () => {
    expect(
      resolveMentionedVideoIds(
        [
          { kind: "video", id: "vid_yeast" },
          { kind: "session", id: "ses_food" },
          { kind: "video", id: "vid_boil" }
        ],
        videos as never
      )
    ).toEqual(["vid_yeast", "vid_boil"])
  })

  test("user turn text prefixes @names", () => {
    expect(userTurnText("what is the boiling point?", [items[1]!])).toBe(
      "@boiling-point.mp4 what is the boiling point?"
    )
  })

  test("resolveMentions drops unknown ids", () => {
    expect(
      resolveMentions(
        [
          { kind: "video", id: "vid_boil" },
          { kind: "video", id: "missing" }
        ],
        items
      )
    ).toEqual([items[1]])
  })

  test("packAskHits with mentions keeps only those Videos and labels origin mention", () => {
    const hits: Hit[] = [
      {
        videoId: "vid_boil",
        sessionId: "ses_heat",
        startSeconds: 1,
        text: "water boils at 100 C",
        kind: "caption",
        score: 1
      },
      {
        videoId: "vid_yeast",
        sessionId: "ses_food",
        startSeconds: 1,
        text: "yeast makes carbon dioxide",
        kind: "caption",
        score: 0.9
      }
    ]
    const packed = packAskHits(hits, "vid_yeast", "ses_food", ["vid_boil"])
    expect(packed.videoHits).toEqual([])
    expect(packed.sessionHits).toEqual([])
    expect(packed.courseHits).toEqual([])
    expect(packed.mentionHits).toHaveLength(1)
    expect(packed.mentionHits[0]?.origin).toBe("mention")
    expect(packed.mentionHits[0]?.videoId).toBe("vid_boil")
  })

  test("mentionCaptionHits fills Caption segments when retrieval is empty", () => {
    const extra = mentionCaptionHits(
      ["vid_boil"],
      [{ id: "vid_boil", sessionId: "ses_heat" } as never],
      {
        vid_boil: {
          source: "imported",
          segments: [
            { startSeconds: 1, endSeconds: 2, text: "Water boils at 100 degrees Celsius at sea level." },
            { startSeconds: 3, endSeconds: 4, text: "Salt raises the boiling point." }
          ]
        }
      },
      []
    )
    expect(extra.map((hit) => hit.text)).toEqual([
      "Water boils at 100 degrees Celsius at sea level.",
      "Salt raises the boiling point."
    ])
    expect(extra[0]?.origin).toBe("mention")
  })
})
