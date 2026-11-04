variable "project" {
  type    = string
  default = "family-drive"
}

variable "region" {
  type    = string
  default = "ap-southeast-1"
}

variable "allowed_emails" {
  description = "Google account emails allowed to sign in. Empty denies everyone."
  type        = list(string)
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
