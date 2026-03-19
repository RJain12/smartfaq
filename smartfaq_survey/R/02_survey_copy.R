intro_html <- HTML(
  "<p>We are evaluating <strong>SmartFAQs</strong>, a new way of presenting hospital discharge information in a question-and-answer format. The goal of SmartFAQs is to make medical instructions easier to understand and more actionable for patients after leaving the hospital.</p>",
  "<p>In this survey, you will be asked to review a short example of discharge information presented using the SmartFAQs format. After reviewing it, you will answer a brief set of questions about clarity, ease of understanding, usefulness and confidence in managing care after discharge.</p>",
  "<p>This survey is designed to help us understand whether SmartFAQs improve how patients interpret and use medical information.</p>",
  "<ul>",
  "<li>The survey should take about 15–20 minutes to complete.</li>",
  "<li>Your responses will help guide future improvements to patient-centered health communication tools.</li>",
  "<li>Participation is voluntary. You may skip any question or stop at any time.</li>",
  "</ul>"
)

demo_intro <-
  "We ask the following demographic questions to better understand whether SmartFAQs are helpful across diverse populations."

# Column names for the Google Sheet / CSV export (reference when creating the sheet header row).
sheet_columns <- c(
  "session_id",
  "submitted_at_utc",
  "form_id",
  "note_id",
  "participant_email",
  "participant_name",
  "consent_acknowledgments_listed",
  "demo_age",
  "demo_race",
  "demo_race_other",
  "demo_hispanic",
  "demo_education",
  "demo_healthcare_bg",
  "demo_recent_discharge",
  "demo_confident_forms",
  "demo_digital_comfort",
  "demo_caregiver",
  "demo_acknowledge_publication",
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
  "faq_unanswered"
)
