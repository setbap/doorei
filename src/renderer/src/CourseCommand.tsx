import { Check, ChevronDown, FileText, PanelLeft, PanelRight, Pencil, Plus, Settings, StickyNote } from "lucide-react"
import type { AppLanguage, LibrarySnapshot } from "../../library/types.js"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut
} from "@/components/ui/command"
import { t } from "./uiText"

type Props = {
  snapshot: LibrarySnapshot
  lang: AppLanguage
  open: boolean
  onOpenChange: (open: boolean) => void
  onNewCourse: () => void
  onRenameCourse: () => void
  onOpenSettings: () => void
  onToggleNote: () => void
  onToggleLibrary: () => void
  onToggleToolPane: () => void
}

export function CourseCommand({
  snapshot,
  lang,
  open,
  onOpenChange,
  onNewCourse,
  onRenameCourse,
  onOpenSettings,
  onToggleNote,
  onToggleLibrary,
  onToggleToolPane
}: Props) {
  const label = snapshot.selectedCourseName ?? t(lang, "emptyLibrary")
  const chord = (key: string): string =>
    window.doorei.platform === "darwin" ? `⌘${key}` : `Ctrl+${key}`

  function closeAnd(action: () => void): void {
    onOpenChange(false)
    action()
  }

  return (
    <>
      <Button
        variant="ghost"
        className="h-8 max-w-72 gap-1.5 px-2.5 font-medium text-foreground"
        aria-label={t(lang, "switchCourse")}
        onClick={() => onOpenChange(true)}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-55" />
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={onOpenChange}
        title={t(lang, "switchCourse")}
        description={t(lang, "commandPlaceholder")}
      >
        <Command vimBindings={false}>
          <CommandInput placeholder={t(lang, "commandPlaceholder")} />
          <CommandList>
            <CommandEmpty>{t(lang, "commandEmpty")}</CommandEmpty>
            {snapshot.courses.length ? (
              <CommandGroup heading={t(lang, "commandCourses")}>
                {snapshot.courses.map((course) => (
                  <CommandItem
                    key={course.id}
                    value={course.name}
                    onSelect={() =>
                      closeAnd(() => void window.doorei.call("selectCourse", course.id))
                    }
                  >
                    <Check
                      className={
                        course.id === snapshot.selectedCourseId ? "opacity-100" : "opacity-0"
                      }
                    />
                    <span className="truncate">{course.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            <CommandSeparator />
            <CommandGroup heading={t(lang, "commandActions")}>
              <CommandItem value={t(lang, "newCourse")} onSelect={() => closeAnd(onNewCourse)}>
                <Plus />
                {t(lang, "newCourse")}
              </CommandItem>
              <CommandItem
                value={t(lang, "editCourse")}
                disabled={!snapshot.selectedCourseId}
                onSelect={() => {
                  if (!snapshot.selectedCourseId) return
                  closeAnd(onRenameCourse)
                }}
              >
                <Pencil />
                {t(lang, "editCourse")}
              </CommandItem>
              <CommandItem
                value={t(lang, "generateMissingSummaries")}
                disabled={!snapshot.providerConfigured}
                onSelect={() => {
                  if (!snapshot.providerConfigured) return
                  closeAnd(() => void window.doorei.call("generateMissingSummaries"))
                }}
              >
                <FileText />
                {t(lang, "generateMissingSummaries")}
              </CommandItem>
              <CommandItem value={t(lang, "toggleNote")} onSelect={() => closeAnd(onToggleNote)}>
                <StickyNote />
                {t(lang, "toggleNote")}
                <CommandShortcut>{chord("`")}</CommandShortcut>
              </CommandItem>
              <CommandItem
                value={t(lang, "toggleLibrary")}
                onSelect={() => closeAnd(onToggleLibrary)}
              >
                <PanelLeft />
                {t(lang, "toggleLibrary")}
                <CommandShortcut>{chord("B")}</CommandShortcut>
              </CommandItem>
              <CommandItem
                value={t(lang, "toggleToolPane")}
                onSelect={() => closeAnd(onToggleToolPane)}
              >
                <PanelRight />
                {t(lang, "toggleToolPane")}
                <CommandShortcut>{chord("E")}</CommandShortcut>
              </CommandItem>
              <CommandItem value={t(lang, "settings")} onSelect={() => closeAnd(onOpenSettings)}>
                <Settings />
                {t(lang, "settings")}
                <CommandShortcut>{chord(",")}</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
