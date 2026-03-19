# SmartFAQs survey — run with shiny::runApp() from this directory
# ---------------------------------------------------------------------------

library(shiny)
library(bslib)
library(yaml)
library(htmltools)
library(commonmark)

source("R/01_load_config.R", local = TRUE)
source("R/02_survey_copy.R", local = TRUE)

cfg <- load_study_config()
notes_db <- load_notes()

if (is.null(cfg$forms) || length(cfg$forms) == 0L) {
  stop("config.yml must define non-empty 'forms'", call. = FALSE)
}

default_form <- as.character(cfg$default_form %||% names(cfg$forms)[1])

google_sheet_id <- as.character(cfg$google_sheet_id %||% "")
if (!nzchar(google_sheet_id)) {
  message("NOTE: google_sheet_id is empty in config.yml — submissions are not sent to Google Sheets (use CSV download for testing).")
}
# Path for gs4_auth on first sheet_append only (avoids startup/auth issues on hosted Shiny).
gcp_sa_path <- ""
if (nzchar(google_sheet_id)) {
  suppressPackageStartupMessages(library(googlesheets4))
  sa_json <- Sys.getenv("GOOGLE_APPLICATION_CREDENTIALS", unset = "")
  if (!nzchar(sa_json)) {
    sj <- cfg$google_service_account_json
    if (!is.null(sj) && nzchar(as.character(sj)) && file.exists(as.character(sj))) {
      sa_json <- normalizePath(as.character(sj), winslash = "/", mustWork = TRUE)
    }
  }
  if (nzchar(sa_json) && file.exists(sa_json)) {
    gcp_sa_path <- sa_json
  }
}

likert_1_10 <- function(input_id, label, left, right) {
  sliderInput(
    inputId = input_id,
    label = label,
    min = 1L,
    max = 10L,
    value = 5L,
    step = 1L,
    ticks = TRUE,
    pre = left,
    post = right
  )
}

req_star <- function() tags$span(class = "text-danger", " *")

#' Hospital course items (Google Forms style — no “On a scale” prefix).
lik_lab_hc <- function(q) tagList(q, req_star())

#' Discharge summary & SmartFAQs items (Forms use “On a scale of 1-10, …”).
lik_lab_scaled <- function(q) tagList("On a scale of 1–10, ", q, req_star())

survey_panel <- sidebarLayout(
  sidebarPanel(
    width = 4,
    uiOutput("sidebar_body"),
    hr(),
    fluidRow(
      column(
        6,
        actionButton(
          "btn_prev",
          label = "← Previous section",
          class = "btn-outline-accent w-100"
        )
      ),
      column(
        6,
        actionButton(
          "btn_next",
          label = "Next section →",
          class = "btn-outline-accent w-100"
        )
      )
    ),
    br(),
    actionButton(
      "btn_submit_note",
      label = "Submit this note ✅",
      class = "btn btn-primary w-100",
      style = "font-weight:600;"
    ),
    br(), br(),
    actionButton(
      "btn_reset_note",
      label = "Reset this note",
      class = "btn btn-outline-secondary w-100"
    ),
    br(), br(),
    uiOutput("submit_feedback"),
    br(),
    conditionalPanel(
      condition = "input.dev_download_visible",
      downloadButton("download_session", "Download responses (CSV)")
    ),
    checkboxInput("dev_download_visible", "Show local CSV download (testing)", value = FALSE)
  ),
  mainPanel(
    width = 8,
    uiOutput("main_body")
  )
)

ui <- fluidPage(
  theme = bs_theme(version = 5, bootswatch = "flatly", primary = "#17a2b8"),
  tags$head(
    tags$link(rel = "stylesheet", type = "text/css", href = "custom.css")
  ),
  div(class = "app-header", h4("SmartFAQs Survey — Patient Perspective")),
  survey_panel
)

server <- function(input, output, session) {
  session_id <- paste(
    format(Sys.time(), "%Y%m%d%H%M%S"),
    paste(sample(c(letters, LETTERS, 0:9), 8, TRUE), collapse = ""),
    sep = "-"
  )

  form_id <- reactive({
    q <- shiny::parseQueryString(session$clientData$url_search %||% "")
    fid <- q$form
    if (!is.null(fid) && length(fid) > 0L && fid %in% names(cfg$forms)) {
      fid
    } else {
      default_form
    }
  })

  note_ids <- reactive({
    ids <- cfg$forms[[form_id()]]
    if (is.null(ids)) ids <- cfg$forms[[default_form]]
    as.character(unlist(ids))
  })

  rv <- reactiveValues(
    section = 0L,
    note_cache = list(),
    active_note = NULL,
    completed_notes = character(),
    pending_rows = list(),
    syncing_note = FALSE
  )

  observe({
    ids <- note_ids()
    shiny::req(length(ids) > 0L)
    for (id in ids) {
      if (is.null(rv$note_cache[[id]])) {
        rv$note_cache[[id]] <- list(
          hc_understand = 5L,
          hc_comfort = 5L,
          hc_clarity = 5L,
          hc_when_help = 5L,
          dc_understand = 5L,
          dc_comfort = 5L,
          dc_clarity = 5L,
          dc_when_help = 5L,
          faq_understand = 5L,
          faq_comfort = 5L,
          faq_clarity = 5L,
          faq_when_help = 5L,
          faq_unanswered = NA_character_
        )
      }
    }
  })

  note_field_ids <- function() {
    c(
      "hc_understand", "hc_comfort", "hc_clarity", "hc_when_help",
      "dc_understand", "dc_comfort", "dc_clarity", "dc_when_help",
      "faq_understand", "faq_comfort", "faq_clarity", "faq_when_help",
      "faq_unanswered"
    )
  }

  read_note_inputs <- function() {
    ids <- note_field_ids()
    out <- list()
    for (nm in ids) {
      v <- input[[nm]]
      out[[nm]] <- v
    }
    out
  }

  push_inputs_to_cache <- function(note_id) {
    if (is.null(note_id) || !nzchar(note_id)) return(invisible(NULL))
    cur <- read_note_inputs()
    # isolate: may run from session$onFlushed (Shiny ≥1.13 forbids bare rv$ reads there)
    prev <- isolate(rv$note_cache[[note_id]]) %||% list()
    for (nm in names(cur)) {
      if (!is.null(cur[[nm]])) prev[[nm]] <- cur[[nm]]
    }
    rv$note_cache[[note_id]] <- prev
    invisible(NULL)
  }

  apply_cache_to_inputs <- function(note_id) {
    if (is.null(note_id)) return(invisible(NULL))
    c <- isolate(rv$note_cache[[note_id]]) %||% list()
    for (nm in note_field_ids()) {
      val <- c[[nm]]
      tryCatch(
        {
          if (nm == "faq_unanswered") {
            if (!is.null(val) && !is.na(val)) {
              updateRadioButtons(session, nm, selected = val)
            }
          } else {
            if (!is.null(val) && is.numeric(val)) {
              updateSliderInput(session, nm, value = as.integer(val))
            }
          }
        },
        error = function(e) invisible(NULL)
      )
    }
    invisible(NULL)
  }

  # Do not use req() here — safe for renderUI when sidebar/main flush order varies.
  resolve_note_id <- function(ids) {
    if (length(ids) == 0L) return(NULL)
    id <- input$note_select
    if (is.null(id) || length(id) == 0L || !nzchar(as.character(id[[1L]]))) {
      id <- rv$active_note
    } else {
      id <- as.character(id[[1L]])
    }
    if (is.null(id) || !nzchar(as.character(id))) {
      id <- ids[[1L]]
    }
    as.character(id)[[1L]]
  }

  observeEvent(input$note_select, ignoreInit = FALSE, {
    req(rv$section == 2L)
    if (isTRUE(rv$syncing_note)) return(invisible(NULL))
    new_id <- input$note_select
    if (is.null(new_id) || length(new_id) == 0L || !nzchar(as.character(new_id[[1L]]))) {
      return(invisible(NULL))
    }
    new_id <- as.character(new_id)[[1L]]
    old_id <- rv$active_note
    if (!is.null(old_id) && !identical(old_id, new_id)) {
      push_inputs_to_cache(old_id)
    }
    rv$active_note <- new_id
    session$onFlushed(function() {
      nid <- isolate(input$note_select)
      if (!is.null(nid) && length(nid) > 0L && nzchar(as.character(nid[[1L]]))) {
        apply_cache_to_inputs(as.character(nid)[[1L]])
      }
    }, once = TRUE)
  })

  observeEvent(rv$section, {
    if (rv$section == 2L) {
      ids <- note_ids()
      if (length(ids) == 0L) return(NULL)
      first <- ids[[1L]]
      if (is.null(rv$active_note) || !nzchar(as.character(rv$active_note)) ||
        !rv$active_note %in% ids) {
        rv$active_note <- first
      }
      rv$syncing_note <- TRUE
      updateSelectInput(session, "note_select", choices = ids, selected = rv$active_note)
      rv$syncing_note <- FALSE
      session$onFlushed(function() {
        apply_cache_to_inputs(isolate(rv$active_note))
      }, once = TRUE)
    }
  })

  output$sidebar_body <- renderUI({
    sec <- rv$section
    if (sec == 0L) {
      return(div(p("Use the buttons below when you are ready to continue.")))
    }
    if (sec == 1L) {
      return(tagList(
        h5("Demographics"),
        p(class = "small text-muted", demo_intro),
        h5(class = "mt-3", "Your information"),
        textInput("participant_email", label = tagList("Email", req_star()), placeholder = "you@example.com"),
        textInput("participant_name", "Name (optional)", placeholder = "Optional"),
        checkboxInput(
          "consent_acknowledgments_listed",
          "I consent to be listed in the acknowledgments of the paper.",
          value = FALSE
        ),
        hr(),
        radioButtons(
          "demo_age",
          label = tagList("How old are you?", tags$span(class = "text-danger", "*")),
          choices = c(
            "18–30 years",
            "30–40 years",
            "40–50 years",
            "50–60 years",
            "60–70 years",
            "70+ years"
          ),
          selected = character(0)
        ),
        radioButtons(
          "demo_race",
          label = tagList("How do you describe your race?", tags$span(class = "text-danger", "*")),
          choices = c(
            "American Indian or Alaska Native",
            "Asian",
            "Black or African American",
            "Native Hawaiian or Other Pacific Islander",
            "White",
            "Prefer not to answer",
            "Other"
          ),
          selected = character(0)
        ),
        conditionalPanel(
          condition = "input.demo_race == 'Other'",
          textInput("demo_race_other", "Please specify (Other race)")
        ),
        radioButtons(
          "demo_hispanic",
          label = tagList(
            "Do you identify as Hispanic, Latino/a, or of Spanish origin?",
            tags$span(class = "text-danger", "*")
          ),
          choices = c("Yes", "No", "Prefer not to answer"),
          selected = character(0)
        ),
        radioButtons(
          "demo_education",
          label = "What is the highest level of education you have completed?",
          choices = c(
            "High School Experience, but no Degree",
            "High School or GED Equivalent",
            "Some College Experience, but no Degree",
            "College Graduate (BS, BA)",
            "Master's Degree (MA, MS, MBA)",
            "Professional Degree (MD, JD)",
            "Doctorate Degree (PhD)",
            "Prefer not to say"
          ),
          selected = character(0)
        ),
        radioButtons(
          "demo_healthcare_bg",
          label = "Do you have a medical or healthcare background?",
          choices = c(
            "Yes – clinical (e.g., physician, nurse, therapist)",
            "Yes – non-clinical (e.g., public health, research, admin)",
            "No",
            "Prefer not to answer"
          ),
          selected = character(0)
        ),
        radioButtons(
          "demo_recent_discharge",
          label = "Have you been discharged from a hospital or emergency department in the past 6 months?",
          choices = c("Yes", "No"),
          selected = character(0)
        ),
        radioButtons(
          "demo_confident_forms",
          label = "How confident are you filling out medical forms on your own?",
          choices = c(
            "Extremely confident",
            "Quite confident",
            "Somewhat confident",
            "A little confident",
            "Not at all confident"
          ),
          selected = character(0)
        ),
        radioButtons(
          "demo_digital_comfort",
          label = "How comfortable are you using digital tools (apps, websites, patient portals) to manage your health?",
          choices = c(
            "Very comfortable",
            "Somewhat comfortable",
            "Neutral",
            "Somewhat uncomfortable",
            "Very uncomfortable"
          ),
          selected = character(0)
        ),
        radioButtons(
          "demo_caregiver",
          label = "Do you currently help manage healthcare for a family member or loved one?",
          choices = c("Yes", "No"),
          selected = character(0)
        ),
        radioButtons(
          "demo_acknowledge_publication",
          label = "Would you be comfortable being acknowledged (by name) for your contributions in future publications resulting from this work?",
          choices = c("Yes", "No"),
          selected = character(0)
        )
      ))
    }
    if (sec == 2L) {
      ids <- note_ids()
      n <- length(ids)
      done <- length(intersect(rv$completed_notes, ids))
      pct <- if (n > 0L) round(100 * done / n) else 0L
      return(tagList(
        tags$div(
          class = "survey-q-groups",
          selectInput(
            "note_select",
            "Select note",
            choices = ids,
            selected = rv$active_note %||% ids[[1L]],
            selectize = FALSE
          ),
          div(
            class = "progress-label",
            sprintf("Progress: %d / %d notes (%d%%)", done, n, pct)
          ),
          tags$div(
            class = "progress mb-3",
            tags$div(
              class = "progress-bar",
              role = "progressbar",
              style = sprintf("width: %d%%;", pct),
              `aria-valuenow` = pct,
              `aria-valuemin` = 0,
              `aria-valuemax` = 100
            )
          ),
          p(
            class = "small text-muted mb-3",
            "Use the tabs on the right to read the hospital course, discharge summary, and SmartFAQs while you answer here."
          ),
          p(
            class = "small text-muted mb-3",
            if (nzchar(google_sheet_id)) {
              "Each submission appends one row to your Google Sheet (one note completed)."
            } else {
              "Set google_sheet_id in config.yml (and service account auth) to save responses to Google Sheets; otherwise use the session CSV download."
            }
          ),
          tags$h4(class = "survey-section-title", "Hospital course"),
          likert_1_10(
            "hc_understand",
            lik_lab_hc("How understandable was this hospital course?"),
            "Did not understand at all",
            "Completely understand"
          ),
          likert_1_10(
            "hc_comfort",
            lik_lab_hc("How comfortable would you be in managing your own care based on this hospital course?"),
            "Completely uncomfortable",
            "Completely comfortable"
          ),
          likert_1_10(
            "hc_clarity",
            lik_lab_hc("How much clarity did you get on next steps of care?"),
            "Not clear at all",
            "Very clear"
          ),
          likert_1_10(
            "hc_when_help",
            lik_lab_hc("How much do you understand of when to seek additional help in case your health gets worse?"),
            "Did not understand at all",
            "Completely understand"
          ),
          hr(),
          tags$h4(class = "survey-section-title", "Discharge summary"),
          likert_1_10(
            "dc_understand",
            lik_lab_scaled("How understandable was this discharge summary?"),
            "Did not understand at all",
            "Completely understand"
          ),
          likert_1_10(
            "dc_comfort",
            lik_lab_scaled("How comfortable would you be in managing your own care based on this discharge summary?"),
            "Completely uncomfortable",
            "Completely comfortable"
          ),
          likert_1_10(
            "dc_clarity",
            lik_lab_scaled("How much clarity did you get on next steps of care?"),
            "Not clear at all",
            "Very clear"
          ),
          likert_1_10(
            "dc_when_help",
            lik_lab_scaled("How much do you understand of when to seek additional help in case your health gets worse?"),
            "Did not understand at all",
            "Completely understand"
          ),
          hr(),
          tags$h4(class = "survey-section-title", "SmartFAQs"),
          likert_1_10(
            "faq_understand",
            lik_lab_scaled("How understandable were these frequently asked questions?"),
            "Did not understand at all",
            "Completely understand"
          ),
          likert_1_10(
            "faq_comfort",
            lik_lab_scaled("How comfortable would you be in managing your own care based on these frequently asked questions?"),
            "Completely uncomfortable",
            "Completely comfortable"
          ),
          likert_1_10(
            "faq_clarity",
            lik_lab_scaled("How much clarity did you get on next steps of care?"),
            "Not clear at all",
            "Very clear"
          ),
          likert_1_10(
            "faq_when_help",
            lik_lab_scaled("How much do you understand of when to seek additional help in case your health gets worse?"),
            "Did not understand at all",
            "Completely understand"
          ),
          hr(),
          radioButtons(
            "faq_unanswered",
            label = tagList(
              "Are you left with any unanswered questions that require further clarification from your doctor?",
              req_star()
            ),
            choices = c("Yes", "No"),
            selected = character(0)
          )
        )
      ))
    }
    NULL
  })

  current_note <- reactive({
    if (rv$section != 2L) return(NULL)
    ids <- note_ids()
    resolve_note_id(ids)
  })

  output$main_body <- renderUI({
    sec <- rv$section
    ids <- note_ids()
    n <- length(ids)
    done <- length(intersect(rv$completed_notes, ids))

    if (sec == 0L) {
      return(tagList(
        card(card_body(intro_html))
      ))
    }
    if (sec == 1L) {
      return(tagList(
        card(
          card_header("Instructions"),
          card_body(
            p("Complete the demographic questions in the left panel, including your email."),
            p(
              class = "small text-muted",
              "Next, you will rate each assigned note: questions stay on the left while you read the hospital course, discharge summary, and SmartFAQs on the right (tabs)."
            )
          )
        )
      ))
    }
    if (sec == 2L) {
      if (length(ids) == 0L) {
        return(tagList(
          card(card_body(p("No notes are configured for this form in config.yml.")))
        ))
      }
      nid <- resolve_note_id(ids)
      if (is.null(nid) || !nzchar(as.character(nid))) nid <- ids[[1L]]
      note <- notes_db[[nid]] %||% list(
        hospital_course = "(Missing content for this note id in data/notes.yaml)",
        discharge_summary = "",
        faqs = ""
      )
      faq_html <- tryCatch(
        HTML(commonmark::markdown_html(as.character(note$faqs %||% ""))),
        error = function(e) pre(note$faqs %||% "")
      )
      all_done <- n > 0L && done >= n
      if (isTRUE(all_done)) {
        return(tagList(
          card(
            card_header("Thanks for completing the survey"),
            card_body(
              p("Thanks for completing the survey."),
              p("You may close this window.")
            )
          )
        ))
      }
      return(tagList(
        tags$h3(class = "mb-3", "Current note"),
        tabsetPanel(
          id = "note_tabs",
          type = "pills",
          selected = "hc",
          tabPanel(
            value = "hc",
            title = "Hospital course",
            tags$div(
              class = "note-panel",
              tags$div(class = "fw-semibold mb-2", "Brief hospital course (text)"),
              tags$div(note$hospital_course %||% "")
            )
          ),
          tabPanel(
            value = "dc",
            title = "Discharge summary",
            tags$div(
              class = "note-panel",
              tags$div(class = "fw-semibold mb-2", "Discharge summary (text)"),
              tags$div(note$discharge_summary %||% "")
            )
          ),
          tabPanel(
            value = "faq",
            title = "FAQs",
            tags$div(
              class = "note-panel note-panel-faq",
              tags$div(class = "fw-semibold mb-2", "SmartFAQs (patient-oriented Q&A)"),
              tags$div(faq_html)
            )
          )
        )
      ))
    }
    NULL
  })

  validate_demographics <- function() {
    errs <- character()
    if (is.null(input$participant_email) || !nzchar(trimws(input$participant_email))) {
      errs <- c(errs, "Email address is required.")
    }
    req_demo <- c(
      "demo_age", "demo_race", "demo_hispanic", "demo_education", "demo_healthcare_bg",
      "demo_recent_discharge", "demo_confident_forms", "demo_digital_comfort",
      "demo_caregiver", "demo_acknowledge_publication"
    )
    for (nm in req_demo) {
      v <- input[[nm]]
      if (is.null(v) || length(v) == 0L || !nzchar(as.character(v))) {
        errs <- c(errs, paste0("Please answer: ", nm))
      }
    }
    if (identical(input$demo_race, "Other")) {
      ro <- input$demo_race_other
      if (is.null(ro) || !nzchar(trimws(ro))) {
        errs <- c(errs, "Please specify your race (Other).")
      }
    }
    errs
  }

  validate_note <- function() {
    errs <- character()
    for (nm in c(
      "hc_understand", "hc_comfort", "hc_clarity", "hc_when_help",
      "dc_understand", "dc_comfort", "dc_clarity", "dc_when_help",
      "faq_understand", "faq_comfort", "faq_clarity", "faq_when_help"
    )) {
      v <- input[[nm]]
      if (is.null(v) || length(v) == 0L || is.na(v)) {
        errs <- c(errs, paste0("Missing rating: ", nm))
      }
    }
    fu <- input$faq_unanswered
    if (is.null(fu) || length(fu) == 0L || !nzchar(as.character(fu))) {
      errs <- c(errs, "Please answer the SmartFAQs follow-up question (Yes/No).")
    }
    errs
  }

  build_row <- function(note_id) {
    push_inputs_to_cache(note_id)
    c <- isolate(rv$note_cache[[note_id]]) %||% list()
    as.data.frame(
      list(
        session_id = session_id,
        submitted_at_utc = format(Sys.time(), tz = "UTC", usetz = TRUE),
        form_id = form_id(),
        note_id = note_id,
        participant_email = input$participant_email %||% NA_character_,
        participant_name = input$participant_name %||% NA_character_,
        consent_acknowledgments_listed = isTRUE(input$consent_acknowledgments_listed),
        demo_age = input$demo_age %||% NA_character_,
        demo_race = input$demo_race %||% NA_character_,
        demo_race_other = if (identical(input$demo_race, "Other")) {
          input$demo_race_other %||% NA_character_
        } else {
          NA_character_
        },
        demo_hispanic = input$demo_hispanic %||% NA_character_,
        demo_education = input$demo_education %||% NA_character_,
        demo_healthcare_bg = input$demo_healthcare_bg %||% NA_character_,
        demo_recent_discharge = input$demo_recent_discharge %||% NA_character_,
        demo_confident_forms = input$demo_confident_forms %||% NA_character_,
        demo_digital_comfort = input$demo_digital_comfort %||% NA_character_,
        demo_caregiver = input$demo_caregiver %||% NA_character_,
        demo_acknowledge_publication = input$demo_acknowledge_publication %||% NA_character_,
        hc_understand = c[["hc_understand"]] %||% NA_integer_,
        hc_comfort = c[["hc_comfort"]] %||% NA_integer_,
        hc_clarity = c[["hc_clarity"]] %||% NA_integer_,
        hc_when_help = c[["hc_when_help"]] %||% NA_integer_,
        dc_understand = c[["dc_understand"]] %||% NA_integer_,
        dc_comfort = c[["dc_comfort"]] %||% NA_integer_,
        dc_clarity = c[["dc_clarity"]] %||% NA_integer_,
        dc_when_help = c[["dc_when_help"]] %||% NA_integer_,
        faq_understand = c[["faq_understand"]] %||% NA_integer_,
        faq_comfort = c[["faq_comfort"]] %||% NA_integer_,
        faq_clarity = c[["faq_clarity"]] %||% NA_integer_,
        faq_when_help = c[["faq_when_help"]] %||% NA_integer_,
        faq_unanswered = c[["faq_unanswered"]] %||% NA_character_
      ),
      stringsAsFactors = FALSE
    )
  }

  gs4_auth_done <- FALSE
  append_google_sheet <- function(row_df) {
    if (!nzchar(google_sheet_id)) return(FALSE)
    if (!requireNamespace("googlesheets4", quietly = TRUE)) return(FALSE)
    if (!isTRUE(gs4_auth_done) && nzchar(gcp_sa_path) && file.exists(gcp_sa_path)) {
      try(googlesheets4::gs4_auth(path = gcp_sa_path), silent = TRUE)
      gs4_auth_done <<- TRUE
    }
    tryCatch(
      {
        googlesheets4::sheet_append(ss = google_sheet_id, data = row_df)
        TRUE
      },
      error = function(e) {
        message("Google Sheet append failed: ", conditionMessage(e))
        FALSE
      }
    )
  }

  persist_response <- function(row_df) {
    ok_sheet <- isTRUE(append_google_sheet(row_df))
    list(sheet = ok_sheet)
  }

  observeEvent(input$btn_submit_note, {
    output$submit_feedback <- renderUI(NULL)
    if (rv$section != 2L) {
      output$submit_feedback <- renderUI(
        div(class = "text-warning small", "Switch to the note rating section to submit.")
      )
      return(invisible(NULL))
    }
    e1 <- validate_demographics()
    e2 <- validate_note()
    errs <- c(e1, e2)
    if (length(errs) > 0L) {
      output$submit_feedback <- renderUI(
        div(
          class = "text-danger small",
          tags$strong("Please fix the following:"),
          tags$ul(lapply(errs, function(x) tags$li(x)))
        )
      )
      return(invisible(NULL))
    }
    nid <- current_note()
    if (is.null(nid)) return(invisible(NULL))
    row_df <- build_row(nid)
    persist <- persist_response(row_df)
    have_sheet <- nzchar(google_sheet_id)
    saved_ok <- !have_sheet || isTRUE(persist$sheet)
    if (saved_ok) {
      rv$pending_rows[[length(rv$pending_rows) + 1L]] <- row_df
      if (!nid %in% rv$completed_notes) {
        rv$completed_notes <- c(rv$completed_notes, nid)
      }
      msg <- if (have_sheet) {
        "Submitted successfully. Your response was added to the study Google Sheet. Thank you."
      } else {
        "Submitted successfully (saved for this browser session only — enable Google Sheets in config.yml for cloud storage). Thank you."
      }
      output$submit_feedback <- renderUI(div(class = "text-success small", msg))
    } else {
      rv$pending_rows[[length(rv$pending_rows) + 1L]] <- row_df
      output$submit_feedback <- renderUI(
        div(
          class = "text-danger small",
          "Google Sheet append failed. Check sharing with the service account and GOOGLE_APPLICATION_CREDENTIALS. Use CSV download to keep this attempt, fix the sheet, then submit again to mark the note complete."
        )
      )
    }
  })

  observeEvent(input$btn_reset_note, {
    output$submit_feedback <- renderUI(NULL)
    if (rv$section != 2L) return(invisible(NULL))
    nid <- isolate(current_note())
    if (is.null(nid)) return(invisible(NULL))
    rv$note_cache[[nid]] <- list(
      hc_understand = 5L,
      hc_comfort = 5L,
      hc_clarity = 5L,
      hc_when_help = 5L,
      dc_understand = 5L,
      dc_comfort = 5L,
      dc_clarity = 5L,
      dc_when_help = 5L,
      faq_understand = 5L,
      faq_comfort = 5L,
      faq_clarity = 5L,
      faq_when_help = 5L,
      faq_unanswered = NA_character_
    )
    apply_cache_to_inputs(nid)
    updateRadioButtons(session, "faq_unanswered", selected = character(0))
    showNotification("Ratings for this note were reset.", type = "message")
  })

  observeEvent(input$btn_prev, {
    output$submit_feedback <- renderUI(NULL)
    if (rv$section <= 0L) return(invisible(NULL))
    if (rv$section == 2L && !is.null(rv$active_note)) {
      push_inputs_to_cache(rv$active_note)
    }
    rv$section <- rv$section - 1L
  })

  observeEvent(input$btn_next, {
    output$submit_feedback <- renderUI(NULL)
    if (rv$section >= 2L) return(invisible(NULL))
    if (rv$section == 1L) {
      errs <- validate_demographics()
      if (length(errs) > 0L) {
        showNotification(paste(errs, collapse = " "), type = "warning", duration = 8)
        return(invisible(NULL))
      }
      ids1 <- isolate(note_ids())
      if (length(ids1) > 0L &&
        (is.null(rv$active_note) || !nzchar(as.character(rv$active_note)))) {
        rv$active_note <- ids1[[1L]]
      }
    }
    rv$section <- rv$section + 1L
  })

  output$download_session <- downloadHandler(
    filename = function() {
      sprintf("smartfaq_survey_%s.csv", session_id)
    },
    content = function(file) {
      rows <- isolate(rv$pending_rows)
      if (length(rows) == 0L) {
        writeLines("No submissions in this session yet.", file)
        return(invisible(NULL))
      }
      df <- do.call(rbind, rows)
      utils::write.csv(df, file, row.names = FALSE, na = "")
    }
  )

  # Ensure note selector + sliders exist before main panel reads input$note_select (avoids race crashes).
  outputOptions(output, "sidebar_body", priority = 100L)
  outputOptions(output, "main_body", priority = 0L)
}

shinyApp(ui, server)
