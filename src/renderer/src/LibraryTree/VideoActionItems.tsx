import type { ComponentType, ReactNode } from "react"
import type { AppLanguage, Job, VideoRecord } from "../../../library/types.js"
import { t } from "../uiText"

export function VideoActionItems({
  video,
  lang,
  failedJobs,
  providerConfigured,
  Item,
  CheckboxItem,
  Separator
}: {
  video: VideoRecord
  lang: AppLanguage
  failedJobs: Job[]
  providerConfigured: boolean
  Item: ComponentType<{
    variant?: "default" | "destructive"
    disabled?: boolean
    onClick?: () => void
    children?: ReactNode
  }>
  CheckboxItem: ComponentType<{
    checked?: boolean
    onCheckedChange?: (checked: boolean) => void
    children?: ReactNode
  }>
  Separator: ComponentType
}) {
  return (
    <>
      <CheckboxItem
        checked={video.watched}
        onCheckedChange={(checked) => {
          void window.doorei.call("setWatched", video.id, checked === true)
        }}
      >
        {t(lang, "watched")}
      </CheckboxItem>
      {video.watched ? (
        <Item onClick={() => void window.doorei.call("setWatched", video.id, false)}>
          {t(lang, "unwatched")}
        </Item>
      ) : null}
      <Item
        onClick={() => {
          void window.doorei.call("selectAdjacent", video.id, "previous")
        }}
      >
        {t(lang, "previous")}
      </Item>
      <Item
        onClick={() => {
          void window.doorei.call("selectAdjacent", video.id, "next")
        }}
      >
        {t(lang, "next")}
      </Item>
      <Item onClick={() => void window.doorei.call("regenerateCaption", video.id)}>
        {t(lang, "regenerate")}
      </Item>
      <Item
        disabled={!providerConfigured}
        onClick={() => void window.doorei.call("generateSummary", video.id)}
      >
        {t(lang, "generateSummary")}
      </Item>
      {failedJobs.map((job) => (
        <Item key={job.id} onClick={() => void window.doorei.call("retryJob", job.id)}>
          {t(lang, "retry")}
          {job.error ? `: ${job.error}` : ""}
        </Item>
      ))}
      <Separator />
      <Item variant="destructive" onClick={() => void window.doorei.call("deleteVideo", video.id)}>
        {t(lang, "deleteVideo")}
      </Item>
    </>
  )
}
