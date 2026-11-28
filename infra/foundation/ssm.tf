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

# Per-person access levels (issue #15): JSON keyed by email, e.g.
# {"you@gmail.com": {"global": "write", "personal": true, "trash": true}, "mom@gmail.com": {"global": "read"}}
# String, not StringList: a StringList is comma-separated and JSON has commas.
# Allowlisted emails with no entry get read-only Global/, no personal folder and
# no Deleted folder (`trash`, issue #24).
resource "aws_ssm_parameter" "access" {
  name  = "/${var.project}/access"
  type  = "String"
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

# Where the monthly budget (budget.tf) emails its alerts. Owner-set like the
# parameters above; no address is committed. While it is CHANGE_ME the budget
# exists but has no notifications.
resource "aws_ssm_parameter" "budget_alert_email" {
  name  = "/${var.project}/budget_alert_email"
  type  = "String"
  value = local.placeholder

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [value, insecure_value]
  }
}

# The Deleted folder's retention (issue #25), published for the app stack, which
# finds foundation values by name rather than reading this stack's state; the SPA
# shows it in Deleted/. Unlike the parameters above, Terraform owns this value:
# change var.deleted_retention_days (main.tf) and re-run bootstrap.sh, never the
# parameter itself.
resource "aws_ssm_parameter" "deleted_retention_days" {
  name  = "/${var.project}/deleted_retention_days"
  type  = "String"
  value = tostring(var.deleted_retention_days)

  lifecycle {
    prevent_destroy = true
  }
}

# Custom domain for the app (ADR 0014), published for the app stack, which
# finds foundation values by name. Like deleted_retention_days, Terraform owns
# these values: set the variables in main.tf, never the parameters. An empty
# variable is written as CHANGE_ME (SSM refuses empty values), which the app
# stack reads as "not set".
resource "aws_ssm_parameter" "custom_domain" {
  name  = "/${var.project}/custom_domain"
  type  = "String"
  value = var.custom_domain == "" ? local.placeholder : var.custom_domain

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_ssm_parameter" "certificate_arn" {
  name  = "/${var.project}/certificate_arn"
  type  = "String"
  value = var.certificate_arn == "" ? local.placeholder : var.certificate_arn

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_ssm_parameter" "hosted_zone_id" {
  name  = "/${var.project}/hosted_zone_id"
  type  = "String"
  value = var.hosted_zone_id == "" ? local.placeholder : var.hosted_zone_id

  lifecycle {
    prevent_destroy = true
  }
}
