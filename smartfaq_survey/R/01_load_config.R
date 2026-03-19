#' Resolve app root (Shiny sets wd to the app directory for runApp).
app_root <- function() {
  getwd()
}

load_study_config <- function(root = app_root()) {
  p <- file.path(root, "config.yml")
  if (!file.exists(p)) {
    stop("config.yml not found in ", root, call. = FALSE)
  }
  yaml::read_yaml(p)
}

load_notes <- function(root = app_root()) {
  p <- file.path(root, "data", "notes.yaml")
  if (!file.exists(p)) {
    stop("data/notes.yaml not found in ", root, call. = FALSE)
  }
  y <- yaml::read_yaml(p)
  y$notes %||% list()
}

note_input_prefix <- function(note_id) {
  gsub("[^a-zA-Z0-9]", "", note_id)
}

`%||%` <- function(x, y) {
  if (is.null(x) || (length(x) == 1L && !nzchar(as.character(x)))) y else x
}
