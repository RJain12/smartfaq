/** Study copy aligned with the original Google Forms / IRB text. */

export const INTRO_PARAGRAPHS = [
  "We are evaluating SmartFAQs, a new way of presenting hospital discharge information in a question-and-answer format. The goal of SmartFAQs is to make medical instructions easier to understand and more actionable for patients after leaving the hospital.",
  "In this survey, you will be asked to review a short example of discharge information presented using the SmartFAQs format. After reviewing it, you will answer a brief set of questions about clarity, ease of understanding, usefulness and confidence in managing care after discharge.",
  "This survey is designed to help us understand whether SmartFAQs improve how patients interpret and use medical information.",
] as const;

export const INTRO_BULLETS = [
  "Set aside at least about 20 minutes in one sitting before you start — the full survey is easier to complete without interruption.",
  "Your answers for each patient note are only saved when you click “Submit this Note.” Closing the tab or leaving before that will lose that note’s responses (there is no autosave).",
  "Your responses will help guide future improvements to patient-centered health communication tools.",
  "Participation is voluntary. You may skip any question or stop at any time.",
] as const;

/** Highlight box on the intro screen (time + no partial save). */
export const INTRO_SESSION_NOTICE =
  "Only start when you have about 20 minutes. Progress is not saved until you submit each patient note — if you leave or close the browser before clicking “Submit this Note,” that note’s answers are lost.";

export const DEMO_INTRO =
  "We ask the following demographic questions to better understand whether SmartFAQs are helpful across diverse populations.";

export const HC_LIKERT = {
  understand: {
    q: "How understandable was this hospital course?",
    left: "Did not understand at all",
    right: "Completely understand",
  },
  comfort: {
    q: "How comfortable would you be in managing your own care based on this hospital course?",
    left: "Completely uncomfortable",
    right: "Completely comfortable",
  },
  clarity: {
    q: "How much clarity did you get on next steps of care?",
    left: "Not clear at all",
    right: "Very clear",
  },
  whenHelp: {
    q: "How much do you understand of when to seek additional help in case your health gets worse?",
    left: "Did not understand at all",
    right: "Completely understand",
  },
} as const;

export const DC_LIKERT = {
  understand: {
    /** Lowercase: shown after “On a scale of 1–10, …” */
    q: "how understandable was this discharge summary?",
    left: "Did not understand at all",
    right: "Completely understand",
  },
  comfort: {
    q: "how comfortable would you be in managing your own care based on this discharge summary?",
    left: "Completely uncomfortable",
    right: "Completely comfortable",
  },
  clarity: {
    q: "how much clarity did you get on next steps of care?",
    left: "Not clear at all",
    right: "Very clear",
  },
  whenHelp: {
    q: "how much do you understand of when to seek additional help in case your health gets worse?",
    left: "Did not understand at all",
    right: "Completely understand",
  },
} as const;

export const FAQ_LIKERT = {
  understand: {
    q: "how understandable were these frequently asked questions?",
    left: "Did not understand at all",
    right: "Completely understand",
  },
  comfort: {
    q: "how comfortable would you be in managing your own care based on these frequently asked questions?",
    left: "Completely uncomfortable",
    right: "Completely comfortable",
  },
  clarity: {
    q: "how much clarity did you get on next steps of care?",
    left: "Not clear at all",
    right: "Very clear",
  },
  whenHelp: {
    q: "how much do you understand of when to seek additional help in case your health gets worse?",
    left: "Did not understand at all",
    right: "Completely understand",
  },
} as const;

export const FAQ_UNANSWERED_LABEL =
  "Are you left with any unanswered questions that require further clarification from your doctor?";
