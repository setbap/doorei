import { useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import type {
  AppLanguage,
  ConversationTurn,
  Hit,
  HitOrigin,
  LibrarySnapshot,
} from "../../library/types.js";
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
import { Markdown } from "./Markdown";
import { isModEnter, sendChord } from "./modEnter";
import { PromptDialog } from "./PromptDialog";
import { t } from "./uiText";

type Props = {
  snapshot: LibrarySnapshot;
  lang: AppLanguage;
  question: string;
  setQuestion: (value: string) => void;
  onSeek: (seconds: number | null) => void;
};

export function AskPane({
  snapshot,
  lang,
  question,
  setQuestion,
  onSeek,
}: Props) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const turns = snapshot.conversationTurns;
  const empty = turns.length === 0 && !pendingQuestion;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns.length, asking, pendingQuestion, snapshot.askError]);

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

  async function send(text = question): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || asking) return;
    setAsking(true);
    setPendingQuestion(trimmed);
    setQuestion("");
    try {
      await window.doorei.call("ask", { question: trimmed });
    } catch {
      setQuestion(trimmed);
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
        <Button
          variant="ghost"
          size="icon-sm"
          title={t(lang, "newConversation")}
          aria-label={t(lang, "newConversation")}
          onClick={() => void window.doorei.call("createConversation")}
        >
          <Plus />
        </Button>
        {snapshot.activeConversationId ? (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              title={t(lang, "renameConversation")}
              aria-label={t(lang, "renameConversation")}
              onClick={() => setRenameOpen(true)}
            >
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              title={t(lang, "deleteConversation")}
              aria-label={t(lang, "deleteConversation")}
              onClick={() =>
                void window.doorei.call(
                  "deleteConversation",
                  snapshot.activeConversationId
                )
              }
            >
              <Trash2 />
            </Button>
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
        className="shrink-0 border-t border-white/10 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <div className="flex items-end gap-2 rounded-2xl border bg-muted/40 p-1.5 ps-3">
          <Textarea
            className="max-h-32 min-h-9 flex-1 resize-none border-0 bg-transparent p-0 py-1.5 shadow-none field-sizing-content focus-visible:ring-0 dark:bg-transparent"
            placeholder={t(lang, "askPlaceholder").replace(
              "{chord}",
              sendChord()
            )}
            value={question}
            rows={1}
            disabled={asking}
            dir={question.trim() ? textDirection(question) : "auto"}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (!isModEnter(event)) return;
              event.preventDefault();
              void send();
            }}
          />
          <Button
            type="submit"
            size="icon-sm"
            className="rounded-full"
            disabled={asking || !question.trim()}
            aria-label={t(lang, "send")}
            title={t(lang, "send")}
          >
            {asking ? <Loader2 className="animate-spin" /> : <ArrowUp />}
          </Button>
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
  return t(lang, "hitRestOfCourse");
}

function formatCaptionTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}
