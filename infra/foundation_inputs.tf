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

# Per-person access levels (issue #15): JSON keyed by email. See
# functions/allowlist/src/access.ts for the format; the preconditions below
# check the same rules.
data "aws_ssm_parameter" "access" {
  name = "/${var.project}/access"
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

# Days files stay in Deleted/ before the files bucket's lifecycle rule removes
# them (issue #25). Owned by the foundation (var.deleted_retention_days); the
# SPA only displays it.
data "aws_ssm_parameter" "deleted_retention_days" {
  name = "/${var.project}/deleted_retention_days"
}

locals {
  allowed_emails_raw = [for e in split(",", nonsensitive(data.aws_ssm_parameter.allowed_emails.value)) : trimspace(e) if trimspace(e) != ""]

  # Lower-cased and de-duplicated; empty entries from stray commas are dropped.
  allowed_emails = distinct([for e in local.allowed_emails_raw : lower(e)])

  # try() keeps the plan going to the preconditions, which explain what's wrong,
  # instead of failing here on CHANGE_ME or malformed JSON.
  access_decoded = try(jsondecode(nonsensitive(data.aws_ssm_parameter.access.value)), null)
  access_entries = try({ for k, v in local.access_decoded : k => v }, {})
  access_flags   = ["personal", "trash"]
  access_emails  = [for k in keys(local.access_entries) : lower(trimspace(k))]

  # Normalized for the pre token generation Lambda (env ACCESS_LEVELS): emails
  # lower-cased, missing flags false. Grouping (...) avoids a duplicate-key
  # error here; a precondition reports duplicates instead.
  access = {
    for email, entries in {
      for k, v in local.access_entries : lower(trimspace(k)) => {
        global   = try(tostring(v.global), "read")
        personal = try(v.personal == true, false)
        trash    = try(v.trash == true, false)
      }...
    } : email => entries[0]
  }
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
      condition     = can(keys(local.access_decoded))
      error_message = "SSM /${var.project}/access must be a JSON object keyed by email, e.g. {\"you@gmail.com\": {\"global\": \"write\", \"personal\": true}} (replace the CHANGE_ME placeholder)."
    }

    precondition {
      condition = alltrue([
        for k, v in local.access_entries :
        can(keys(v)) && contains(["read", "write"], try(tostring(v.global), "")) &&
        length(setsubtract(try(keys(v), []), concat(["global"], local.access_flags))) == 0 &&
        alltrue([for f in local.access_flags : try(v[f] == true || v[f] == false, true)])
      ])
      error_message = "Every entry in SSM /${var.project}/access must look like {\"global\": \"read\" or \"write\", \"personal\": true or false, \"trash\": true or false}. \"personal\" and \"trash\" are optional; no other keys are allowed."
    }

    precondition {
      condition     = length(distinct(local.access_emails)) == length(local.access_emails)
      error_message = "SSM /${var.project}/access lists the same email more than once (emails are compared case-insensitively)."
    }

    precondition {
      condition     = alltrue([for e in local.access_emails : contains(local.allowed_emails, e)])
      error_message = "Every email in SSM /${var.project}/access must also be in /${var.project}/allowed_emails."
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
