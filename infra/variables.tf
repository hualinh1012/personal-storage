variable "project" {
  type    = string
  default = "family-drive"
}

variable "region" {
  type    = string
  default = "ap-southeast-1"
}

variable "allowed_emails" {
  description = "Comma-separated Google account emails allowed to sign in (the format of an SSM StringList), e.g. \"you@gmail.com,mom@gmail.com\"."
  type        = string

  validation {
    condition     = length([for e in split(",", var.allowed_emails) : e if trimspace(e) != ""]) > 0
    error_message = "allowed_emails must contain at least one email, or nobody can sign in."
  }
}

locals {
  # Trimmed, lower-cased, de-duplicated; empty entries from stray commas are dropped.
  allowed_emails = distinct([
    for e in split(",", var.allowed_emails) : lower(trimspace(e)) if trimspace(e) != ""
  ])
}

variable "google_client_id" {
  type      = string
  sensitive = true
}

variable "google_client_secret" {
  type      = string
  sensitive = true
}

variable "dev_origin" {
  description = "Local dev server origin, allowed by the files bucket CORS."
  type        = string
  default     = "http://localhost:5173"
}
