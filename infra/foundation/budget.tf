# Monthly cost budget (issue #98, target 1.0.0 gap G1): emails the owner at 100%
# of actual and of forecast spend. The brief caps the running cost at about $2 a
# month (measure M1).
#
# The address is read live from SSM through a data source, not from the managed
# parameter's `value`: that one has ignore_changes, so it stays CHANGE_ME in state.
# depends_on makes the first apply create the parameter before reading it.
data "aws_ssm_parameter" "budget_alert_email" {
  name       = aws_ssm_parameter.budget_alert_email.name
  depends_on = [aws_ssm_parameter.budget_alert_email]
}

locals {
  budget_alert_email = data.aws_ssm_parameter.budget_alert_email.value

  # CHANGE_ME is not an email: until the owner sets the address (and the
  # foundation runs again) the budget exists and tracks spend, but emails nobody.
  # This keeps the first foundation apply from failing on the placeholder.
  budget_alert_email_set = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", local.budget_alert_email))
}

resource "aws_budgets_budget" "monthly" {
  name         = "${var.project}-monthly"
  budget_type  = "COST"
  time_unit    = "MONTHLY"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"

  dynamic "notification" {
    for_each = local.budget_alert_email_set ? ["ACTUAL", "FORECASTED"] : []

    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = 100
      threshold_type             = "PERCENTAGE"
      notification_type          = notification.value
      subscriber_email_addresses = [local.budget_alert_email]
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}
