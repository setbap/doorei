import { useMemo, useState } from "react";
import { ArrowLeft, Cable, Languages, Package } from "lucide-react";
import type {
  AppLanguage,
  LibrarySnapshot,
  ProviderKind,
  ProviderKindFields,
} from "../../library/types.js";
import {
  providerByKindFromVault,
  type ProviderFieldKind,
} from "../../library/providerConfig.js";
import { MODEL_HUB_LINKS } from "../../library/models.js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AppBackdrop } from "./AppBackdrop";
import { ProviderFields } from "./ProviderFields";
import { t } from "./uiText";

type Props = { snapshot: LibrarySnapshot };
type Step = "intro" | "setup";

const glassPanel =
  "rounded-[20px] border border-neutral-800/10 bg-neutral-950/20 shadow-[0_12px_40px_rgba(0,0,0,0.28)] ring-1 ring-inset ring-neutral-500/15 backdrop-blur-2xl backdrop-saturate-150";

const primaryButton =
  "h-11 w-full rounded-xl border-0 bg-neutral-100 text-base text-neutral-900 hover:bg-white";

export function Welcome({ snapshot }: Props) {
  const [step, setStep] = useState<Step>(
    snapshot.appLanguage ? "setup" : "intro"
  );
  const [selected, setSelected] = useState<AppLanguage>(
    snapshot.appLanguage ?? "fa"
  );
  const [kind, setKind] = useState<ProviderFieldKind>(
    snapshot.provider?.kind ?? "none"
  );
  const [byKind, setByKind] = useState(() =>
    providerByKindFromVault(snapshot.providerVault)
  );
  const nativeGlass = window.doorei.platform === "darwin";

  const allComplete = snapshot.requiredModels.every((model) => model.complete);
  const models = useMemo(
    () =>
      snapshot.requiredModels.map((model) => ({
        ...model,
        label: modelLabel(model.id, selected),
      })),
    [snapshot.requiredModels, selected]
  );

  return (
    <div
      className="relative flex min-h-full items-center justify-center overflow-hidden px-6 py-16 font-sans"
      dir={selected === "fa" ? "rtl" : "ltr"}
      lang={selected}
    >
      <AppBackdrop nativeGlass={nativeGlass} />
      <div className="relative z-10 w-full">
        {step === "intro" ? (
          <Intro lang={selected} onStart={() => setStep("setup")} />
        ) : (
          <Setup
            lang={selected}
            kind={kind}
            byKind={byKind}
            models={models}
            allComplete={allComplete}
            onBack={() => setStep("intro")}
            onAppLanguage={setSelected}
            onKindChange={setKind}
            onFieldsChange={(nextKind, patch) =>
              setByKind((current) => ({
                ...current,
                [nextKind]: { ...current[nextKind], ...patch },
              }))
            }
            onOpen={() => {
              void (async () => {
                await window.doorei.call("configureProvider", kind, byKind);
                await window.doorei.call("chooseAppLanguage", selected);
              })();
            }}
          />
        )}
      </div>
    </div>
  );
}

function Intro({ lang, onStart }: { lang: AppLanguage; onStart: () => void }) {
  return (
    <div
      className={cn(
        glassPanel,
        "mx-auto w-full max-w-lg px-8 py-10 text-center"
      )}
    >
      <p className="text-sm font-medium tracking-wide text-white/60">
        {t(lang, "appName")}
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">
        {t(lang, "welcomeTitle")}
      </h1>
      <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-white/70">
        {t(lang, "welcomeBody")}
      </p>
      <Button size="lg" className={cn(primaryButton, "mt-8")} onClick={onStart}>
        {t(lang, "getStarted")}
      </Button>
    </div>
  );
}

function Setup({
  lang,
  kind,
  byKind,
  models,
  allComplete,
  onBack,
  onAppLanguage,
  onKindChange,
  onFieldsChange,
  onOpen,
}: {
  lang: AppLanguage;
  kind: ProviderFieldKind;
  byKind: ReturnType<typeof providerByKindFromVault>;
  models: { id: string; complete: boolean; label: string }[];
  allComplete: boolean;
  onBack: () => void;
  onAppLanguage: (language: AppLanguage) => void;
  onKindChange: (kind: ProviderFieldKind) => void;
  onFieldsChange: (kind: ProviderKind, patch: Partial<ProviderKindFields>) => void;
  onOpen: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <div className="flex items-center justify-between gap-3 px-1">
        <Button
          variant="ghost"
          size="sm"
          className="text-white/70 hover:bg-white/10 hover:text-white"
          onClick={onBack}
        >
          <ArrowLeft className="rtl:rotate-180" />
          {t(lang, "back")}
        </Button>
        <p className="text-sm font-medium text-white/60">
          {t(lang, "appName")}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className={cn(glassPanel, "flex flex-col p-6")}>
          <div className="flex items-center gap-2 text-white">
            <Package className="size-4 opacity-70" />
            <h2 className="text-lg font-semibold">{t(lang, "modelsTitle")}</h2>
          </div>
          <p className="mt-1 text-sm text-white/55">{t(lang, "modelsHint")}</p>
          <ul className="mt-5 grid gap-3">
            {models.map((model) => (
              <li
                key={model.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5"
              >
                <span className="truncate text-sm text-white/90">
                  {model.label}
                </span>
                <Badge
                  variant={model.complete ? "secondary" : "outline"}
                  className={
                    model.complete
                      ? "border-transparent bg-white/15 text-white"
                      : "border-white/20 bg-transparent text-white/55"
                  }
                >
                  {model.complete ? "✓" : "○"}
                </Badge>
              </li>
            ))}
          </ul>
          <p className="mt-auto pt-6 text-sm text-white/55">
            {allComplete ? t(lang, "modelsReady") : t(lang, "modelsMissing")}
          </p>
        </section>

        <section className={cn(glassPanel, "flex flex-col gap-6 p-6")}>
          <div className="flex items-center gap-2 text-white">
            <Languages className="size-4 opacity-70" />
            <h2 className="text-lg font-semibold">
              {t(lang, "languageTitle")}
            </h2>
          </div>

          <LanguagePair
            lang={lang}
            label={t(lang, "appLanguage")}
            hint={t(lang, "appLanguageHint")}
            value={lang}
            onChange={onAppLanguage}
          />
        </section>
      </div>

      <section className={cn(glassPanel, "p-6")}>
        <div className="flex items-center gap-2 text-white">
          <Cable className="size-4 opacity-70" />
          <h2 className="text-lg font-semibold">{t(lang, "providerOptional")}</h2>
        </div>
        <div className="mt-5 text-white">
          <ProviderFields
            lang={lang}
            kind={kind}
            byKind={byKind}
            onKindChange={onKindChange}
            onFieldsChange={onFieldsChange}
          />
        </div>
      </section>

      <Button
        size="lg"
        className={primaryButton}
        disabled={!allComplete}
        onClick={onOpen}
      >
        {t(lang, "continue")}
      </Button>
      <ModelRepoLinks />
    </div>
  );
}

function ModelRepoLinks() {
  return (
    <p className="px-1 text-center text-xs leading-relaxed text-white/40">
      {MODEL_HUB_LINKS.map((link, index) => (
        <span key={link.id}>
          {index > 0 ? " · " : null}
          <button
            type="button"
            className="text-white/50 underline-offset-2 transition hover:text-white hover:underline"
            onClick={() => {
              void window.doorei.openUrl(link.url);
            }}
          >
            {link.name}
          </button>
        </span>
      ))}
    </p>
  );
}

function LanguagePair({
  lang,
  label,
  hint,
  value,
  onChange,
}: {
  lang: AppLanguage;
  label: string;
  hint: string;
  value: AppLanguage;
  onChange: (language: AppLanguage) => void;
}) {
  return (
    <div className="grid gap-2">
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-white/50">{hint}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <LanguageChoice
          selected={value === "fa"}
          title={t(lang, "persian")}
          native="فارسی"
          onSelect={() => onChange("fa")}
        />
        <LanguageChoice
          selected={value === "en"}
          title={t(lang, "english")}
          native="English"
          onSelect={() => onChange("en")}
        />
      </div>
    </div>
  );
}

function LanguageChoice({
  selected,
  title,
  native,
  onSelect,
}: {
  selected: boolean;
  title: string;
  native: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "rounded-xl border px-3 py-3 text-start transition",
        selected
          ? "border-white/25 bg-white/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
          : "border-white/10 bg-black/20 text-white/75 hover:bg-white/10"
      )}
    >
      <span className="block text-sm font-medium">{title}</span>
      <span className="mt-0.5 block text-xs text-white/45">{native}</span>
    </button>
  );
}

function modelLabel(id: string, lang: AppLanguage): string {
  if (id.includes("Shenava")) return t(lang, "modelPersianAsr");
  if (id.includes("parakeet")) return t(lang, "modelEnglishAsr");
  if (id.includes("e5")) return t(lang, "modelEmbedding");
  return id.split("/")[1] ?? id;
}
