/** Study configuration — edit note text here (or load from CMS later). */

export const FORMS: Record<string, string[]> = {
  "1": ["NOTE_001", "NOTE_002", "NOTE_003", "NOTE_004", "NOTE_005"],
  "2": ["NOTE_006", "NOTE_007", "NOTE_008", "NOTE_009", "NOTE_010"],
  "3": ["NOTE_011", "NOTE_012", "NOTE_013", "NOTE_014", "NOTE_015"],
  "4": ["NOTE_016", "NOTE_017", "NOTE_018", "NOTE_019", "NOTE_020"],
  "5": ["NOTE_021", "NOTE_022", "NOTE_023", "NOTE_024"],
};

export const DEFAULT_FORM = "1";

export type NoteContent = {
  hospital_course: string;
  discharge_summary: string;
  faqs: string;
};

const NOTE_001: NoteContent = {
  hospital_course: `Brief hospital course (sample — replace with your note).

The patient presented with progressive dyspnea and was found to have bilateral lower-extremity edema. Workup suggested fluid overload in the setting of reduced cardiac output. Intravenous diuretics were initiated with improvement in symptoms. Cardiology was consulted; medical therapy was optimized. The patient remained hemodynamically stable, tolerated oral intake, and ambulated with physical therapy prior to discharge.`,
  discharge_summary: `Discharge summary (sample — replace with your note).

Diagnoses: Acute on chronic heart failure with preserved ejection fraction; hypertension; type 2 diabetes mellitus.

Discharge medications: [List as in your study materials.]

Follow-up: Cardiology clinic in 7–10 days; primary care in 2 weeks.

Return precautions: Worsening shortness of breath, new chest pain, fainting, or rapid weight gain.`,
  faqs: `**Why was I in the hospital?**
You were treated for fluid buildup related to heart strain and needed medications and monitoring until you were stable.

**What should I do at home?**
Take prescribed medicines, limit salt as instructed, and weigh yourself daily if your care team asked you to.

**When should I seek urgent care?**
If breathing becomes much harder, you have new chest pain, you faint, or you gain weight quickly despite following your plan.`,
};

const NOTE_002: NoteContent = {
  hospital_course: `Replace with hospital course text for NOTE_002.`,
  discharge_summary: `Replace with discharge summary for NOTE_002.`,
  faqs: `Replace with SmartFAQs content for NOTE_002 (Markdown supported).`,
};

function placeholderNote(id: string): NoteContent {
  return {
    hospital_course: `Placeholder hospital course for ${id}. Paste de-identified MIMIC-derived text here.`,
    discharge_summary: `Placeholder discharge summary for ${id}.`,
    faqs: `**Sample FAQ for ${id}?**\nReplace this block with your SmartFAQs Markdown.`,
  };
}

export const NOTES: Record<string, NoteContent> = (() => {
  const m: Record<string, NoteContent> = {
    NOTE_001,
    NOTE_002,
  };
  for (let n = 3; n <= 24; n++) {
    const id = `NOTE_${String(n).padStart(3, "0")}`;
    m[id] = placeholderNote(id);
  }
  return m;
})();

export function getFormNoteIds(formId: string): string[] {
  return FORMS[formId] ?? FORMS[DEFAULT_FORM]!;
}

export function getNote(id: string): NoteContent | undefined {
  return NOTES[id];
}

/** Display label: NOTE_001 → PATIENT 1 (internal IDs unchanged for data / sheets). */
export function noteIdToPatientLabel(noteId: string): string {
  const m = /^NOTE_(\d+)$/.exec(noteId);
  if (m) return `PATIENT ${Number(m[1])}`;
  return noteId.replace(/_/g, " ");
}

export const EVAL_FIELDS = [
  "hc_understand",
  "hc_comfort",
  "hc_clarity",
  "hc_when_help",
  "dc_understand",
  "dc_comfort",
  "dc_clarity",
  "dc_when_help",
  "faq_understand",
  "faq_comfort",
  "faq_clarity",
  "faq_when_help",
] as const;

export type EvalField = (typeof EVAL_FIELDS)[number];

export type NoteAnswers = Record<EvalField, number> & { faq_unanswered: string };

/** Likert fields start at 0 = unset; user must move each slider to 1–10 before submit. */
export function defaultNoteAnswers(): NoteAnswers {
  const o = {} as Record<string, number | string>;
  for (const k of EVAL_FIELDS) o[k] = 0;
  o.faq_unanswered = "";
  return o as NoteAnswers;
}
