"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { FileText, LayoutList, MessageCircleQuestion, ChevronRight, ChevronLeft, CheckCircle2 } from "lucide-react";
import {
  DEFAULT_FORM,
  EVAL_FIELDS,
  type NoteAnswers,
  defaultNoteAnswers,
  getFormNoteIds,
  getNote,
  noteIdToPatientLabel,
} from "@/lib/study";
import {
  DEMO_INTRO,
  DC_LIKERT,
  FAQ_LIKERT,
  FAQ_UNANSWERED_LABEL,
  HC_LIKERT,
  INTRO_BULLETS,
  INTRO_PARAGRAPHS,
} from "@/lib/survey-copy";
import type { SurveyResponse } from "@/lib/types";
import { trackClient } from "@/components/track";

type Step = "intro" | "demographics" | "evaluate" | "thanks";

function storageFeedbackLine(stored: string): string {
  switch (stored) {
    case "google_sheets":
      return "Saved to the study Google Sheet.";
    case "google_sheets_plus_kv":
      return "Saved to the Google Sheet (and a backup copy).";
    case "upstash_sheet_failed":
      return "The Google Sheet could not be updated — your response was saved to backup storage only. If rows never appear in the Sheet, ask the study team to check the Sheet tab name (GOOGLE_SHEETS_APPEND_RANGE), sharing with the service account, and Vercel logs.";
    case "upstash_only":
      return "Saved to backup storage (Google Sheet is not configured on the server).";
    case "local_file":
      return "Saved locally (development mode).";
    default:
      return "Response recorded.";
  }
}

const DEMO_AGE = [
  "18–30 years",
  "30–40 years",
  "40–50 years",
  "50–60 years",
  "60–70 years",
  "70+ years",
] as const;

const DEMO_RACE = [
  "American Indian or Alaska Native",
  "Asian",
  "Black or African American",
  "Native Hawaiian or Other Pacific Islander",
  "White",
  "Prefer not to answer",
  "Other",
] as const;

const DEMO_REQUIRED_KEYS = [
  "demo_age",
  "demo_race",
  "demo_hispanic",
  "demo_education",
  "demo_healthcare_bg",
  "demo_recent_discharge",
  "demo_confident_forms",
  "demo_digital_comfort",
  "demo_caregiver",
  "demo_acknowledge_publication",
] as const;

/** Human-readable labels for validation (match form wording). */
const DEMO_REQUIRED_LABELS: Record<(typeof DEMO_REQUIRED_KEYS)[number], string> = {
  demo_age: "How old are you?",
  demo_race: "How do you describe your race?",
  demo_hispanic: "Do you identify as Hispanic, Latino/a, or of Spanish origin?",
  demo_education: "What is the highest level of education you have completed?",
  demo_healthcare_bg: "Do you have a medical or healthcare background?",
  demo_recent_discharge:
    "Have you been discharged from a hospital or emergency department in the past 6 months?",
  demo_confident_forms: "How confident are you filling out medical forms on your own?",
  demo_digital_comfort:
    "How comfortable are you using digital tools (apps, websites, patient portals) to manage your health?",
  demo_caregiver: "Do you currently help manage healthcare for a family member or loved one?",
  demo_acknowledge_publication:
    "Would you be comfortable being acknowledged (by name) for your contributions in future publications resulting from this work?",
};

function useSessionId() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    let s = sessionStorage.getItem("smartfaq_sid");
    if (!s) {
      s = crypto.randomUUID();
      sessionStorage.setItem("smartfaq_sid", s);
    }
    setId(s);
  }, []);
  return id;
}

function Likert({
  label,
  left,
  right,
  value,
  onChange,
  required,
  kind,
}: {
  label: React.ReactNode;
  left: string;
  right: string;
  /** 0 = not yet set; 1–10 = response */
  value: number;
  onChange: (n: number) => void;
  required?: boolean;
  /** Hospital course: no “On a scale…” prefix. Discharge / SmartFAQs: Google Forms wording. */
  kind: "hc" | "scaled";
}) {
  const fullLabel =
    kind === "scaled" ? (
      <>
        On a scale of 1–10, {label}
        {required ? <span className="text-rose-600"> *</span> : null}
      </>
    ) : (
      <>
        {label}
        {required ? <span className="text-rose-600"> *</span> : null}
      </>
    );
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium leading-snug text-[#212529]">{fullLabel}</label>
      <div className="-mx-0.5 overflow-x-auto px-0.5 pb-0.5">
        <div className="flex min-w-[min(100%,22rem)] flex-nowrap items-center gap-2 sm:min-w-0">
        <span className="w-[28%] max-w-[10rem] shrink-0 text-xs leading-snug text-[#6c757d]">{left}</span>
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-2 min-w-0 flex-1 cursor-pointer accent-[#17a2b8]"
          aria-valuemin={0}
          aria-valuemax={10}
          aria-valuenow={value}
        />
        <span className="w-[28%] max-w-[11rem] shrink-0 text-right text-xs leading-snug text-[#6c757d]">{right}</span>
        <span className="w-8 shrink-0 text-center text-sm font-semibold tabular-nums text-[#138496]">
          {value >= 1 && value <= 10 ? value : "—"}
        </span>
        </div>
      </div>
    </div>
  );
}

function InnerSurvey() {
  const search = useSearchParams();
  const formId = search.get("form") ?? DEFAULT_FORM;
  const noteIds = useMemo(() => getFormNoteIds(formId), [formId]);
  const sessionId = useSessionId();

  const [step, setStep] = useState<Step>("intro");
  const [activeNoteId, setActiveNoteId] = useState(noteIds[0] ?? "NOTE_001");
  const [tab, setTab] = useState<"hc" | "dc" | "faq">("hc");
  const [completed, setCompleted] = useState<Set<string>>(() => new Set());
  const [answersByNote, setAnswersByNote] = useState<Record<string, NoteAnswers>>({});
  const touched = useRef<Set<string>>(new Set());
  const [submitFeedback, setSubmitFeedback] = useState<{
    stored: string;
    patientLabel: string;
    remaining: number;
  } | null>(null);
  const [lastSubmitStored, setLastSubmitStored] = useState<string | null>(null);
  const submitFeedbackRef = useRef<HTMLDivElement>(null);
  const patientSelectRef = useRef<HTMLSelectElement>(null);
  const demographicsScrollRef = useRef<HTMLDivElement>(null);

  /** After answering a demographic dropdown, nudge the panel down so the next questions come into view. */
  const nudgeDemographicsScroll = useCallback(() => {
    requestAnimationFrame(() => {
      const el = demographicsScrollRef.current;
      if (!el) return;
      const room = el.scrollHeight - el.clientHeight - el.scrollTop;
      if (room > 4) {
        el.scrollBy({ top: Math.min(100, room), behavior: "smooth" });
      }
    });
  }, []);

  const markTouch = useCallback(
    (qkey: string) => {
      if (!sessionId || touched.current.has(qkey)) return;
      touched.current.add(qkey);
      void trackClient({
        t: "question_touch",
        sessionId,
        formId,
        detail: { qkey },
      });
    },
    [sessionId, formId]
  );

  const [demo, setDemo] = useState({
    participant_email: "",
    participant_name: "",
    demo_age: "",
    demo_race: "",
    demo_race_other: "",
    demo_hispanic: "",
    demo_education: "",
    demo_healthcare_bg: "",
    demo_recent_discharge: "",
    demo_confident_forms: "",
    demo_digital_comfort: "",
    demo_caregiver: "",
    demo_acknowledge_publication: "",
  });

  const getAnswers = useCallback(
    (nid: string): NoteAnswers => {
      return answersByNote[nid] ?? defaultNoteAnswers();
    },
    [answersByNote]
  );

  const setEval = useCallback(
    (nid: string, patch: Partial<NoteAnswers>) => {
      setAnswersByNote((prev) => ({
        ...prev,
        [nid]: { ...getAnswers(nid), ...patch },
      }));
    },
    [getAnswers]
  );

  useEffect(() => {
    if (!sessionId) return;
    void trackClient({
      t: "session_start",
      sessionId,
      formId,
      detail: {
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        language: typeof navigator !== "undefined" ? navigator.language : "",
        screen: [window.screen.width, window.screen.height],
      },
    });
  }, [sessionId, formId]);

  useEffect(() => {
    if (!sessionId) return;
    const sec =
      step === "intro" ? 0 : step === "demographics" ? 1 : step === "evaluate" ? 2 : 3;
    void trackClient({
      t: "section",
      sessionId,
      formId,
      detail: { section: sec, step },
    });
  }, [step, sessionId, formId]);

  useEffect(() => {
    if (!sessionId || step !== "evaluate") return;
    void trackClient({
      t: "note_tab",
      sessionId,
      formId,
      detail: { note_id: activeNoteId, tab },
    });
  }, [tab, activeNoteId, step, sessionId, formId]);

  useEffect(() => {
    setActiveNoteId((cur) => (noteIds.includes(cur) ? cur : noteIds[0] ?? cur));
  }, [noteIds]);

  useEffect(() => {
    if (!submitFeedback || step !== "evaluate") return;
    submitFeedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    requestAnimationFrame(() => {
      patientSelectRef.current?.focus();
    });
  }, [submitFeedback, step]);

  const note = getNote(activeNoteId);

  const validateDemo = (): string[] => {
    const e: string[] = [];
    if (!demo.participant_email.trim()) e.push("Email is required.");
    let anyDemoMissing = false;
    for (const k of DEMO_REQUIRED_KEYS) {
      if (!String(demo[k]).trim()) {
        anyDemoMissing = true;
        e.push(`• ${DEMO_REQUIRED_LABELS[k]}`);
      }
    }
    if (demo.demo_race === "Other" && !demo.demo_race_other.trim()) {
      e.push("• Please specify your race (Other).");
      anyDemoMissing = true;
    }
    if (anyDemoMissing) {
      e.push(
        "\nScroll down in the demographics panel on the left if you don’t see all of these — more questions are below."
      );
    }
    return e;
  };

  const validateNote = (a: NoteAnswers): string[] => {
    const e: string[] = [];
    for (const k of EVAL_FIELDS) {
      const v = a[k];
      if (v == null || Number.isNaN(v) || v < 1 || v > 10) e.push(k);
    }
    if (!a.faq_unanswered || !["Yes", "No"].includes(a.faq_unanswered)) e.push("faq_unanswered");
    return e;
  };

  const buildResponse = (noteId: string): SurveyResponse => {
    const a = getAnswers(noteId);
    return {
      session_id: sessionId ?? "",
      submitted_at_utc: new Date().toISOString(),
      form_id: formId,
      note_id: noteId,
      participant_email: demo.participant_email,
      participant_name: demo.participant_name,
      consent_acknowledgments_listed: false,
      demo_age: demo.demo_age,
      demo_race: demo.demo_race,
      demo_race_other: demo.demo_race === "Other" ? demo.demo_race_other : "",
      demo_hispanic: demo.demo_hispanic,
      demo_education: demo.demo_education,
      demo_healthcare_bg: demo.demo_healthcare_bg,
      demo_recent_discharge: demo.demo_recent_discharge,
      demo_confident_forms: demo.demo_confident_forms,
      demo_digital_comfort: demo.demo_digital_comfort,
      demo_caregiver: demo.demo_caregiver,
      demo_acknowledge_publication: demo.demo_acknowledge_publication,
      hc_understand: a.hc_understand,
      hc_comfort: a.hc_comfort,
      hc_clarity: a.hc_clarity,
      hc_when_help: a.hc_when_help,
      dc_understand: a.dc_understand,
      dc_comfort: a.dc_comfort,
      dc_clarity: a.dc_clarity,
      dc_when_help: a.dc_when_help,
      faq_understand: a.faq_understand,
      faq_comfort: a.faq_comfort,
      faq_clarity: a.faq_clarity,
      faq_when_help: a.faq_when_help,
      faq_unanswered: a.faq_unanswered,
    };
  };

  const submitNote = async () => {
    const errs = [...validateDemo(), ...validateNote(getAnswers(activeNoteId))];
    if (errs.length) {
      await trackClient({
        t: "submit_fail",
        sessionId: sessionId!,
        formId,
        detail: { note_id: activeNoteId, n: errs.length },
      });
      const hasUnsetLikert = errs.some((x) => EVAL_FIELDS.includes(x as (typeof EVAL_FIELDS)[number]));
      const msg = hasUnsetLikert
        ? "Please move each rating slider to a value from 1 to 10 (the scale starts unset until you adjust it), answer the follow-up question, and ensure demographics are complete.\n\nDetails:\n" +
          errs.join("\n")
        : "Please complete required fields:\n" + errs.join("\n");
      alert(msg);
      return;
    }
    const row = buildResponse(activeNoteId);
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      let msg = "Save failed. Try again.";
      try {
        const j = (await res.json()) as { error?: string };
        if (j.error) msg = `Save failed: ${j.error}`;
      } catch {
        /* ignore */
      }
      alert(msg);
      return;
    }
    let data: { stored?: string } = {};
    try {
      data = (await res.json()) as { stored?: string };
    } catch {
      /* ignore */
    }
    const stored = data.stored ?? "unknown";
    const nextDone = new Set([...completed, activeNoteId]);
    const remaining = noteIds.length - nextDone.size;
    setCompleted(nextDone);
    setLastSubmitStored(stored);
    if (nextDone.size >= noteIds.length) {
      setSubmitFeedback(null);
      setStep("thanks");
      return;
    }
    setSubmitFeedback({
      stored,
      patientLabel: noteIdToPatientLabel(activeNoteId),
      remaining,
    });
  };

  const doneCount = completed.size;
  const total = noteIds.length;
  const pct = total ? Math.round((100 * doneCount) / total) : 0;

  if (!sessionId) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center bg-[#f8f9fa] text-[#6c757d]">
        Preparing survey…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-[#212529]">
      <header className="bg-[#2c3e50] text-white">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <h1 className="text-base font-semibold tracking-wide sm:text-lg">
            SmartFAQs Survey — Patient Perspective
          </h1>
          <div className="flex items-center gap-3">
            <span className="hidden rounded border border-white/25 bg-white/5 px-2.5 py-1 font-mono text-xs text-white/90 sm:inline">
              Form {formId}
            </span>
            <Link
              href="/admin"
              className="rounded border border-white/30 px-3 py-1.5 text-sm text-white/90 transition hover:bg-white/10"
            >
              Admin
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] gap-6 px-4 py-6 lg:grid-cols-[minmax(50%,1fr)_minmax(0,1fr)] lg:gap-8 lg:px-6 lg:py-8">
        {/* Sidebar */}
        <aside className="order-2 space-y-4 lg:order-1">
          <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
            <nav className="mb-4 flex flex-wrap gap-1.5 text-xs font-medium text-[#6c757d]">
              <span className={step === "intro" ? "font-semibold text-[#2c3e50]" : ""}>Intro</span>
              <span aria-hidden>→</span>
              <span className={step === "demographics" ? "font-semibold text-[#2c3e50]" : ""}>Demographics</span>
              <span aria-hidden>→</span>
              <span className={step === "evaluate" || step === "thanks" ? "font-semibold text-[#2c3e50]" : ""}>
                Notes
              </span>
            </nav>

            {step === "intro" && (
              <p className="text-sm leading-relaxed text-[#495057]">
                When you are ready, use <strong className="font-semibold text-[#2c3e50]">Next section</strong> below to continue to
                demographics.
              </p>
            )}

            {step === "thanks" && (
              <p className="text-sm font-medium text-[#2c3e50]">All set — thank you for completing every note in this form.</p>
            )}

            {step === "demographics" && (
              <div
                ref={demographicsScrollRef}
                className="demographics-scroll max-h-[70vh] space-y-4 pr-1"
              >
                <h2 className="text-sm font-semibold text-[#2c3e50]">Your information</h2>
                <p className="rounded-md border border-[#cfe2ff] bg-[#f1f6ff] px-2.5 py-2 text-xs leading-snug text-[#2c3e50]">
                  <strong>Scroll down</strong> in this box to see every required question — there are more below your first answers.
                </p>
                <input
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#17a2b8] focus:ring-1 focus:ring-[#17a2b8]"
                  placeholder="Email *"
                  value={demo.participant_email}
                  onChange={(e) => {
                    setDemo((d) => ({ ...d, participant_email: e.target.value }));
                    markTouch("demo:participant_email");
                  }}
                />
                <input
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#17a2b8] focus:ring-1 focus:ring-[#17a2b8]"
                  placeholder="Name (optional)"
                  value={demo.participant_name}
                  onChange={(e) => {
                    setDemo((d) => ({ ...d, participant_name: e.target.value }));
                    markTouch("demo:participant_name");
                  }}
                />
                <hr className="border-slate-200" />
                <p className="text-xs leading-relaxed text-[#6c757d]">{DEMO_INTRO}</p>
                {/* Simplified: key demo radios as select for space — use native selects where long lists */}
                <div className="space-y-3 text-sm">
                  <label className="block font-medium text-slate-800">
                    How old are you? <span className="text-rose-600">*</span>
                  </label>
                  <select
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#17a2b8] focus:ring-1 focus:ring-[#17a2b8]"
                    value={demo.demo_age}
                    onChange={(e) => {
                      setDemo((d) => ({ ...d, demo_age: e.target.value }));
                      markTouch("demo:demo_age");
                      nudgeDemographicsScroll();
                    }}
                  >
                    <option value="">Select…</option>
                    {DEMO_AGE.map((x) => (
                      <option key={x} value={x}>{x}</option>
                    ))}
                  </select>
                  <label className="block font-medium text-slate-800">
                    How do you describe your race? <span className="text-rose-600">*</span>
                  </label>
                  <select
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#17a2b8] focus:ring-1 focus:ring-[#17a2b8]"
                    value={demo.demo_race}
                    onChange={(e) => {
                      setDemo((d) => ({ ...d, demo_race: e.target.value }));
                      markTouch("demo:demo_race");
                      nudgeDemographicsScroll();
                    }}
                  >
                    <option value="">Select…</option>
                    {DEMO_RACE.map((x) => (
                      <option key={x} value={x}>{x}</option>
                    ))}
                  </select>
                  {demo.demo_race === "Other" && (
                    <input
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      placeholder="Specify race"
                      value={demo.demo_race_other}
                      onChange={(e) => {
                        setDemo((d) => ({ ...d, demo_race_other: e.target.value }));
                        markTouch("demo:demo_race_other");
                      }}
                    />
                  )}
                  {(
                    [
                      ["demo_hispanic", "Do you identify as Hispanic, Latino/a, or of Spanish origin?", ["Yes", "No", "Prefer not to answer"]],
                      ["demo_education", "What is the highest level of education you have completed?", ["High School Experience, but no Degree", "High School or GED Equivalent", "Some College Experience, but no Degree", "College Graduate (BS, BA)", "Master's Degree (MA, MS, MBA)", "Professional Degree (MD, JD)", "Doctorate Degree (PhD)", "Prefer not to say"]],
                      ["demo_healthcare_bg", "Do you have a medical or healthcare background?", ["Yes – clinical (e.g., physician, nurse, therapist)", "Yes – non-clinical (e.g., public health, research, admin)", "No", "Prefer not to answer"]],
                      ["demo_recent_discharge", "Have you been discharged from a hospital or emergency department in the past 6 months?", ["Yes", "No"]],
                      ["demo_confident_forms", "How confident are you filling out medical forms on your own?", ["Extremely confident", "Quite confident", "Somewhat confident", "A little confident", "Not at all confident"]],
                      ["demo_digital_comfort", "How comfortable are you using digital tools (apps, websites, patient portals) to manage your health?", ["Very comfortable", "Somewhat comfortable", "Neutral", "Somewhat uncomfortable", "Very uncomfortable"]],
                      ["demo_caregiver", "Do you currently help manage healthcare for a family member or loved one?", ["Yes", "No"]],
                      ["demo_acknowledge_publication", "Would you be comfortable being acknowledged (by name) for your contributions in future publications resulting from this work?", ["Yes", "No"]],
                    ] as const
                  ).map(([key, label, opts]) => (
                    <div key={key}>
                      <label className="mb-1 block font-medium text-slate-800">
                        {label} <span className="text-rose-600">*</span>
                      </label>
                      <select
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#17a2b8] focus:ring-1 focus:ring-[#17a2b8]"
                        value={demo[key]}
                        onChange={(e) => {
                          const v = e.target.value;
                          setDemo((d) => ({ ...d, [key]: v }));
                          markTouch(`demo:${key}`);
                          nudgeDemographicsScroll();
                        }}
                      >
                        <option value="">Select…</option>
                        {opts.map((x) => (
                          <option key={x} value={x}>{x}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === "evaluate" && (
              <div className="space-y-4">
                {submitFeedback && (
                  <div
                    ref={submitFeedbackRef}
                    className="sticky top-2 z-20 rounded-md border border-green-600/30 bg-green-50 p-3 text-sm text-[#155724] shadow-sm ring-1 ring-green-600/10"
                    role="status"
                    aria-live="polite"
                  >
                    <div className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-700" aria-hidden />
                      <div className="min-w-0 space-y-1.5">
                        <p className="font-semibold text-[#155724]">
                          Submitted: {submitFeedback.patientLabel}
                        </p>
                        <p className="leading-snug text-green-900/90">{storageFeedbackLine(submitFeedback.stored)}</p>
                        {submitFeedback.remaining > 0 ? (
                          <p className="font-medium text-[#155724]">
                            Next: use <span className="whitespace-nowrap">Select patient</span> above to choose another
                            note — you have {submitFeedback.remaining} left in this form.
                          </p>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setSubmitFeedback(null)}
                          className="mt-1 text-xs font-medium text-green-800 underline decoration-green-700/50 hover:text-green-950"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                <label className="block text-sm font-medium text-[#2c3e50]" htmlFor="patient-select">
                  Select patient
                </label>
                <select
                  id="patient-select"
                  ref={patientSelectRef}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#17a2b8] focus:ring-2 focus:ring-[#17a2b8]/40"
                  value={activeNoteId}
                  onChange={(e) => {
                    setActiveNoteId(e.target.value);
                    setSubmitFeedback(null);
                  }}
                >
                  {noteIds.map((id) => (
                    <option key={id} value={id}>
                      {noteIdToPatientLabel(id)}
                    </option>
                  ))}
                </select>
                <div>
                  <div className="progress-label mb-1 flex justify-between text-sm text-[#6c757d]">
                    <span>Progress</span>
                    <span>
                      {doneCount} / {total} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-sm bg-slate-200">
                    <div
                      className="h-full rounded-sm bg-[#17a2b8] transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAnswersByNote((prev) => ({ ...prev, [activeNoteId]: defaultNoteAnswers() }));
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-[#6c757d] transition hover:bg-slate-50"
                >
                  Reset this note
                </button>
                <div className="space-y-4 border-t border-slate-200 pt-4">
                  <p className="survey-section-title">Hospital course</p>
                  <Likert kind="hc" label={HC_LIKERT.understand.q} left={HC_LIKERT.understand.left} right={HC_LIKERT.understand.right} value={getAnswers(activeNoteId).hc_understand} onChange={(n) => { markTouch(`${activeNoteId}:hc_understand`); setEval(activeNoteId, { hc_understand: n }); }} required />
                  <Likert kind="hc" label={HC_LIKERT.comfort.q} left={HC_LIKERT.comfort.left} right={HC_LIKERT.comfort.right} value={getAnswers(activeNoteId).hc_comfort} onChange={(n) => { markTouch(`${activeNoteId}:hc_comfort`); setEval(activeNoteId, { hc_comfort: n }); }} required />
                  <Likert kind="hc" label={HC_LIKERT.clarity.q} left={HC_LIKERT.clarity.left} right={HC_LIKERT.clarity.right} value={getAnswers(activeNoteId).hc_clarity} onChange={(n) => { markTouch(`${activeNoteId}:hc_clarity`); setEval(activeNoteId, { hc_clarity: n }); }} required />
                  <Likert kind="hc" label={HC_LIKERT.whenHelp.q} left={HC_LIKERT.whenHelp.left} right={HC_LIKERT.whenHelp.right} value={getAnswers(activeNoteId).hc_when_help} onChange={(n) => { markTouch(`${activeNoteId}:hc_when_help`); setEval(activeNoteId, { hc_when_help: n }); }} required />
                  <p className="survey-section-title">Discharge summary</p>
                  <Likert kind="scaled" label={DC_LIKERT.understand.q} left={DC_LIKERT.understand.left} right={DC_LIKERT.understand.right} value={getAnswers(activeNoteId).dc_understand} onChange={(n) => { markTouch(`${activeNoteId}:dc_understand`); setEval(activeNoteId, { dc_understand: n }); }} required />
                  <Likert kind="scaled" label={DC_LIKERT.comfort.q} left={DC_LIKERT.comfort.left} right={DC_LIKERT.comfort.right} value={getAnswers(activeNoteId).dc_comfort} onChange={(n) => { markTouch(`${activeNoteId}:dc_comfort`); setEval(activeNoteId, { dc_comfort: n }); }} required />
                  <Likert kind="scaled" label={DC_LIKERT.clarity.q} left={DC_LIKERT.clarity.left} right={DC_LIKERT.clarity.right} value={getAnswers(activeNoteId).dc_clarity} onChange={(n) => { markTouch(`${activeNoteId}:dc_clarity`); setEval(activeNoteId, { dc_clarity: n }); }} required />
                  <Likert kind="scaled" label={DC_LIKERT.whenHelp.q} left={DC_LIKERT.whenHelp.left} right={DC_LIKERT.whenHelp.right} value={getAnswers(activeNoteId).dc_when_help} onChange={(n) => { markTouch(`${activeNoteId}:dc_when_help`); setEval(activeNoteId, { dc_when_help: n }); }} required />
                  <p className="survey-section-title">SmartFAQs</p>
                  <Likert kind="scaled" label={FAQ_LIKERT.understand.q} left={FAQ_LIKERT.understand.left} right={FAQ_LIKERT.understand.right} value={getAnswers(activeNoteId).faq_understand} onChange={(n) => { markTouch(`${activeNoteId}:faq_understand`); setEval(activeNoteId, { faq_understand: n }); }} required />
                  <Likert kind="scaled" label={FAQ_LIKERT.comfort.q} left={FAQ_LIKERT.comfort.left} right={FAQ_LIKERT.comfort.right} value={getAnswers(activeNoteId).faq_comfort} onChange={(n) => { markTouch(`${activeNoteId}:faq_comfort`); setEval(activeNoteId, { faq_comfort: n }); }} required />
                  <Likert kind="scaled" label={FAQ_LIKERT.clarity.q} left={FAQ_LIKERT.clarity.left} right={FAQ_LIKERT.clarity.right} value={getAnswers(activeNoteId).faq_clarity} onChange={(n) => { markTouch(`${activeNoteId}:faq_clarity`); setEval(activeNoteId, { faq_clarity: n }); }} required />
                  <Likert kind="scaled" label={FAQ_LIKERT.whenHelp.q} left={FAQ_LIKERT.whenHelp.left} right={FAQ_LIKERT.whenHelp.right} value={getAnswers(activeNoteId).faq_when_help} onChange={(n) => { markTouch(`${activeNoteId}:faq_when_help`); setEval(activeNoteId, { faq_when_help: n }); }} required />
                  <div>
                    <label className="mb-2 block text-sm font-medium leading-snug text-slate-800">
                      {FAQ_UNANSWERED_LABEL} <span className="text-rose-600">*</span>
                    </label>
                    <div className="flex gap-4">
                      {(["Yes", "No"] as const).map((x) => (
                        <label key={x} className="flex cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name={`faq_unanswered_${activeNoteId}`}
                            className="accent-[#17a2b8]"
                            checked={getAnswers(activeNoteId).faq_unanswered === x}
                            onChange={() => {
                              markTouch(`${activeNoteId}:faq_unanswered`);
                              setEval(activeNoteId, { faq_unanswered: x });
                            }}
                          />
                          {x}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void submitNote()}
                  className="w-full rounded-md border border-transparent bg-[#17a2b8] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#138496]"
                >
                  Submit this Note ✓
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
            <button
              type="button"
              disabled={step === "intro"}
              onClick={() => {
                if (step === "demographics") setStep("intro");
                if (step === "evaluate") setStep("demographics");
              }}
              className="inline-flex items-center justify-center gap-2 rounded-md border-2 border-[#e8a0a8] bg-white px-4 py-2.5 text-sm font-medium text-[#a33d48] transition hover:border-[#d67884] hover:bg-[#fdecee] disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />← Previous section
            </button>
            <button
              type="button"
              onClick={() => {
                if (step === "intro") setStep("demographics");
                if (step === "demographics") {
                  const e = validateDemo();
                  if (e.length) {
                    alert(e.join("\n"));
                    return;
                  }
                  setStep("evaluate");
                }
              }}
              disabled={step === "evaluate" || step === "thanks"}
              className="inline-flex items-center justify-center gap-2 rounded-md border-2 border-[#e8a0a8] bg-white px-4 py-2.5 text-sm font-medium text-[#a33d48] transition hover:border-[#d67884] hover:bg-[#fdecee] disabled:opacity-40"
            >
              Next section <ChevronRight className="h-4 w-4" aria-hidden />→
            </button>
          </div>
        </aside>

        {/* Main reader */}
        <main className="order-1 lg:order-2">
          {step === "intro" && (
            <article className="rounded-md border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <h2 className="text-xl font-semibold text-[#2c3e50]">About this survey</h2>
              <div className="prose prose-slate mt-5 max-w-none prose-p:text-[#495057] prose-li:text-[#495057] prose-headings:text-[#2c3e50]">
                {INTRO_PARAGRAPHS.map((p) => (
                  <p key={p}>{p}</p>
                ))}
                <ul>
                  {INTRO_BULLETS.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            </article>
          )}

          {step === "demographics" && (
            <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-[#495057] shadow-sm">
              <p className="text-lg font-medium text-[#2c3e50]">Demographics</p>
              <p className="mt-2 text-sm leading-relaxed">
                Please complete the questions in the <strong>left panel</strong>. Fields marked <span className="text-red-600">*</span> are
                required before you can proceed to the clinical materials.
              </p>
              <p className="mx-auto mt-4 max-w-md text-sm font-medium leading-relaxed text-[#2c3e50]">
                Scroll down in that left panel to see and complete <strong>all</strong> questions — several required items are below the first
                screenful.
              </p>
            </div>
          )}

          {(step === "evaluate" || step === "thanks") && (
            <>
              {step === "thanks" ? (
                <div className="rounded-md border border-slate-200 bg-white p-10 text-center shadow-sm">
                  <CheckCircle2 className="mx-auto h-14 w-14 text-[#17a2b8]" strokeWidth={1.25} aria-hidden />
                  <h2 className="mt-4 text-xl font-semibold text-[#2c3e50]">Thanks for completing the survey</h2>
                  <p className="mt-2 text-sm text-[#6c757d]">Your responses have been recorded. You may close this window.</p>
                  {lastSubmitStored && (
                    <p className="mx-auto mt-4 max-w-lg text-left text-sm leading-relaxed text-[#495057]">
                      <strong className="text-[#2c3e50]">Where your answers were saved:</strong>{" "}
                      {storageFeedbackLine(lastSubmitStored)}
                    </p>
                  )}
                  <Link
                    href="/"
                    className="mt-6 inline-block text-sm font-medium text-[#138496] underline decoration-[#17a2b8] underline-offset-2 hover:text-[#117a8b]"
                  >
                    Back to start
                  </Link>
                </div>
              ) : note ? (
                <div className="space-y-3">
                  <div
                    className="rounded-md border border-[#cfe2ff] bg-[#e7f1ff] px-3 py-2.5 text-sm leading-snug text-[#2c3e50] shadow-sm"
                    role="status"
                  >
                    <strong className="font-semibold">Please read first:</strong> Open each tab below —{" "}
                    <span className="whitespace-nowrap">Hospital course</span>,{" "}
                    <span className="whitespace-nowrap">Discharge summary</span>, and{" "}
                    <span className="whitespace-nowrap">SmartFAQs</span> — before answering the questions in the left
                    panel.
                  </div>
                  <div className="flex flex-wrap items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
                    <FileText className="h-5 w-5 text-[#17a2b8]" aria-hidden />
                    <span className="text-sm font-semibold text-[#2c3e50]">{noteIdToPatientLabel(activeNoteId)}</span>
                    {completed.has(activeNoteId) && (
                      <span className="rounded border border-[#cfe2ff] bg-[#e7f1ff] px-2 py-0.5 text-xs font-medium text-[#2c3e50]">
                        Submitted
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 rounded-md border border-slate-200 bg-[#e9ecef] p-1">
                    {(
                      [
                        ["hc", "Hospital course", LayoutList],
                        ["dc", "Discharge summary", FileText],
                        ["faq", "SmartFAQs", MessageCircleQuestion],
                      ] as const
                    ).map(([id, label, Icon]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setTab(id)}
                        className={`inline-flex items-center gap-2 rounded px-3 py-2 text-sm font-medium transition ${
                          tab === id
                            ? "border border-slate-200 bg-white text-[#2c3e50] shadow-sm"
                            : "text-[#495057] hover:bg-white/60 hover:text-[#2c3e50]"
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="note-reading-panel min-h-[280px] p-4 sm:p-5">
                    {tab === "hc" && (
                      <>
                        <h3 className="text-sm font-semibold text-[#2c3e50]">Hospital course</h3>
                        <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[#212529]">{note.hospital_course}</div>
                      </>
                    )}
                    {tab === "dc" && (
                      <>
                        <h3 className="text-sm font-semibold text-[#2c3e50]">Discharge summary</h3>
                        <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[#212529]">{note.discharge_summary}</div>
                      </>
                    )}
                    {tab === "faq" && (
                      <>
                        <h3 className="text-sm font-semibold text-[#2c3e50]">SmartFAQs</h3>
                        <div className="note-panel-faq prose prose-sm prose-slate mt-3 max-w-none prose-headings:text-[#2c3e50] prose-p:text-[#212529]">
                          <ReactMarkdown>{note.faqs}</ReactMarkdown>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-red-600">Missing note content.</p>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export function SurveyApp() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center bg-[#f8f9fa] text-sm text-[#6c757d]">
          Loading survey…
        </div>
      }
    >
      <InnerSurvey />
    </Suspense>
  );
}
