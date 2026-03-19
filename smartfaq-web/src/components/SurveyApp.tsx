"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { FileText, LayoutList, Sparkles, ChevronRight, ChevronLeft } from "lucide-react";
import {
  DEFAULT_FORM,
  EVAL_FIELDS,
  type NoteAnswers,
  defaultNoteAnswers,
  getFormNoteIds,
  getNote,
} from "@/lib/study";
import type { SurveyResponse } from "@/lib/types";
import { trackClient } from "@/components/track";

type Step = "intro" | "demographics" | "evaluate" | "thanks";

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
}: {
  label: React.ReactNode;
  left: string;
  right: string;
  value: number;
  onChange: (n: number) => void;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-800">
        {label}
        {required ? <span className="text-rose-600"> *</span> : null}
        <span className="ml-1 font-normal text-slate-500">(1–10)</span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <span className="max-w-[7rem] text-xs leading-tight text-slate-500">{left}</span>
        <input
          type="range"
          min={1}
          max={10}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-2 flex-1 min-w-[8rem] cursor-pointer accent-teal-600"
        />
        <span className="max-w-[7rem] text-right text-xs leading-tight text-slate-500">{right}</span>
        <span className="w-8 text-center text-sm font-semibold tabular-nums text-teal-800">{value}</span>
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
    consent_acknowledgments_listed: false,
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

  const note = getNote(activeNoteId);

  const validateDemo = (): string[] => {
    const e: string[] = [];
    if (!demo.participant_email.trim()) e.push("Email is required.");
    const req = [
      "demo_age",
      "demo_race",
      "demo_hispanic",
      "demo_healthcare_bg",
      "demo_recent_discharge",
      "demo_confident_forms",
      "demo_digital_comfort",
      "demo_caregiver",
      "demo_acknowledge_publication",
    ] as const;
    for (const k of req) {
      if (!String(demo[k]).trim()) e.push(`Missing: ${k}`);
    }
    if (demo.demo_race === "Other" && !demo.demo_race_other.trim()) {
      e.push("Specify race (Other).");
    }
    return e;
  };

  const validateNote = (a: NoteAnswers): string[] => {
    const e: string[] = [];
    for (const k of EVAL_FIELDS) {
      if (a[k] == null || Number.isNaN(a[k])) e.push(k);
    }
    if (!a.faq_unanswered) e.push("faq_unanswered");
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
      consent_acknowledgments_listed: demo.consent_acknowledgments_listed,
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
      alert("Please complete required fields:\n" + errs.join("\n"));
      return;
    }
    const row = buildResponse(activeNoteId);
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      alert("Save failed. Try again.");
      return;
    }
    const nextDone = new Set([...completed, activeNoteId]);
    setCompleted(nextDone);
    if (nextDone.size >= noteIds.length) setStep("thanks");
  };

  const doneCount = completed.size;
  const total = noteIds.length;
  const pct = total ? Math.round((100 * doneCount) / total) : 0;

  if (!sessionId) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-500">
        Starting session…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100">
      <header className="border-b border-slate-800/10 bg-slate-900 text-white shadow-lg">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-teal-300/90">Research</p>
            <h1 className="text-lg font-semibold tracking-tight sm:text-xl">SmartFAQs — patient perspective</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200 sm:inline">
              Form <span className="font-mono text-teal-300">{formId}</span>
            </span>
            <Link
              href="/admin"
              className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-slate-200 transition hover:bg-white/10"
            >
              Admin
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[minmax(280px,380px)_1fr] lg:gap-10 lg:px-6 lg:py-10">
        {/* Sidebar */}
        <aside className="order-2 space-y-6 lg:order-1">
          <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm shadow-slate-200/60 backdrop-blur-sm">
            <nav className="mb-4 flex gap-2 text-xs font-medium text-slate-500">
              <span
                className={step === "intro" ? "text-teal-700" : ""}
              >{`Intro`}</span>
              <span>→</span>
              <span className={step === "demographics" ? "text-teal-700" : ""}>Demographics</span>
              <span>→</span>
              <span className={step === "evaluate" || step === "thanks" ? "text-teal-700" : ""}>Notes</span>
            </nav>

            {step === "intro" && (
              <p className="text-sm text-slate-600">When you’re ready, continue to demographics using the buttons below.</p>
            )}

            {step === "thanks" && (
              <p className="text-sm font-medium text-teal-800">All set — thank you for completing every note in this form.</p>
            )}

            {step === "demographics" && (
              <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
                <h2 className="text-sm font-semibold text-slate-900">Your information</h2>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm outline-none ring-teal-600/30 focus:border-teal-500 focus:ring-2"
                  placeholder="Email *"
                  value={demo.participant_email}
                  onChange={(e) => {
                    setDemo((d) => ({ ...d, participant_email: e.target.value }));
                    markTouch("demo:participant_email");
                  }}
                />
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-600/30"
                  placeholder="Name (optional)"
                  value={demo.participant_name}
                  onChange={(e) => {
                    setDemo((d) => ({ ...d, participant_name: e.target.value }));
                    markTouch("demo:participant_name");
                  }}
                />
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-1 accent-teal-600"
                    checked={demo.consent_acknowledgments_listed}
                    onChange={(e) => {
                      setDemo((d) => ({ ...d, consent_acknowledgments_listed: e.target.checked }));
                      markTouch("demo:consent");
                    }}
                  />
                  I consent to be listed in the acknowledgments of the paper.
                </label>
                <hr className="border-slate-200" />
                <p className="text-xs text-slate-500">
                  We ask demographic questions to understand whether SmartFAQs help diverse populations.
                </p>
                {/* Simplified: key demo radios as select for space — use native selects where long lists */}
                <div className="space-y-3 text-sm">
                  <label className="block font-medium text-slate-800">
                    Age <span className="text-rose-600">*</span>
                  </label>
                  <select
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-teal-500"
                    value={demo.demo_age}
                    onChange={(e) => {
                      setDemo((d) => ({ ...d, demo_age: e.target.value }));
                      markTouch("demo:demo_age");
                    }}
                  >
                    <option value="">Select…</option>
                    {DEMO_AGE.map((x) => (
                      <option key={x} value={x}>{x}</option>
                    ))}
                  </select>
                  <label className="block font-medium text-slate-800">
                    Race <span className="text-rose-600">*</span>
                  </label>
                  <select
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-teal-500"
                    value={demo.demo_race}
                    onChange={(e) => {
                      setDemo((d) => ({ ...d, demo_race: e.target.value }));
                      markTouch("demo:demo_race");
                    }}
                  >
                    <option value="">Select…</option>
                    {DEMO_RACE.map((x) => (
                      <option key={x} value={x}>{x}</option>
                    ))}
                  </select>
                  {demo.demo_race === "Other" && (
                    <input
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
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
                      ["demo_hispanic", "Hispanic / Latino / Spanish origin?", ["Yes", "No", "Prefer not to answer"]],
                      ["demo_education", "Education", ["High School Experience, but no Degree", "High School or GED Equivalent", "Some College Experience, but no Degree", "College Graduate (BS, BA)", "Master's Degree (MA, MS, MBA)", "Professional Degree (MD, JD)", "Doctorate Degree (PhD)", "Prefer not to say"]],
                      ["demo_healthcare_bg", "Healthcare background", ["Yes – clinical (e.g., physician, nurse, therapist)", "Yes – non-clinical (e.g., public health, research, admin)", "No", "Prefer not to answer"]],
                      ["demo_recent_discharge", "Discharged from hospital or ED in past 6 months?", ["Yes", "No"]],
                      ["demo_confident_forms", "Confidence filling medical forms", ["Extremely confident", "Quite confident", "Somewhat confident", "A little confident", "Not at all confident"]],
                      ["demo_digital_comfort", "Comfort with digital health tools", ["Very comfortable", "Somewhat comfortable", "Neutral", "Somewhat uncomfortable", "Very uncomfortable"]],
                      ["demo_caregiver", "Help manage care for a family member?", ["Yes", "No"]],
                      ["demo_acknowledge_publication", "OK to be acknowledged by name in publications?", ["Yes", "No"]],
                    ] as const
                  ).map(([key, label, opts]) => (
                    <div key={key}>
                      <label className="mb-1 block font-medium text-slate-800">
                        {label} {key !== "demo_education" && <span className="text-rose-600">*</span>}
                      </label>
                      <select
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
                        value={demo[key]}
                        onChange={(e) => {
                          const v = e.target.value;
                          setDemo((d) => ({ ...d, [key]: v }));
                          markTouch(`demo:${key}`);
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
                <label className="block text-sm font-medium text-slate-800">Select note</label>
                <select
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono outline-none focus:border-teal-500"
                  value={activeNoteId}
                  onChange={(e) => setActiveNoteId(e.target.value)}
                >
                  {noteIds.map((id) => (
                    <option key={id} value={id}>{id}</option>
                  ))}
                </select>
                <div>
                  <div className="mb-1 flex justify-between text-xs text-slate-500">
                    <span>Progress</span>
                    <span>{doneCount} / {total} ({pct}%)</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-teal-500 to-cyan-500 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <div className="space-y-6 border-t border-slate-100 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">Hospital course</p>
                  <Likert label="How understandable was this hospital course?" left="Did not understand" right="Completely understand" value={getAnswers(activeNoteId).hc_understand} onChange={(n) => { markTouch(`${activeNoteId}:hc_understand`); setEval(activeNoteId, { hc_understand: n }); }} required />
                  <Likert label="Comfort managing your care from this hospital course?" left="Uncomfortable" right="Comfortable" value={getAnswers(activeNoteId).hc_comfort} onChange={(n) => { markTouch(`${activeNoteId}:hc_comfort`); setEval(activeNoteId, { hc_comfort: n }); }} required />
                  <Likert label="Clarity on next steps?" left="Not clear" right="Very clear" value={getAnswers(activeNoteId).hc_clarity} onChange={(n) => { markTouch(`${activeNoteId}:hc_clarity`); setEval(activeNoteId, { hc_clarity: n }); }} required />
                  <Likert label="Understanding when to seek help if worse?" left="None" right="Complete" value={getAnswers(activeNoteId).hc_when_help} onChange={(n) => { markTouch(`${activeNoteId}:hc_when_help`); setEval(activeNoteId, { hc_when_help: n }); }} required />
                  <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">Discharge summary</p>
                  <Likert label="Understandable discharge summary?" left="Did not understand" right="Completely understand" value={getAnswers(activeNoteId).dc_understand} onChange={(n) => { markTouch(`${activeNoteId}:dc_understand`); setEval(activeNoteId, { dc_understand: n }); }} required />
                  <Likert label="Comfort managing care from discharge summary?" left="Uncomfortable" right="Comfortable" value={getAnswers(activeNoteId).dc_comfort} onChange={(n) => { markTouch(`${activeNoteId}:dc_comfort`); setEval(activeNoteId, { dc_comfort: n }); }} required />
                  <Likert label="Clarity on next steps (discharge)?" left="Not clear" right="Very clear" value={getAnswers(activeNoteId).dc_clarity} onChange={(n) => { markTouch(`${activeNoteId}:dc_clarity`); setEval(activeNoteId, { dc_clarity: n }); }} required />
                  <Likert label="When to seek help (discharge)?" left="None" right="Complete" value={getAnswers(activeNoteId).dc_when_help} onChange={(n) => { markTouch(`${activeNoteId}:dc_when_help`); setEval(activeNoteId, { dc_when_help: n }); }} required />
                  <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">SmartFAQs</p>
                  <Likert label="Understandable FAQs?" left="Did not understand" right="Completely understand" value={getAnswers(activeNoteId).faq_understand} onChange={(n) => { markTouch(`${activeNoteId}:faq_understand`); setEval(activeNoteId, { faq_understand: n }); }} required />
                  <Likert label="Comfort managing care from FAQs?" left="Uncomfortable" right="Comfortable" value={getAnswers(activeNoteId).faq_comfort} onChange={(n) => { markTouch(`${activeNoteId}:faq_comfort`); setEval(activeNoteId, { faq_comfort: n }); }} required />
                  <Likert label="Clarity on next steps (FAQs)?" left="Not clear" right="Very clear" value={getAnswers(activeNoteId).faq_clarity} onChange={(n) => { markTouch(`${activeNoteId}:faq_clarity`); setEval(activeNoteId, { faq_clarity: n }); }} required />
                  <Likert label="When to seek help (FAQs)?" left="None" right="Complete" value={getAnswers(activeNoteId).faq_when_help} onChange={(n) => { markTouch(`${activeNoteId}:faq_when_help`); setEval(activeNoteId, { faq_when_help: n }); }} required />
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-800">
                      Unanswered questions needing your doctor? <span className="text-rose-600">*</span>
                    </label>
                    <div className="flex gap-4">
                      {(["Yes", "No"] as const).map((x) => (
                        <label key={x} className="flex cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="faq_unanswered"
                            className="accent-teal-600"
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
              className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-rose-200/80 bg-white px-4 py-2.5 text-sm font-medium text-rose-900 shadow-sm transition hover:border-rose-300 hover:bg-rose-50 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" /> Previous
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
              className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-rose-200/80 bg-white px-4 py-2.5 text-sm font-medium text-rose-900 shadow-sm transition hover:border-rose-300 hover:bg-rose-50 disabled:opacity-40"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {step === "evaluate" && (
            <button
              type="button"
              onClick={() => void submitNote()}
              className="w-full rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-teal-600/25 transition hover:from-teal-500 hover:to-cyan-500"
            >
              Submit this note
            </button>
          )}
        </aside>

        {/* Main reader */}
        <main className="order-1 lg:order-2">
          {step === "intro" && (
            <article className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-10">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">About this survey</h2>
              <div className="prose prose-slate mt-6 max-w-none prose-p:text-slate-600 prose-li:text-slate-600">
                <p>We are evaluating <strong>SmartFAQs</strong>, a new way of presenting hospital discharge information in a question-and-answer format—designed to make instructions easier to understand and more actionable after you leave the hospital.</p>
                <p>You will review discharge information in the SmartFAQs format and answer short questions about clarity, understanding, usefulness, and confidence managing care after discharge.</p>
                <ul>
                  <li>Takes about <strong>15–20 minutes</strong>.</li>
                  <li>Participation is voluntary; skip any question or stop anytime.</li>
                  <li>Your answers help improve patient-centered health communication.</li>
                </ul>
              </div>
            </article>
          )}

          {step === "demographics" && (
            <div className="rounded-2xl border border-dashed border-teal-200 bg-teal-50/40 p-8 text-center text-slate-600">
              <p className="text-lg font-medium text-slate-800">Questions are in the left panel</p>
              <p className="mt-2 text-sm">Fields marked * are required before you can rate the clinical notes.</p>
            </div>
          )}

          {(step === "evaluate" || step === "thanks") && (
            <>
              {step === "thanks" ? (
                <div className="rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 to-white p-10 text-center shadow-inner">
                  <Sparkles className="mx-auto h-12 w-12 text-teal-600" />
                  <h2 className="mt-4 text-2xl font-semibold text-slate-900">Thank you</h2>
                  <p className="mt-2 text-slate-600">Your responses are saved. You may close this window.</p>
                  <Link href="/" className="mt-6 inline-block text-sm font-medium text-teal-700 underline">Back to start</Link>
                </div>
              ) : note ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <FileText className="h-5 w-5 text-teal-600" />
                    <span className="font-mono text-sm font-semibold text-slate-800">{activeNoteId}</span>
                    {completed.has(activeNoteId) && (
                      <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-800">Submitted</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 rounded-xl bg-slate-100/80 p-1">
                    {(
                      [
                        ["hc", "Hospital course", LayoutList],
                        ["dc", "Discharge summary", FileText],
                        ["faq", "FAQs", Sparkles],
                      ] as const
                    ).map(([id, label, Icon]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setTab(id)}
                        className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                          tab === id
                            ? "bg-white text-teal-900 shadow-sm"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="min-h-[320px] rounded-2xl border border-slate-200/90 border-l-4 border-l-teal-500 bg-white p-6 shadow-sm sm:p-8">
                    {tab === "hc" && (
                      <>
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Hospital course</h3>
                        <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{note.hospital_course}</div>
                      </>
                    )}
                    {tab === "dc" && (
                      <>
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Discharge summary</h3>
                        <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{note.discharge_summary}</div>
                      </>
                    )}
                    {tab === "faq" && (
                      <>
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">SmartFAQs</h3>
                        <div className="prose prose-sm prose-slate mt-4 max-w-none prose-headings:text-slate-800 prose-p:text-slate-700">
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
    <Suspense fallback={<div className="p-12 text-center text-slate-500">Loading survey…</div>}>
      <InnerSurvey />
    </Suspense>
  );
}
