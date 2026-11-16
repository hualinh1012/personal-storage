variable "project" {
  type    = string
  default = "family-drive"
}

variable "region" {
  type    = string
  default = "ap-southeast-1"
}

# Local dev server origin (e.g. http://localhost:5173). Empty in production, so
# the deployed app trusts only its own origin (issue #57): set it in
# infra/terraform.tfvars (or TF_VAR_dev_origin) only while developing locally.
# When set, it is added to the Cognito callback/logout URLs and the files
# bucket's CORS origins.
variable "dev_origin" {
  description = "Local dev server origin trusted by Cognito and the files bucket CORS. Empty (the default) in production."
  type        = string
  default     = ""

  validation {
    condition     = var.dev_origin == "" || can(regex("^https?://[^/]+$", var.dev_origin))
    error_message = "dev_origin must be empty or an origin like http://localhost:5173 (scheme and host, no path or trailing slash)."
  }
}
