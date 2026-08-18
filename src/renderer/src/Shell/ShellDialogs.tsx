import type { Dispatch, SetStateAction } from "react"
import { DEFAULT_PROMPTS } from "../../../library/defaults.js"
import type { AppLanguage, LibrarySnapshot, SpokenLanguage } from "../../../library/types.js"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { CourseFormDialog, type CourseFormValues } from "../CourseFormDialog"
import { PromptDialog } from "../PromptDialog"
import { t } from "../uiText"
import type { PromptState } from "./prompt"

export function ShellDialogs({
  snapshot,
  lang,
  prompt,
  setPrompt,
  sessionDate,
  setSessionDate,
  spoken,
  setSpoken,
  languageItems
}: {
  snapshot: LibrarySnapshot
  lang: AppLanguage
  prompt: PromptState
  setPrompt: Dispatch<SetStateAction<PromptState>>
  sessionDate: string
  setSessionDate: Dispatch<SetStateAction<string>>
  spoken: SpokenLanguage
  setSpoken: Dispatch<SetStateAction<SpokenLanguage>>
  languageItems: Record<string, string>
}) {
  return (
    <>
      <CourseFormDialog
        open={prompt?.kind === "course"}
        lang={lang}
        title={t(lang, "newCourse")}
        submitLabel={t(lang, "create")}
        values={{
          name: "",
          spokenLanguageDefault: snapshot.appLanguage ?? "fa",
          outputLanguage: snapshot.appLanguage ?? "fa",
          prompts: { ...DEFAULT_PROMPTS }
        }}
        onOpenChange={(open) => {
          if (!open) setPrompt(null)
        }}
        onSubmit={(values) =>
          void window.doorei.call("createCourse", values.name, {
            spokenLanguageDefault: values.spokenLanguageDefault,
            outputLanguage: values.outputLanguage,
            prompts: values.prompts
          })
        }
      />
      <CourseFormDialog
        open={prompt?.kind === "rename"}
        lang={lang}
        title={t(lang, "editCourse")}
        submitLabel={t(lang, "save")}
        values={editCourseValues(snapshot)}
        onOpenChange={(open) => {
          if (!open) setPrompt(null)
        }}
        onSubmit={(values) => {
          if (!snapshot.selectedCourseId) return
          void window.doorei.call("updateCourse", snapshot.selectedCourseId, {
            name: values.name,
            spokenLanguageDefault: values.spokenLanguageDefault,
            outputLanguage: values.outputLanguage,
            prompts: values.prompts
          })
        }}
      />
      <PromptDialog
        open={prompt?.kind === "session"}
        title={t(lang, "newSession")}
        label={t(lang, "sessionName")}
        submitLabel={t(lang, "create")}
        cancelLabel={t(lang, "cancel")}
        extra={
          <div className="grid gap-2">
            <Label htmlFor="session-date">{t(lang, "optionalDate")}</Label>
            <Input
              id="session-date"
              value={sessionDate}
              onChange={(event) => setSessionDate(event.target.value)}
            />
          </div>
        }
        onOpenChange={(open) => {
          if (!open) setPrompt(null)
        }}
        onSubmit={(name) =>
          void window.doorei.call("createSession", {
            name,
            date: sessionDate.trim() || undefined
          })
        }
      />
      <PromptDialog
        open={prompt?.kind === "rename-session"}
        title={t(lang, "renameSession")}
        label={t(lang, "sessionName")}
        submitLabel={t(lang, "save")}
        cancelLabel={t(lang, "cancel")}
        defaultValue={prompt?.kind === "rename-session" ? prompt.name : ""}
        onOpenChange={(open) => {
          if (!open) setPrompt(null)
        }}
        onSubmit={(name) => {
          if (prompt?.kind === "rename-session") {
            void window.doorei.call("renameSession", prompt.id, name)
          }
        }}
      />
      <Dialog
        open={prompt?.kind === "delete-session"}
        onOpenChange={(open) => {
          if (!open) setPrompt(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t(lang, "deleteSession")}</DialogTitle>
            <DialogDescription>{t(lang, "deleteSessionWarning")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPrompt(null)}>
              {t(lang, "cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (prompt?.kind === "delete-session") {
                  void window.doorei.call("deleteSession", prompt.id)
                }
                setPrompt(null)
              }}
            >
              {t(lang, "deleteSession")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PromptDialog
        open={prompt?.kind === "note"}
        title={t(lang, "editNote")}
        label={t(lang, "notes")}
        submitLabel={t(lang, "save")}
        cancelLabel={t(lang, "cancel")}
        defaultValue={prompt?.kind === "note" ? prompt.text : ""}
        onOpenChange={(open) => {
          if (!open) setPrompt(null)
        }}
        onSubmit={(text) => {
          if (prompt?.kind === "note") void window.doorei.call("editNote", prompt.id, text)
        }}
      />
      <PromptDialog
        open={prompt?.kind === "from-folder"}
        title={t(lang, "relinkFolder")}
        label={t(lang, "fromFolder")}
        submitLabel={t(lang, "relink")}
        cancelLabel={t(lang, "cancel")}
        onOpenChange={(open) => {
          if (!open) setPrompt(null)
        }}
        onSubmit={(fromDir) => {
          if (prompt?.kind === "from-folder") {
            void window.doorei.call("relinkFolder", fromDir, prompt.toDir)
          }
        }}
      />
      <Dialog
        open={prompt?.kind === "spoken"}
        onOpenChange={(open) => {
          if (!open) setPrompt(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t(lang, "spokenLanguage")}</DialogTitle>
          </DialogHeader>
          <Select
            value={spoken}
            items={languageItems}
            onValueChange={(value) => {
              if (value === "fa" || value === "en") setSpoken(value)
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fa">{languageItems.fa}</SelectItem>
              <SelectItem value="en">{languageItems.en}</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrompt(null)}>
              {t(lang, "cancel")}
            </Button>
            <Button
              onClick={() => {
                if (prompt?.kind !== "spoken") return
                void window.doorei.call("addVideos", {
                  sessionId: prompt.sessionId,
                  paths: prompt.paths,
                  spokenLanguage: spoken
                })
                setPrompt(null)
              }}
            >
              {t(lang, "addVideos")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function editCourseValues(snapshot: LibrarySnapshot): CourseFormValues {
  const course = snapshot.courses.find((item) => item.id === snapshot.selectedCourseId)
  return {
    name: course?.name ?? snapshot.selectedCourseName ?? "",
    spokenLanguageDefault: course?.spokenLanguageDefault ?? snapshot.spokenLanguageDefault,
    outputLanguage: course?.outputLanguage ?? snapshot.outputLanguage,
    prompts: course ? { ...course.prompts } : { ...snapshot.prompts }
  }
}
