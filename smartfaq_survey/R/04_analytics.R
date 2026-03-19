# Client parsing, geolocation, admin summaries

classify_device <- function(user_agent) {
  if (is.null(user_agent) || !nzchar(user_agent)) return("unknown")
  u <- tolower(user_agent)
  if (grepl("ipad|tablet|kindle|playbook", u)) return("tablet")
  if (grepl("mobile|iphone|ipod|android|blackberry|opera mini|iemobile", u)) {
    return("mobile")
  }
  if (grepl("bot|crawler|spider|prerender|slurp", u, perl = TRUE)) return("bot")
  "desktop"
}

get_shiny_client_ip <- function(session) {
  req <- session$request
  if (is.null(req)) return(NA_character_)
  xf <- req$HTTP_X_FORWARDED_FOR %||% ""
  if (nzchar(xf)) {
    trimws(strsplit(xf, ",")[[1L]][1L])
  } else {
    as.character(req$REMOTE_ADDR %||% NA_character_)
  }
}

#' Free ip-api.com lookup (HTTPS). Respect rate limits in production.
geoip_lookup <- function(ip, timeout = 2) {
  if (is.null(ip) || length(ip) != 1L || is.na(ip) || !nzchar(ip)) {
    return(list(country = NA_character_, region = NA_character_, city = NA_character_))
  }
  if (grepl("^(127\\.|10\\.|172\\.(1[6-9]|2[0-9]|3[0-1])\\.|192\\.168\\.|::1|localhost)", ip, ignore.case = TRUE)) {
    return(list(country = "local", region = NA_character_, city = NA_character_))
  }
  if (!requireNamespace("httr", quietly = TRUE)) {
    return(list(country = NA_character_, region = NA_character_, city = NA_character_))
  }
  url <- paste0("http://ip-api.com/json/", utils::URLencode(ip, reserved = TRUE), "?fields=status,country,regionName,city")
  tryCatch(
    {
      resp <- httr::GET(url, httr::timeout(timeout))
      if (httr::status_code(resp) != 200L) {
        return(list(country = NA_character_, region = NA_character_, city = NA_character_))
      }
      txt <- httr::content(resp, as = "text", encoding = "UTF-8")
      j <- jsonlite::fromJSON(txt)
      if (!identical(j$status, "success")) {
        return(list(country = NA_character_, region = NA_character_, city = NA_character_))
      }
      list(
        country = j$country %||% NA_character_,
        region = j$regionName %||% NA_character_,
        city = j$city %||% NA_character_
      )
    },
    error = function(e) {
      list(country = NA_character_, region = NA_character_, city = NA_character_)
    }
  )
}

parse_client_info <- function(x) {
  if (is.null(x) || length(x) == 0L) {
    return(list(
      user_agent = NA_character_,
      language = NA_character_,
      platform = NA_character_,
      screen_w = NA_integer_,
      screen_h = NA_integer_,
      timezone = NA_character_
    ))
  }
  if (is.character(x)) {
    x <- tryCatch(jsonlite::fromJSON(x), error = function(e) NULL)
  }
  if (is.null(x)) {
    return(list(
      user_agent = NA_character_,
      language = NA_character_,
      platform = NA_character_,
      screen_w = NA_integer_,
      screen_h = NA_integer_,
      timezone = NA_character_
    ))
  }
  scr <- x$screen
  sw <- NA_integer_
  sh <- NA_integer_
  if (is.numeric(scr) && length(scr) >= 2L) {
    sw <- as.integer(scr[[1L]])
    sh <- as.integer(scr[[2L]])
  }
  list(
    user_agent = as.character(x$userAgent %||% NA_character_),
    language = as.character(x$language %||% NA_character_),
    platform = as.character(x$platform %||% NA_character_),
    screen_w = sw,
    screen_h = sh,
    timezone = as.character(x$tz %||% NA_character_)
  )
}

demo_question_keys_ordered <- function() {
  c(
    "demo:participant_email",
    "demo:participant_name",
    "demo:consent_acknowledgments_listed",
    "demo:demo_age",
    "demo:demo_race",
    "demo:demo_race_other",
    "demo:demo_hispanic",
    "demo:demo_education",
    "demo:demo_healthcare_bg",
    "demo:demo_recent_discharge",
    "demo:demo_confident_forms",
    "demo:demo_digital_comfort",
    "demo:demo_caregiver",
    "demo:demo_acknowledge_publication"
  )
}

eval_question_keys_ordered <- function() {
  c(
    "eval:hc_understand",
    "eval:hc_comfort",
    "eval:hc_clarity",
    "eval:hc_when_help",
    "eval:dc_understand",
    "eval:dc_comfort",
    "eval:dc_clarity",
    "eval:dc_when_help",
    "eval:faq_understand",
    "eval:faq_comfort",
    "eval:faq_clarity",
    "eval:faq_when_help",
    "eval:faq_unanswered"
  )
}

responses_to_df <- function(lst) {
  lst <- Filter(Negate(is.null), lst)
  if (length(lst) == 0L) {
    return(data.frame())
  }
  do.call(rbind, lapply(lst, as.data.frame, stringsAsFactors = FALSE))
}

hash_to_df <- function(h, name = "value") {
  if (length(h) == 0L) {
    return(data.frame(key = character(), value = numeric()))
  }
  data.frame(
    key = names(h),
    value = as.numeric(h),
    stringsAsFactors = FALSE
  )
}
