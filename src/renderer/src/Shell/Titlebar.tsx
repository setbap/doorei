import type { ComponentType, Dispatch, SetStateAction } from "react";
import type { AppLanguage, LibrarySnapshot } from "../../../library/types.js";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CourseCommand } from "../CourseCommand";
import { cn } from "@/lib/utils";
import { t } from "../uiText";
import { saveComposerOpen } from "./layout";
import type { PromptState } from "./prompt";

export function Titlebar({
  snapshot,
  lang,
  nativeGlass,
  libraryOpen,
  toolsOpen,
  actionPanelOpen,
  setActionPanelOpen,
  setSettingsOpen,
  setComposerOpen,
  toggleLibrary,
  toggleTools,
  setPrompt,
  LibraryToggleIcon,
  ToolsToggleIcon,
}: {
  snapshot: LibrarySnapshot;
  lang: AppLanguage;
  nativeGlass: boolean;
  libraryOpen: boolean;
  toolsOpen: boolean;
  actionPanelOpen: boolean;
  setActionPanelOpen: Dispatch<SetStateAction<boolean>>;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setComposerOpen: Dispatch<SetStateAction<boolean>>;
  toggleLibrary: () => void;
  toggleTools: () => void;
  setPrompt: Dispatch<SetStateAction<PromptState>>;
  LibraryToggleIcon: ComponentType;
  ToolsToggleIcon: ComponentType;
}) {
  return (
    <header
      className={cn(
        "titlebar relative flex h-11 shrink-0 items-center justify-between border-b border-white/10 bg-black/50 pe-2 backdrop-blur-xl backdrop-saturate-150",
        nativeGlass ? "pl-22" : "ps-2"
      )}
    >
      <span className="titlebar-control pt-1">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                aria-expanded={libraryOpen}
                aria-label={t(
                  lang,
                  libraryOpen ? "hideLibrary" : "showLibrary"
                )}
                onClick={toggleLibrary}
              />
            }
          >
            <LibraryToggleIcon />
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {t(lang, libraryOpen ? "hideLibrary" : "showLibrary")}
          </TooltipContent>
        </Tooltip>
      </span>
      <span className="titlebar-control pt-1 absolute inset-s-1/2 top-1/2 -translate-x-1/2 rtl:translate-x-1/2 -translate-y-1/2">
        <CourseCommand
          snapshot={snapshot}
          lang={lang}
          open={actionPanelOpen}
          onOpenChange={setActionPanelOpen}
          onNewCourse={() => setPrompt({ kind: "course" })}
          onRenameCourse={() => setPrompt({ kind: "rename" })}
          onOpenSettings={() => setSettingsOpen(true)}
          onToggleNote={() => {
            setComposerOpen((open) => {
              const next = !open;
              saveComposerOpen(next);
              return next;
            });
          }}
          onToggleLibrary={toggleLibrary}
          onToggleToolPane={toggleTools}
        />
      </span>
      <span className="titlebar-control pt-1 pe-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                aria-expanded={toolsOpen}
                aria-label={t(
                  lang,
                  toolsOpen ? "hideToolPane" : "showToolPane"
                )}
                onClick={toggleTools}
              />
            }
          >
            <ToolsToggleIcon />
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {t(lang, toolsOpen ? "hideToolPane" : "showToolPane")}
          </TooltipContent>
        </Tooltip>
      </span>
    </header>
  );
}
