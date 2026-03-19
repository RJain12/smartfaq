# Redis analytics + response storage (redux)

redis_connect <- function(url) {
  if (is.null(url) || !nzchar(as.character(url))) {
    return(NULL)
  }
  tryCatch(
    {
      cfg <- redux::redis_config(url = as.character(url))
      redux::hiredis(config = cfg)
    },
    error = function(e) {
      warning("Redis unavailable: ", conditionMessage(e), call. = FALSE)
      NULL
    }
  )
}

rk <- function(prefix, ...) {
  paste(c(prefix, ...), collapse = ":")
}

#' Append JSON event (newest-first list); trim retention.
redis_log_event <- function(r, prefix, obj, max_events = 100000L) {
  if (is.null(r)) return(invisible(FALSE))
  line <- jsonlite::toJSON(obj, auto_unbox = TRUE, null = "null")
  key <- rk(prefix, "events")
  r$LPUSH(key, as.character(line))
  r$LTRIM(key, 0L, max_events - 1L)
  invisible(TRUE)
}

#' Store full response row as JSON.
redis_save_response <- function(r, prefix, row_list, max_rows = 50000L) {
  if (is.null(r)) return(invisible(FALSE))
  line <- jsonlite::toJSON(row_list, auto_unbox = TRUE, null = "null")
  key <- rk(prefix, "responses")
  r$LPUSH(key, as.character(line))
  r$LTRIM(key, 0L, max_rows - 1L)
  invisible(TRUE)
}

#' Register unique visitor + session metadata.
redis_register_session <- function(r, prefix, session_id, meta_list, ttl_sec = 7776000L) {
  if (is.null(r)) return(invisible(FALSE))
  r$SADD(rk(prefix, "visitors"), session_id)
  hkey <- rk(prefix, "session", session_id)
  meta_json <- jsonlite::toJSON(meta_list, auto_unbox = TRUE, null = "null")
  r$HSET(hkey, "meta", as.character(meta_json))
  r$HSET(hkey, "updated_at", as.character(as.integer(Sys.time())))
  r$EXPIRE(hkey, ttl_sec)
  invisible(TRUE)
}

#' Update session hash fields (strings).
redis_session_hset <- function(r, prefix, session_id, field, value, ttl_sec = 7776000L) {
  if (is.null(r)) return(invisible(FALSE))
  hkey <- rk(prefix, "session", session_id)
  r$HSET(hkey, field, as.character(value))
  r$EXPIRE(hkey, ttl_sec)
  invisible(TRUE)
}

redis_hsetnx_is_new <- function(r, hkey, field, value = "1") {
  x <- r$HSETNX(hkey, field, value)
  xi <- suppressWarnings(as.integer(x))
  if (!is.na(xi) && xi == 1L) return(TRUE)
  isTRUE(x) || identical(as.character(x), "1")
}

#' First time this session hits funnel step -> increment aggregate counter.
redis_funnel_reach <- function(r, prefix, session_id, step_name) {
  if (is.null(r)) return(invisible(FALSE))
  hkey <- rk(prefix, "session", session_id)
  fn <- paste0("funnel_", step_name)
  if (redis_hsetnx_is_new(r, hkey, fn, "1")) {
    r$HINCRBY(rk(prefix, "stats", "funnel"), step_name, 1L)
  }
  r$EXPIRE(hkey, 7776000L)
  invisible(TRUE)
}

#' First answer to a logical question key (demo:field or NOTE:field) for this session.
redis_question_first <- function(r, prefix, session_id, qkey) {
  if (is.null(r)) return(invisible(FALSE))
  hkey <- rk(prefix, "session", session_id)
  fn <- paste0("qf_", digest::digest(qkey, algo = "xxhash32"))
  if (redis_hsetnx_is_new(r, hkey, fn, "1")) {
    r$HINCRBY(rk(prefix, "stats", "q_first"), qkey, 1L)
  }
  r$EXPIRE(hkey, 7776000L)
  invisible(TRUE)
}

#' Aggregate dimension (country, device) once per session.
redis_agg_once <- function(r, prefix, session_id, agg_type, agg_value) {
  if (is.null(r) || is.null(agg_value) || !nzchar(agg_value)) return(invisible(FALSE))
  hkey <- rk(prefix, "session", session_id)
  fn <- paste0("agg_", agg_type)
  if (redis_hsetnx_is_new(r, hkey, fn, agg_value)) {
    r$HINCRBY(rk(prefix, "stats", agg_type), agg_value, 1L)
  }
  r$EXPIRE(hkey, 7776000L)
  invisible(TRUE)
}

redis_hgetall_chr <- function(r, key) {
  if (is.null(r)) return(character())
  raw <- r$HGETALL(key)
  if (length(raw) == 0L) return(character())
  nms <- raw[seq(1L, length(raw), by = 2L)]
  vals <- raw[seq(2L, length(raw), by = 2L)]
  stats::setNames(vals, nms)
}

redis_read_responses <- function(r, prefix, maxn = 2000L) {
  if (is.null(r)) return(list())
  key <- rk(prefix, "responses")
  n <- suppressWarnings(as.integer(r$LLEN(key)))
  if (is.na(n) || n < 1L) return(list())
  end <- min(n - 1L, maxn - 1L)
  lines <- r$LRANGE(key, 0L, end)
  lapply(lines, function(l) {
    tryCatch(jsonlite::fromJSON(l), error = function(e) NULL)
  })
}

redis_read_events <- function(r, prefix, maxn = 5000L) {
  if (is.null(r)) return(list())
  key <- rk(prefix, "events")
  n <- suppressWarnings(as.integer(r$LLEN(key)))
  if (is.na(n) || n < 1L) return(list())
  end <- min(n - 1L, maxn - 1L)
  lines <- r$LRANGE(key, 0L, end)
  lapply(lines, function(l) {
    tryCatch(jsonlite::fromJSON(l), error = function(e) NULL)
  })
}

redis_summary_counts <- function(r, prefix) {
  if (is.null(r)) {
    return(list(
      visitors = NA_integer_,
      funnel = character(),
      q_first = character(),
      country = character(),
      device = character(),
      timezone = character()
    ))
  }
  visitors <- suppressWarnings(as.integer(r$SCARD(rk(prefix, "visitors"))))
  list(
    visitors = visitors,
    funnel = redis_hgetall_chr(r, rk(prefix, "stats", "funnel")),
    q_first = redis_hgetall_chr(r, rk(prefix, "stats", "q_first")),
    country = redis_hgetall_chr(r, rk(prefix, "stats", "country")),
    device = redis_hgetall_chr(r, rk(prefix, "stats", "device")),
    timezone = redis_hgetall_chr(r, rk(prefix, "stats", "timezone"))
  )
}
