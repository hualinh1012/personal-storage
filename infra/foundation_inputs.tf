# Inputs owned by the retained foundation stack (infra/foundation). The app
# only reads them, so destroying the app never touches the family's files or
# the settings. Names follow the foundation's "${project}-..." conventions.

data "aws_s3_bucket" "files" {
  bucket = "${var.project}-files-${local.account_id}"
}

data "aws_ssm_parameter" "google_client_id" {
  name = "/${var.project}/google_client_id"
}

data "aws_ssm_parameter" "google_client_secret" {
  name            = "/${var.project}/google_client_secret"
  with_decryption = true
}

# StringList: comma-separated emails, e.g. you@gmail.com,mom@gmail.com
data "aws_ssm_parameter" "allowed_emails" {
  name = "/${var.project}/allowed_emails"
}

# Google Drive import (issue #1). Public values for the SPA. Deliberately not
# in the precondition below: while they're CHANGE_ME the app still deploys and
# the import says it isn't set up yet.
data "aws_ssm_parameter" "google_api_key" {
  name = "/${var.project}/google_api_key"
}

data "aws_ssm_parameter" "google_project_number" {
  name = "/${var.project}/google_project_number"
}

locals {
  allowed_emails_raw = [for e in split(",", nonsensitive(data.aws_ssm_parameter.allowed_emails.value)) : trimspace(e) if trimspace(e) != ""]

  # Lower-cased and de-duplicated; empty entries from stray commas are dropped.
  allowed_emails = distinct([for e in local.allowed_emails_raw : lower(e)])
}

# Stops the plan before anything changes if the SSM values are still the
# foundation's CHANGE_ME placeholders or otherwise unusable.
resource "terraform_data" "foundation_inputs_check" {
  lifecycle {
    precondition {
      condition     = length(local.allowed_emails) > 0
      error_message = "SSM /${var.project}/allowed_emails has no emails, so nobody could sign in."
    }

    precondition {
      condition     = alltrue([for e in local.allowed_emails_raw : can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", e))])
      error_message = "Every entry in SSM /${var.project}/allowed_emails must be an email address (replace the CHANGE_ME placeholder)."
    }

    precondition {
      condition     = !contains(["CHANGE_ME", ""], nonsensitive(data.aws_ssm_parameter.google_client_id.value))
      error_message = "SSM /${var.project}/google_client_id is still the CHANGE_ME placeholder."
    }

    precondition {
      # Only the comparison result leaves the sensitive value.
      condition     = !contains(["CHANGE_ME", ""], nonsensitive(data.aws_ssm_parameter.google_client_secret.value))
      error_message = "SSM /${var.project}/google_client_secret is still the CHANGE_ME placeholder."
    }
  }
}
