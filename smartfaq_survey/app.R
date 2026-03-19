# SmartFAQs survey — run with shiny::runApp() from this directory
# ---------------------------------------------------------------------------

library(shiny)
library(bslib)
library(yaml)
library(htmltools)
library(commonmark)
library(ggplot2)
library(dplyr)
library(tidyr)
suppressPackageStartupMessages({
  library(redux)
  library(jsonlite)
  library(digest)
})

source("R/01_load_config.R", local = TRUE)
source("R/02_survey_copy.R", local = TRUE)
source("R/03_redis.R", local = TRUE)
source("R/04_analytics.R", local = TRUE)

cfg <- load_study_config()
notes_db <- load_notes()

if (is.null(cfg$forms) || length(cfg$forms) == 0L) {
  stop("config.yml must define non-empty 'forms'", call. = FALSE)
}

default_form <- as.character(cfg$default_form %||% names(cfg$forms)[1])

rcfg <- cfg$redis %||% list()
redis_url <- Sys.getenv("REDIS_URL", unset = as.character(rcfg$url %||% "redis://127.0.0.1:6379"))
if (!nzchar(redis_url)) redis_url <- "redis://127.0.0.1:6379"
redis_prefix <- as.character(rcfg$prefix %||% "smartfaq")
geo_lookup_enabled <- if (is.null(rcfg$geolookup)) TRUE else isTRUE(rcfg$geolookup)

r_con <- redis_connect(redis_url)

admin_password <- Sys.getenv("SMARTFAQ_ADMIN_PASSWORD", unset = "aditya")

likert_1_10 <- function(input_id, label, left, right) {
  sliderInput(
    inputId = input_id,
    label = tagList(label, tags$span(class = "text-muted small", " (1–10)")),
    min = 1L,
    max = 10L,
    value = 5L,
    step = 1L,
    ticks = TRUE,
    pre = left,
    post = right
  )
}

client_info_js <- HTML(
  "document.addEventListener('shiny:connected', function() {",
  "  var tz = (Intl.DateTimeFormat && Intl.DateTimeFormat().resolvedOptions().timeZone) || '';",
  "  Shiny.setInputValue('client_info', {",
  "    userAgent: navigator.userAgent || '',",
  "    language: navigator.language || '',",
  "    platform: navigator.platform || '',",
  "    screen: [window.screen.width, window.screen.height],",
  "    tz: tz",
  "  }, {priority: 'event'});",
  "});"
)

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

admin_panel <- tagList(
  fluidRow(
    column(
      12,
      uiOutput("admin_gate"),
      uiOutput("admin_dashboard")
    )
  )
)

ui <- fluidPage(
  theme = bs_theme(version = 5, bootswatch = "flatly", primary = "#17a2b8"),
  tags$head(
    tags$link(rel = "stylesheet", type = "text/css", href = "custom.css"),
    tags$script(client_info_js)
  ),
  div(class = "app-header", h4("SmartFAQs Survey — Patient Perspective")),
  tabsetPanel(
    id = "main_tabs",
    tabPanel("Survey", survey_panel),
    tabPanel("Admin", admin_panel)
  )
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
    syncing_note = FALSE,
    client_logged = FALSE,
    admin_ok = FALSE,
    admin_refresh = 0L
  )

  log_ev <- function(obj) {
    obj$session_id <- session_id
    obj$form_id <- isolate(form_id())
    obj$ts_utc <- format(Sys.time(), tz = "UTC", usetz = TRUE)
    redis_log_event(r_con, redis_prefix, obj)
  }

  observeEvent(input$client_info, {
    req(!isTRUE(rv$client_logged))
    rv$client_logged <- TRUE
    ci <- parse_client_info(input$client_info)
    ip <- get_shiny_client_ip(session)
    geo <- list(country = NA_character_, region = NA_character_, city = NA_character_)
    if (isTRUE(geo_lookup_enabled)) {
      geo <- geoip_lookup(ip)
    }
    dev <- classify_device(ci$user_agent)
    meta <- list(
      session_id = session_id,
      form_id = isolate(form_id()),
      user_agent = ci$user_agent,
      language = ci$language,
      platform = ci$platform,
      screen_w = ci$screen_w,
      screen_h = ci$screen_h,
      timezone = ci$timezone,
      ip = ip,
      country = geo$country,
      region = geo$region,
      city = geo$city,
      device_class = dev
    )
    redis_register_session(r_con, redis_prefix, session_id, meta)
    redis_funnel_reach(r_con, redis_prefix, session_id, "connected")
    redis_agg_once(r_con, redis_prefix, session_id, "device", dev)
    if (nzchar(geo$country %||% "")) {
      redis_agg_once(r_con, redis_prefix, session_id, "country", as.character(geo$country))
    }
    if (nzchar(ci$timezone %||% "")) {
      redis_agg_once(r_con, redis_prefix, session_id, "timezone", as.character(ci$timezone))
    }
    log_ev(list(type = "session_start", device = dev, country = geo$country))
  }, ignoreNULL = TRUE, ignoreInit = TRUE)

  observe({
    shiny::req(rv$section %in% 0L:2L)
    step <- switch(as.character(rv$section),
      "0" = "intro",
      "1" = "demographics",
      "2" = "evaluation",
      "intro"
    )
    redis_funnel_reach(r_con, redis_prefix, session_id, step)
    log_ev(list(type = "section_view", section = rv$section, step = step))
  })

  observeEvent(input$note_tabs, {
    req(rv$section == 2L)
    tab <- input$note_tabs
    nid <- isolate(current_note())
    if (is.null(tab) || is.null(nid)) return(invisible(NULL))
    log_ev(list(type = "note_tab", tab = tab, note_id = nid))
    if (identical(tab, "hc")) redis_funnel_reach(r_con, redis_prefix, session_id, "tab_hospital")
    if (identical(tab, "dc")) redis_funnel_reach(r_con, redis_prefix, session_id, "tab_discharge")
    if (identical(tab, "faq")) redis_funnel_reach(r_con, redis_prefix, session_id, "tab_faq")
  }, ignoreNULL = TRUE, ignoreInit = TRUE)

  observeEvent(input$participant_email, {
    req(nzchar(input$participant_email %||% ""))
    redis_question_first(r_con, redis_prefix, session_id, "demo:participant_email")
  }, ignoreNULL = TRUE, ignoreInit = TRUE)

  observeEvent(input$participant_name, {
    req(nzchar(trimws(input$participant_name %||% "")))
    redis_question_first(r_con, redis_prefix, session_id, "demo:participant_name")
  }, ignoreNULL = TRUE, ignoreInit = TRUE)

  observeEvent(input$consent_acknowledgments_listed, {
    redis_question_first(r_con, redis_prefix, session_id, "demo:consent_acknowledgments_listed")
  }, ignoreNULL = TRUE, ignoreInit = TRUE)

  for (nm in c(
    "demo_age", "demo_race", "demo_race_other", "demo_hispanic", "demo_education",
    "demo_healthcare_bg", "demo_recent_discharge", "demo_confident_forms",
    "demo_digital_comfort", "demo_caregiver", "demo_acknowledge_publication"
  )) {
    local({
      nmx <- nm
      observeEvent(input[[nmx]], {
        v <- input[[nmx]]
        if (is.null(v)) return(invisible(NULL))
        if (is.character(v) && !nzchar(paste(v, collapse = ""))) return(invisible(NULL))
        redis_question_first(r_con, redis_prefix, session_id, paste0("demo:", nmx))
      }, ignoreNULL = TRUE, ignoreInit = TRUE)
    })
  }

  for (nm in c(
    "hc_understand", "hc_comfort", "hc_clarity", "hc_when_help",
    "dc_understand", "dc_comfort", "dc_clarity", "dc_when_help",
    "faq_understand", "faq_comfort", "faq_clarity", "faq_when_help", "faq_unanswered"
  )) {
    local({
      nmx <- nm
      observeEvent(input[[nmx]], {
        req(rv$section == 2L)
        nid <- isolate(current_note())
        if (is.null(nid)) return(invisible(NULL))
        v <- input[[nmx]]
        if (is.null(v)) return(invisible(NULL))
        if (nmx != "faq_unanswered" && (length(v) == 0L || any(is.na(v)))) {
          return(invisible(NULL))
        }
        if (nmx == "faq_unanswered" && (length(v) == 0L || !nzchar(as.character(v)))) {
          return(invisible(NULL))
        }
        qk <- paste0(nid, ":", nmx)
        redis_question_first(r_con, redis_prefix, session_id, qk)
      }, ignoreNULL = TRUE, ignoreInit = TRUE)
    })
  }

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
    prev <- rv$note_cache[[note_id]] %||% list()
    for (nm in names(cur)) {
      if (!is.null(cur[[nm]])) prev[[nm]] <- cur[[nm]]
    }
    rv$note_cache[[note_id]] <- prev
    invisible(NULL)
  }

  apply_cache_to_inputs <- function(note_id) {
    if (is.null(note_id)) return(invisible(NULL))
    c <- rv$note_cache[[note_id]] %||% list()
    for (nm in note_field_ids()) {
      val <- c[[nm]]
      if (nm == "faq_unanswered") {
        if (!is.null(val) && !is.na(val)) {
          updateRadioButtons(session, nm, selected = val)
        }
      } else {
        if (!is.null(val) && is.numeric(val)) {
          updateSliderInput(session, nm, value = as.integer(val))
        }
      }
    }
    invisible(NULL)
  }

  observeEvent(input$note_select, ignoreInit = FALSE, {
    req(rv$section == 2L)
    if (isTRUE(rv$syncing_note)) return(invisible(NULL))
    new_id <- input$note_select
    old_id <- rv$active_note
    if (!is.null(old_id) && !identical(old_id, new_id)) {
      push_inputs_to_cache(old_id)
    }
    rv$active_note <- new_id
    session$onFlushed(function() {
      apply_cache_to_inputs(isolate(input$note_select))
    }, once = TRUE)
  })

  observeEvent(rv$section, {
    if (rv$section == 2L) {
      ids <- note_ids()
      if (length(ids) == 0L) return(NULL)
      first <- ids[[1L]]
      if (is.null(rv$active_note)) rv$active_note <- first
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
        h5("Your information"),
        textInput("participant_email", "Email address", placeholder = "you@example.com"),
        textInput("participant_name", "Name (optional)", placeholder = "Optional"),
        checkboxInput(
          "consent_acknowledgments_listed",
          "I consent to be listed in the acknowledgments of the paper.",
          value = FALSE
        ),
        hr(),
        h5("Demographics"),
        p(class = "small text-muted", demo_intro),
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
        selectInput("note_select", "Select note", choices = ids, selected = rv$active_note %||% ids[[1L]]),
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
        tags$div(
          class = "survey-q-groups",
          h5(class = "text-primary", "Hospital course"),
          likert_1_10(
            "hc_understand",
            tagList("How understandable was this hospital course?", tags$span(class = "text-danger", "*")),
            "Did not understand at all",
            "Completely understand"
          ),
          likert_1_10(
            "hc_comfort",
            tagList(
              "How comfortable would you be in managing your own care based on this hospital course?",
              tags$span(class = "text-danger", "*")
            ),
            "Completely uncomfortable",
            "Completely comfortable"
          ),
          likert_1_10(
            "hc_clarity",
            tagList("How much clarity did you get on next steps of care?", tags$span(class = "text-danger", "*")),
            "Not clear at all",
            "Very clear"
          ),
          likert_1_10(
            "hc_when_help",
            tagList(
              "How much do you understand of when to seek additional help if your health gets worse?",
              tags$span(class = "text-danger", "*")
            ),
            "Did not understand at all",
            "Completely understand"
          ),
          hr(),
          h5(class = "text-primary", "Discharge summary"),
          likert_1_10(
            "dc_understand",
            tagList("How understandable was this discharge summary?", tags$span(class = "text-danger", "*")),
            "Did not understand at all",
            "Completely understand"
          ),
          likert_1_10(
            "dc_comfort",
            tagList(
              "How comfortable would you be in managing your own care based on this discharge summary?",
              tags$span(class = "text-danger", "*")
            ),
            "Completely uncomfortable",
            "Completely comfortable"
          ),
          likert_1_10(
            "dc_clarity",
            tagList("How much clarity did you get on next steps of care?", tags$span(class = "text-danger", "*")),
            "Not clear at all",
            "Very clear"
          ),
          likert_1_10(
            "dc_when_help",
            tagList(
              "How much do you understand of when to seek additional help if your health gets worse?",
              tags$span(class = "text-danger", "*")
            ),
            "Did not understand at all",
            "Completely understand"
          ),
          hr(),
          h5(class = "text-primary", "SmartFAQs"),
          likert_1_10(
            "faq_understand",
            tagList("How understandable were these frequently asked questions?", tags$span(class = "text-danger", "*")),
            "Did not understand at all",
            "Completely understand"
          ),
          likert_1_10(
            "faq_comfort",
            tagList(
              "How comfortable would you be in managing your own care based on these frequently asked questions?",
              tags$span(class = "text-danger", "*")
            ),
            "Completely uncomfortable",
            "Completely comfortable"
          ),
          likert_1_10(
            "faq_clarity",
            tagList("How much clarity did you get on next steps of care?", tags$span(class = "text-danger", "*")),
            "Not clear at all",
            "Very clear"
          ),
          likert_1_10(
            "faq_when_help",
            tagList(
              "How much do you understand of when to seek additional help if your health gets worse?",
              tags$span(class = "text-danger", "*")
            ),
            "Did not understand at all",
            "Completely understand"
          ),
          radioButtons(
            "faq_unanswered",
            label = tagList(
              "Are you left with any unanswered questions that require further clarification from your doctor?",
              tags$span(class = "text-danger", "*")
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
    req(rv$section == 2L)
    id <- input$note_select
    if (is.null(id) || !nzchar(id)) id <- rv$active_note
    id
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
            p("Please complete the demographic questions in the left panel."),
            p(
              class = "small text-muted",
              "Fields marked with * are required before you can move on to rating the notes."
            )
          )
        )
      ))
    }
    if (sec == 2L) {
      nid <- current_note()
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
        card(
          card_body(
            layout_columns(
              col_widths = c(12),
              tags$div(
                class = "d-flex align-items-center gap-2 mb-2",
                tags$span("\U0001F4C4", `aria-hidden` = "true"),
                tags$strong("Current note ", nid)
              )
            )
          )
        ),
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
      "demo_age", "demo_race", "demo_hispanic", "demo_healthcare_bg",
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
    c <- rv$note_cache[[note_id]] %||% list()
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

  persist_response <- function(row_df) {
    lst <- as.list(row_df[1, , drop = FALSE])
    ok <- redis_save_response(r_con, redis_prefix, lst)
    if (!isTRUE(ok)) {
      message("Redis unavailable; response not stored remotely:\n", paste(capture.output(print(row_df)), collapse = "\n"))
      return(FALSE)
    }
    TRUE
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
      log_ev(list(
        type = "submit_validation_fail",
        note_id = isolate(current_note()),
        n_errors = length(errs)
      ))
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
    rv$pending_rows[[length(rv$pending_rows) + 1L]] <- row_df
    ok <- persist_response(row_df)
    log_ev(list(type = "submit_success", note_id = nid))
    redis_funnel_reach(r_con, redis_prefix, session_id, "first_submit")
    if (!is.null(r_con)) {
      r_con$HINCRBY(rk(redis_prefix, "stats", "submissions_by_note"), nid, 1L)
    }
    if (!isTRUE(ok)) {
      output$submit_feedback <- renderUI(
        div(
          class = "text-warning small",
          "Could not reach Redis; response kept in this session only. Use CSV download or fix REDIS_URL."
        )
      )
    } else {
      output$submit_feedback <- renderUI(
        div(class = "text-success small", "Submitted successfully. Thank you.")
      )
    }
    if (!nid %in% rv$completed_notes) {
      rv$completed_notes <- c(rv$completed_notes, nid)
    }
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
    }
    rv$section <- rv$section + 1L
  })

  output$download_session <- downloadHandler(
    filename = function() {
      sprintf("smartfaq_survey_%s.csv", session_id)
    },
    content = function(file) {
      rows <- rv$pending_rows
      if (length(rows) == 0L) {
        writeLines("No submissions in this session yet.", file)
        return(invisible(NULL))
      }
      df <- do.call(rbind, rows)
      utils::write.csv(df, file, row.names = FALSE, na = "")
    }
  )

  # --- Admin ---
  output$admin_gate <- renderUI({
    if (isTRUE(rv$admin_ok)) return(NULL)
    card(
      card_header("Administrator sign-in"),
      card_body(
        p(class = "small text-muted", "Analytics are server-side; do not expose this password in production."),
        passwordInput("admin_pw", "Password", value = ""),
        actionButton("admin_login", "Unlock dashboard", class = "btn btn-primary")
      )
    )
  })

  observeEvent(input$admin_login, {
    if (identical(trimws(input$admin_pw %||% ""), admin_password)) {
      rv$admin_ok <- TRUE
      rv$admin_refresh <- rv$admin_refresh + 1L
      showNotification("Admin dashboard unlocked.", type = "message")
    } else {
      showNotification("Incorrect password.", type = "error")
    }
  })

  admin_snapshot <- reactive({
    req(isTRUE(rv$admin_ok))
    input$admin_refresh
    rv$admin_refresh
    summ <- redis_summary_counts(r_con, redis_prefix)
    ev <- redis_read_events(r_con, redis_prefix, maxn = 8000L)
    rs <- redis_read_responses(r_con, redis_prefix, maxn = 2000L)
    df <- responses_to_df(rs)
    submits_note <- redis_hgetall_chr(r_con, rk(redis_prefix, "stats", "submissions_by_note"))
    list(summary = summ, events = ev, responses = df, submits_note = submits_note)
  })

  output$admin_dashboard <- renderUI({
    if (!isTRUE(rv$admin_ok)) {
      return(NULL)
    }
    tagList(
      card(
        card_body(
          fluidRow(
            column(4, actionButton("admin_refresh", "Refresh data", class = "btn btn-outline-secondary")),
            column(8, p(class = "small text-muted mb-0", "Data reads from Redis at refresh. Large studies may take a moment."))
          )
        )
      ),
      layout_columns(
        col_widths = c(6, 6),
        card(card_header("Visitor funnel"), card_body(plotOutput("plot_funnel", height = "280px"))),
        card(card_header("Device class"), card_body(plotOutput("plot_device", height = "280px")))
      ),
      layout_columns(
        col_widths = c(6, 6),
        card(card_header("Country (IP-based, coarse)"), card_body(plotOutput("plot_country", height = "280px"))),
        card(card_header("Submissions by note"), card_body(plotOutput("plot_submits_note", height = "280px")))
      ),
      card(
        card_header("First interaction: demographics (unique sessions)"),
        card_body(
          p(class = "small", "Compared to visitors who connected; later bars show cumulative drop-off if order is followed."),
          plotOutput("plot_demo_dropoff", height = "320px")
        )
      ),
      card(
        card_header("Evaluation items: first interaction (top 30, per note × item)"),
        card_body(
          p(
            class = "small text-muted",
            "Counts unique sessions that adjusted each slider/radio at least once for that note."
          ),
          plotOutput("plot_eval_touch", height = "340px")
        )
      ),
      card(
        card_header("Likert means by note (1–10 scales)"),
        card_body(plotOutput("plot_likert_means", height = "360px"))
      ),
      card(
        card_header("Recent responses (latest 40 rows)"),
        card_body(tableOutput("tbl_recent"))
      )
    )
  })

  output$plot_funnel <- renderPlot({
    req(isTRUE(rv$admin_ok), cancelOutput = TRUE)
    snap <- admin_snapshot()
    f <- snap$summary$funnel
    if (length(f) == 0L) {
      plot.new()
      text(0.5, 0.5, "No funnel data yet")
      return(invisible(NULL))
    }
    ord <- c(
      "connected", "intro", "demographics", "evaluation",
      "tab_hospital", "tab_discharge", "tab_faq", "first_submit"
    )
    d <- hash_to_df(f, "n")
    d <- d[d$key %in% ord, , drop = FALSE]
    d$key <- factor(d$key, levels = ord[ord %in% d$key])
    d <- d[order(d$key), , drop = FALSE]
    ggplot(d, aes(x = key, y = value)) +
      geom_col(fill = "#17a2b8") +
      theme_minimal() +
      theme(axis.text.x = element_text(angle = 35, hjust = 1)) +
      labs(x = NULL, y = "Unique sessions", title = "Engagement funnel")
  })

  output$plot_device <- renderPlot({
    req(isTRUE(rv$admin_ok), cancelOutput = TRUE)
    d <- hash_to_df(admin_snapshot()$summary$device, "n")
    if (nrow(d) == 0L) {
      plot.new()
      text(0.5, 0.5, "No device data")
      return(invisible(NULL))
    }
    ggplot(d, aes(x = reorder(key, value), y = value)) +
      geom_col(fill = "#6c757d") +
      coord_flip() +
      theme_minimal() +
      labs(x = NULL, y = "Sessions", title = "Device (UA heuristic)")
  })

  output$plot_country <- renderPlot({
    req(isTRUE(rv$admin_ok), cancelOutput = TRUE)
    d <- hash_to_df(admin_snapshot()$summary$country, "n")
    if (nrow(d) == 0L) {
      plot.new()
      text(0.5, 0.5, "No geo data (local IP or lookup off)")
      return(invisible(NULL))
    }
    d <- d[order(-d$value), , drop = FALSE][seq_len(min(15L, nrow(d))), , drop = FALSE]
    ggplot(d, aes(x = reorder(key, value), y = value)) +
      geom_col(fill = "#2c3e50") +
      coord_flip() +
      theme_minimal() +
      labs(x = NULL, y = "Sessions", title = "Top countries")
  })

  output$plot_submits_note <- renderPlot({
    req(isTRUE(rv$admin_ok), cancelOutput = TRUE)
    d <- hash_to_df(admin_snapshot()$submits_note, "n")
    if (nrow(d) == 0L) {
      plot.new()
      text(0.5, 0.5, "No submissions yet")
      return(invisible(NULL))
    }
    ggplot(d, aes(x = reorder(key, value), y = value)) +
      geom_col(fill = "#17a2b8") +
      coord_flip() +
      theme_minimal() +
      labs(x = NULL, y = "Count", title = "Successful submits")
  })

  output$plot_demo_dropoff <- renderPlot({
    req(isTRUE(rv$admin_ok), cancelOutput = TRUE)
    snap <- admin_snapshot()
    visitors <- snap$summary$visitors
    if (is.na(visitors) || visitors < 1L) visitors <- 1L
    qf <- snap$summary$q_first
    keys <- demo_question_keys_ordered()
    counts <- vapply(keys, function(k) {
      x <- unname(qf[k])
      if (length(x) == 0L || is.na(x[1L])) 0 else suppressWarnings(as.numeric(x[1L]))
    }, numeric(1))
    d <- data.frame(
      step = keys,
      reached = as.numeric(counts),
      stringsAsFactors = FALSE
    )
    d$pct_of_visitors <- round(100 * d$reached / visitors, 1)
    ggplot(d, aes(x = reorder(step, seq_len(nrow(d))), y = reached)) +
      geom_col(fill = "#e8a0a8") +
      coord_flip() +
      theme_minimal() +
      labs(x = NULL, y = "Unique sessions (first interaction)", title = NULL)
  })

  output$plot_eval_touch <- renderPlot({
    req(isTRUE(rv$admin_ok), cancelOutput = TRUE)
    qf <- admin_snapshot()$summary$q_first
    if (length(qf) == 0L) {
      plot.new()
      text(0.5, 0.5, "No evaluation touch data yet")
      return(invisible(NULL))
    }
    nm <- names(qf)
    keep <- nm[grepl(":", nm, fixed = TRUE) & !startsWith(nm, "demo:")]
    if (length(keep) == 0L) {
      plot.new()
      text(0.5, 0.5, "No per-note question keys yet")
      return(invisible(NULL))
    }
    d <- data.frame(
      key = keep,
      value = suppressWarnings(as.numeric(unname(qf[keep]))),
      stringsAsFactors = FALSE
    )
    d <- d[!is.na(d$value) & d$value > 0, , drop = FALSE]
    d <- d[order(-d$value), , drop = FALSE]
    d <- head(d, 30L)
    ggplot(d, aes(x = reorder(key, value), y = value)) +
      geom_col(fill = "#6f42c1", alpha = 0.85) +
      coord_flip() +
      theme_minimal() +
      labs(x = NULL, y = "Sessions (first touch)", title = NULL)
  })

  output$plot_likert_means <- renderPlot({
    req(isTRUE(rv$admin_ok), cancelOutput = TRUE)
    df <- admin_snapshot()$responses
    lik_cols <- intersect(
      names(df),
      c(
        "hc_understand", "hc_comfort", "hc_clarity", "hc_when_help",
        "dc_understand", "dc_comfort", "dc_clarity", "dc_when_help",
        "faq_understand", "faq_comfort", "faq_clarity", "faq_when_help"
      )
    )
    if (nrow(df) == 0L || length(lik_cols) == 0L) {
      plot.new()
      text(0.5, 0.5, "No response rows yet")
      return(invisible(NULL))
    }
    df2 <- df %>% mutate(note_id = as.character(note_id))
    long <- df2 %>%
      select(note_id, dplyr::all_of(lik_cols)) %>%
      pivot_longer(-note_id, names_to = "item", values_to = "value") %>%
      mutate(value = suppressWarnings(as.numeric(value))) %>%
      filter(!is.na(value))
    if (nrow(long) == 0L) {
      plot.new()
      text(0.5, 0.5, "No numeric ratings")
      return(invisible(NULL))
    }
    agg <- long %>%
      group_by(note_id, item) %>%
      summarise(mean_score = mean(value), n = dplyr::n(), .groups = "drop")
    ggplot(agg, aes(x = item, y = mean_score, fill = note_id)) +
      geom_col(position = position_dodge(width = 0.8), width = 0.75) +
      theme_minimal() +
      theme(axis.text.x = element_text(angle = 45, hjust = 1)) +
      labs(x = NULL, y = "Mean (1–10)", title = "By note and item") +
      ylim(0, 10)
  })

  output$tbl_recent <- renderTable(
    {
      req(isTRUE(rv$admin_ok), cancelOutput = TRUE)
      df <- admin_snapshot()$responses
      if (nrow(df) == 0L) {
        return(data.frame(Message = "No rows"))
      }
      cols <- intersect(
        names(df),
        c(
          "submitted_at_utc", "session_id", "form_id", "note_id",
          "participant_email", "demo_age", "hc_understand", "faq_unanswered"
        )
      )
      head(df[, cols, drop = FALSE], 40L)
    },
    width = "100%"
  )
}

shinyApp(ui, server)
