import { useState } from "react";
import { CircleHelp } from "lucide-react";
import type { AppLanguage } from "../../../library/types.js";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { t } from "../uiText";

type CopyKey = Parameters<typeof t>[1];

type Chord = string[];

type ShortcutRow = {
  label: CopyKey;
  chords: Chord[];
};

type ShortcutSection = {
  title: CopyKey;
  when: CopyKey;
  rows: ShortcutRow[];
};

export function ShortcutHelp({ lang }: { lang: AppLanguage }) {
  const [open, setOpen] = useState(false);
  const darwin = window.doorei.platform === "darwin";
  const mod = darwin ? "⌘" : "Ctrl";
  const enter = darwin ? t(lang, "keyReturn") : t(lang, "keyEnter");
  const sections = shortcutSections(
    mod,
    enter,
    t(lang, "keySpace"),
    t(lang, "keyShift")
  );

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className="rounded-full text-muted-foreground hover:text-foreground"
              aria-label={t(lang, "shortcuts")}
              onClick={() => setOpen(true)}
            />
          }
        >
          <CircleHelp />
        </TooltipTrigger>
        <TooltipContent side="top">{t(lang, "shortcuts")}</TooltipContent>
      </Tooltip>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[min(44rem,calc(100vh-4rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="shrink-0 px-5 pt-5 pb-3">
            <DialogTitle>{t(lang, "shortcuts")}</DialogTitle>
            <DialogDescription>{t(lang, "shortcutsIntro")}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
            <div className="flex flex-col gap-3">
              {sections.map((section) => (
                <section key={section.title}>
                  <Card size="sm" className="bg-white/5 py-0 ring-white/8">
                    <CardHeader className="border-b border-white/8 px-4 py-3">
                      <CardTitle className="text-sm">
                        {t(lang, section.title)}
                      </CardTitle>
                      <CardDescription>{t(lang, section.when)}</CardDescription>
                    </CardHeader>
                    <CardContent className="divide-y divide-white/8 p-0">
                      {section.rows.map((row) => (
                        <div
                          key={row.label}
                          className="flex items-center justify-between gap-3 px-4 py-2"
                        >
                          <span className="min-w-0 text-sm">
                            {t(lang, row.label)}
                          </span>
                          <span
                            className="flex shrink-0 flex-wrap items-center justify-end gap-1.5"
                            dir="ltr"
                          >
                            {row.chords.map((chord, index) => (
                              <span
                                key={chord.join("-")}
                                className="flex items-center gap-1.5"
                              >
                                {index > 0 ? (
                                  <span className="text-[0.65rem] text-muted-foreground">
                                    {t(lang, "shortcutOr")}
                                  </span>
                                ) : null}
                                <KbdGroup>
                                  {chord.map((key) => (
                                    <Kbd key={key}>{key}</Kbd>
                                  ))}
                                </KbdGroup>
                              </span>
                            ))}
                          </span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </section>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function shortcutSections(
  mod: string,
  enter: string,
  space: string,
  shift: string
): ShortcutSection[] {
  return [
    {
      title: "shortcutSectionApp",
      when: "shortcutSectionAppWhen",
      rows: [
        { label: "settings", chords: [[mod, ","]] },
        { label: "switchCourse", chords: [[mod, "P"]] },
        { label: "toggleLibrary", chords: [[mod, "B"]] },
        { label: "toggleToolPane", chords: [[mod, "G"]] },
        { label: "toggleNote", chords: [[mod, "`"]] },
      ],
    },
    {
      title: "shortcutSectionPlayer",
      when: "shortcutSectionPlayerWhen",
      rows: [
        { label: "playPause", chords: [[space], ["K"]] },
        { label: "speedUp", chords: [[">"]] },
        { label: "speedDown", chords: [["<"]] },
        { label: "seekForward", chords: [["L"], ["→"]] },
        { label: "seekBack", chords: [["J"], ["←"]] },
        { label: "volumeUp", chords: [["↑"]] },
        { label: "volumeDown", chords: [["↓"]] },
        { label: "showCaptions", chords: [["C"]] },
        { label: "fullscreen", chords: [["F"], [enter]] },
        { label: "mute", chords: [["M"]] },
        { label: "next", chords: [[shift, "N"]] },
        { label: "previous", chords: [[shift, "P"]] },
      ],
    },
    {
      title: "shortcutSectionTyping",
      when: "shortcutSectionTypingWhen",
      rows: [
        { label: "search", chords: [[enter]] },
        { label: "shortcutSend", chords: [[mod, enter]] },
      ],
    },
  ];
}
