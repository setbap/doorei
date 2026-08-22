import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  FileVideo,
  Folder,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type {
  AppLanguage,
  AskMention,
  ConversationTurn,
  Hit,
  HitOrigin,
  LibrarySnapshot,
} from "../../library/types.js";
import {
  activeMention,
  filterMentionable,
  mentionableItems,
  userTurnText,
  type MentionableItem,
} from "../../library/askMentions.js";
import { textDirection } from "../../library/textDirection.js";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AskMentionMenu } from "./AskMentionMenu";
import { Markdown } from "./Markdown";
import { Hint } from "./Hint";
import { isModEnter, sendChord } from "./modEnter";
import { PromptDialog } from "./PromptDialog";
import { t } from "./uiText";

type Props = {
  snapshot: LibrarySnapshot;
  lang: AppLanguage;
  onSeek: (seconds: number | null) => void;
};

export function AskPane({
  snapshot,
  lang,
  onSeek,
}: Props) {
  const [question, setQuestion] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [mentions, setMentions] = useState<AskMention[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionAt, setMentionAt] = useState<number | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const turns = snapshot.conversationTurns;
  const empty = turns.length === 0 && !pendingQuestion;
  const catalog = useMemo(
    () => mentionableItems(snapshot),
    [snapshot.selectedCourseId, snapshot.sessions, snapshot.videos]
  );
  const pinned = useMemo(
    () =>
      mentions
        .map((mention) =>
          catalog.find((item) => item.kind === mention.kind && item.id === mention.id)
        )
        .filter((item): item is MentionableItem => item !== undefined),
    [catalog, mentions]
  );
  const mentionChoices = useMemo(() => {
    const used = new Set(pinned.map((item) => `${item.kind}:${item.id}`));
    return filterMentionable(
      catalog.filter((item) => !used.has(`${item.kind}:${item.id}`)),
      mentionQuery
    );
  }, [catalog, mentionQuery, pinned]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns.length, asking, pendingQuestion, snapshot.askError]);

  useEffect(() => {
    setMentionIndex(0);
  }, [mentionQuery, mentionOpen, mentionChoices.length]);

  async function seekHit(
    videoId: string,
    startSeconds: number | null
  ): Promise<void> {
    const prefix = videoId.replace(/\.+$/, "");
    const video =
      snapshot.videos.find((item) => item.id === videoId) ??
      (prefix.length >= 8
        ? snapshot.videos.find((item) => item.id.startsWith(prefix))
        : undefined);
    if (!video) return;
    await window.doorei.call("selectVideo", video.id);
    if (startSeconds != null) {
      await window.doorei.call("setPlaybackPosition", startSeconds);
      onSeek(startSeconds);
    }
  }

  function closeMentionMenu(): void {
    setMentionOpen(false);
    setMentionQuery("");
    setMentionAt(null);
    setMentionIndex(0);
  }

  function syncMentionFromText(text: string, cursor: number): void {
    const active = activeMention(text, cursor);
    if (!active) {
      closeMentionMenu();
      return;
    }
    setMentionOpen(true);
    setMentionQuery(active.query);
    setMentionAt(active.at);
  }

  function openPicker(): void {
    const el = textareaRef.current;
    const cursor = el?.selectionStart ?? question.length;
    const needsSpace = cursor > 0 && !/\s/.test(question[cursor - 1] ?? "");
    const prefix = needsSpace ? " @" : "@";
    const next = `${question.slice(0, cursor)}${prefix}${question.slice(cursor)}`;
    const at = cursor + prefix.length - 1;
    setQuestion(next);
    setMentionOpen(true);
    setMentionQuery("");
    setMentionAt(at);
    requestAnimationFrame(() => {
      const field = textareaRef.current;
      if (!field) return;
      field.focus();
      const pos = at + 1;
      field.setSelectionRange(pos, pos);
    });
  }

  function addMention(item: MentionableItem): void {
    setMentions((current) =>
      current.some((mention) => mention.kind === item.kind && mention.id === item.id)
        ? current
        : [...current, { kind: item.kind, id: item.id }]
    );
    if (mentionAt !== null) {
      const cursor = textareaRef.current?.selectionStart ?? question.length;
      const next = `${question.slice(0, mentionAt)}${question.slice(cursor)}`;
      setQuestion(next);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(mentionAt, mentionAt);
      });
    } else {
      textareaRef.current?.focus();
    }
    closeMentionMenu();
  }

  function removeMention(item: MentionableItem): void {
    setMentions((current) =>
      current.filter((mention) => mention.kind !== item.kind || mention.id !== item.id)
    );
  }

  async function send(text = question): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || asking) return;
    const attached = pinned.map((item) => ({ kind: item.kind, id: item.id }));
    setAsking(true);
    setPendingQuestion(userTurnText(trimmed, pinned));
    setQuestion("");
    setMentions([]);
    closeMentionMenu();
    try {
      await window.doorei.call("ask", { question: trimmed, mentions: attached });
    } catch {
      setQuestion(trimmed);
      setMentions(attached);
    } finally {
      setAsking(false);
      setPendingQuestion(null);
    }
  }

  if (snapshot.askOff) {
    return (
      <div className="p-3">
        <Alert>
          <AlertDescription>{t(lang, "askOff")}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy={asking}>
      <div className="flex shrink-0 items-center border-b border-white/10 gap-1 px-3 py-1">
        {snapshot.conversations.length > 0 && snapshot.activeConversationId ? (
          <Select
            value={snapshot.activeConversationId}
            items={Object.fromEntries(
              snapshot.conversations.map((item) => [
                item.id,
                item.title.trim() || t(lang, "newConversation"),
              ])
            )}
            onValueChange={(value) => {
              if (value) void window.doorei.call("selectConversation", value);
            }}
          >
            <SelectTrigger
              size="sm"
              className="min-w-0 flex-1 border-0 bg-transparent shadow-none dark:bg-transparent dark:hover:bg-white/5"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {snapshot.conversations.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.title.trim() || t(lang, "newConversation")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="min-w-0 flex-1 truncate text-sm font-medium">
            {t(lang, "newConversation")}
          </p>
        )}
        <Hint
          label={t(lang, "newConversation")}
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t(lang, "newConversation")}
              onClick={() => void window.doorei.call("createConversation")}
            />
          }
        >
          <Plus />
        </Hint>
        {snapshot.activeConversationId ? (
          <>
            <Hint
              label={t(lang, "renameConversation")}
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t(lang, "renameConversation")}
                  onClick={() => setRenameOpen(true)}
                />
              }
            >
              <Pencil />
            </Hint>
            <Hint
              label={t(lang, "deleteConversation")}
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t(lang, "deleteConversation")}
                  onClick={() =>
                    void window.doorei.call(
                      "deleteConversation",
                      snapshot.activeConversationId
                    )
                  }
                />
              }
            >
              <Trash2 />
            </Hint>
          </>
        ) : null}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 px-3 py-4">
          {empty ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
              {t(lang, "askEmpty")}
            </p>
          ) : (
            turns.map((turn) => (
              <Turn
                key={turn.id}
                turn={turn}
                snapshot={snapshot}
                lang={lang}
                onSeekHit={seekHit}
              />
            ))
          )}
          {asking && pendingQuestion ? (
            <>
              <UserBubble text={pendingQuestion} />
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {t(lang, "asking")}
              </div>
            </>
          ) : null}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      {snapshot.askError ? (
        <div className="shrink-0 space-y-2 border-t border-white/10 px-3 py-2">
          <Alert variant="destructive">
            <AlertDescription>{snapshot.askError}</AlertDescription>
          </Alert>
          <Button
            variant="secondary"
            size="sm"
            disabled={asking || !question.trim()}
            onClick={() => void send()}
          >
            {t(lang, "retry")}
          </Button>
        </div>
      ) : null}

      <form
        className="relative shrink-0 border-t border-white/10 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (mentionOpen) return;
          void send();
        }}
      >
        {mentionOpen ? (
          <div className="absolute inset-x-3 bottom-full z-20 mb-2 overflow-hidden rounded-xl border border-white/10 bg-neutral-950 shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
            <AskMentionMenu
              items={mentionChoices}
              query={mentionQuery}
              selectedIndex={mentionIndex}
              lang={lang}
              onHover={setMentionIndex}
              onSelect={addMention}
            />
          </div>
        ) : null}
        <div className="rounded-2xl border bg-muted/40 p-1.5">
          {pinned.length > 0 ? (
            <div className="flex flex-wrap gap-1 px-1.5 pb-1 pt-0.5">
              {pinned.map((item) => {
                const Icon = item.kind === "session" ? Folder : FileVideo;
                return (
                  <span
                    key={`${item.kind}:${item.id}`}
                    className="inline-flex max-w-full items-center gap-1 rounded-full bg-white/8 px-2 py-0.5 text-xs"
                  >
                    <Icon className="size-3 shrink-0 text-muted-foreground" />
                    <span className="truncate" dir={textDirection(item.name)}>
                      {item.name}
                    </span>
                    <button
                      type="button"
                      className="rounded-full p-0.5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                      aria-label={`${t(lang, "askMentionRemove")} ${item.name}`}
                      onClick={() => removeMention(item)}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          ) : null}
          <div className="flex items-end gap-1">
            <Hint
              label={t(lang, "askMentionAdd")}
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="rounded-full"
                  disabled={asking}
                  aria-label={t(lang, "askMentionAdd")}
                  onClick={openPicker}
                />
              }
            >
              <Plus />
            </Hint>
            <Textarea
              ref={textareaRef}
              className="max-h-32 min-h-9 flex-1 resize-none border-0 bg-transparent p-0 py-1.5 shadow-none field-sizing-content focus-visible:ring-0 dark:bg-transparent"
              placeholder={t(lang, "askPlaceholder").replace(
                "{chord}",
                sendChord()
              )}
              value={question}
              rows={1}
              disabled={asking}
              dir={question.trim() ? textDirection(question) : "auto"}
              onChange={(event) => {
                const next = event.target.value;
                setQuestion(next);
                syncMentionFromText(next, event.target.selectionStart);
              }}
              onClick={(event) => {
                syncMentionFromText(question, event.currentTarget.selectionStart);
              }}
              onKeyUp={(event) => {
                if (
                  event.key === "ArrowLeft" ||
                  event.key === "ArrowRight" ||
                  event.key === "Home" ||
                  event.key === "End"
                ) {
                  syncMentionFromText(
                    event.currentTarget.value,
                    event.currentTarget.selectionStart
                  );
                }
              }}
              onKeyDown={(event) => {
                if (mentionOpen) {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setMentionIndex((index) =>
                      mentionChoices.length === 0
                        ? 0
                        : (index + 1) % mentionChoices.length
                    );
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setMentionIndex((index) =>
                      mentionChoices.length === 0
                        ? 0
                        : (index - 1 + mentionChoices.length) % mentionChoices.length
                    );
                    return;
                  }
                  if (event.key === "Enter" || event.key === "Tab") {
                    const item = mentionChoices[mentionIndex];
                    if (item) {
                      event.preventDefault();
                      addMention(item);
                    }
                    return;
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    closeMentionMenu();
                    return;
                  }
                }
                if (
                  event.key === "Backspace" &&
                  question.length === 0 &&
                  pinned.length > 0 &&
                  !event.nativeEvent.isComposing
                ) {
                  const last = pinned[pinned.length - 1];
                  if (last) removeMention(last);
                  return;
                }
                if (!isModEnter(event)) return;
                event.preventDefault();
                void send();
              }}
            />
            <Hint
              label={t(lang, "send")}
              render={
                <Button
                  type="submit"
                  size="icon-sm"
                  className="rounded-full"
                  disabled={asking || !question.trim()}
                  aria-label={t(lang, "send")}
                />
              }
            >
              {asking ? <Loader2 className="animate-spin" /> : <ArrowUp />}
            </Hint>
          </div>
        </div>
      </form>

      <PromptDialog
        open={renameOpen}
        title={t(lang, "renameConversation")}
        label={t(lang, "conversationTitle")}
        submitLabel={t(lang, "save")}
        cancelLabel={t(lang, "cancel")}
        defaultValue={
          snapshot.conversations.find(
            (item) => item.id === snapshot.activeConversationId
          )?.title ?? ""
        }
        onOpenChange={setRenameOpen}
        onSubmit={(title) => {
          if (snapshot.activeConversationId) {
            void window.doorei.call(
              "renameConversation",
              snapshot.activeConversationId,
              title
            );
          }
        }}
      />
    </div>
  );
}

function Turn({
  turn,
  snapshot,
  lang,
  onSeekHit,
}: {
  turn: ConversationTurn;
  snapshot: LibrarySnapshot;
  lang: AppLanguage;
  onSeekHit: (videoId: string, startSeconds: number | null) => Promise<void>;
}) {
  if (turn.kind === "user") return <UserBubble text={turn.text} />;
  if (turn.kind === "compact") {
    return (
      <div className="rounded-xl bg-muted/40 px-3 py-2">
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">
          {t(lang, "compactTurn")}
        </p>
        <Markdown
          text={turn.text}
          hits={turn.hits}
          onHit={(videoId, seconds) => void onSeekHit(videoId, seconds)}
        />
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Markdown
        text={turn.text}
        hits={turn.hits}
        onHit={(videoId, seconds) => void onSeekHit(videoId, seconds)}
      />
      {turn.hits.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-muted-foreground">
            {t(lang, "hits")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {turn.hits.map((hit, index) => (
              <HitChip
                key={`${turn.id}-${index}`}
                hit={hit}
                snapshot={snapshot}
                lang={lang}
                onSeekHit={onSeekHit}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div
        className="max-w-[85%] rounded-2xl rounded-ee-md bg-primary px-3 py-2 text-sm text-primary-foreground"
        data-selectable
        dir={textDirection(text)}
      >
        {text}
      </div>
    </div>
  );
}

function HitChip({
  hit,
  snapshot,
  lang,
  onSeekHit,
}: {
  hit: Hit;
  snapshot: LibrarySnapshot;
  lang: AppLanguage;
  onSeekHit: (videoId: string, startSeconds: number | null) => Promise<void>;
}) {
  const videoName = snapshot.videos.find(
    (video) => video.id === hit.videoId
  )?.name;
  const time =
    hit.startSeconds != null ? formatCaptionTime(hit.startSeconds) : null;
  const label = [time, originLabel(lang, hit.origin)]
    .filter(Boolean)
    .join(" · ");
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="outline"
            size="xs"
            className="max-w-full"
            dir="ltr"
            onClick={() => void onSeekHit(hit.videoId, hit.startSeconds)}
          />
        }
      >
        <span className="truncate">{label}</span>
        {videoName ? (
          <span
            className="max-w-28 truncate text-muted-foreground"
            dir={textDirection(videoName)}
          >
            {videoName}
          </span>
        ) : null}
      </TooltipTrigger>
      <TooltipContent className="max-w-64" dir={textDirection(hit.text)}>
        {hit.text}
      </TooltipContent>
    </Tooltip>
  );
}

function originLabel(lang: AppLanguage, origin: HitOrigin | undefined): string {
  if (origin === "video") return t(lang, "hitThisVideo");
  if (origin === "session") return t(lang, "hitThisSession");
  if (origin === "mention") return t(lang, "hitMention");
  return t(lang, "hitRestOfCourse");
}

function formatCaptionTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}
