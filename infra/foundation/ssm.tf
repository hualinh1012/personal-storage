# Parameters the app deploy reads. Terraform only creates them (with a
# placeholder) and never overwrites the value: set the real values in the
# console or with `aws ssm put-parameter --overwrite`. bootstrap.sh imports
# parameters that already exist.

locals {
  placeholder = "CHANGE_ME"
}

resource "aws_ssm_parameter" "google_client_id" {
  name  = "/${var.project}/google_client_id"
  type  = "String"
  value = local.placeholder

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [value, insecure_value]
  }
}

resource "aws_ssm_parameter" "google_client_secret" {
  name  = "/${var.project}/google_client_secret"
  type  = "SecureString"
  value = local.placeholder

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [value, insecure_value]
  }
}

# Comma-separated emails, e.g. you@gmail.com,mom@gmail.com
resource "aws_ssm_parameter" "allowed_emails" {
  name  = "/${var.project}/allowed_emails"
  type  = "StringList"
  value = local.placeholder

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [value, insecure_value]
  }
}

# Google Drive import (issue #1). Both are public values that end up in the
# SPA's config.json. While they're CHANGE_ME the import says it isn't set up
# yet; they deliberately don't block the app deploy.

# Browser API key, restricted to the site's referrers and the Picker API.
resource "aws_ssm_parameter" "google_api_key" {
  name  = "/${var.project}/google_api_key"
  type  = "String"
  value = local.placeholder

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [value, insecure_value]
  }
}

# Google Cloud project number (Picker's app ID); the digits before the first
# "-" in the OAuth client ID.
resource "aws_ssm_parameter" "google_project_number" {
  name  = "/${var.project}/google_project_number"
  type  = "String"
  value = local.placeholder

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [value, insecure_value]
  }
}
