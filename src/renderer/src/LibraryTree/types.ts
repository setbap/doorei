import type { AppLanguage, LibrarySnapshot, SessionRecord, VideoRecord } from "../../../library/types.js"
import type { TreeDragged, TreeDropTarget } from "../../../library/treeDrop.js"

export type LibraryTreeProps = {
  snapshot: LibrarySnapshot
  lang: AppLanguage
  onAddVideos: (sessionId: string, picker: () => Promise<string[]>) => void
  onRenameSession: (session: SessionRecord) => void
  onDeleteSession: (session: SessionRecord) => void
}

export type PlacementFor = (
  event: { clientY: number; currentTarget: EventTarget & HTMLElement },
  targetKind: TreeDropTarget["kind"]
) => TreeDropTarget["placement"]

export type TreeHandlers = {
  dragged: TreeDragged | null
  dropTarget: TreeDropTarget | null
  onDragged: (dragged: TreeDragged | null) => void
  onDropTarget: (dropTarget: TreeDropTarget | null) => void
  placementFor: PlacementFor
  onCommit: (target: TreeDropTarget) => Promise<void>
}

export type { VideoRecord }
