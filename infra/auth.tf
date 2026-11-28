# --- Allowlist trigger Lambdas -------------------------------------------

data "archive_file" "pre_sign_up" {
  type        = "zip"
  source_file = "${path.module}/../functions/allowlist/dist/preSignUp.js"
  output_path = "${path.module}/build/preSignUp.zip"
}

data "archive_file" "pre_token_generation" {
  type        = "zip"
  source_file = "${path.module}/../functions/allowlist/dist/preTokenGeneration.js"
  output_path = "${path.module}/build/preTokenGeneration.zip"
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "pre_sign_up" {
  name                 = "${var.project}-pre-sign-up"
  assume_role_policy   = data.aws_iam_policy_document.lambda_assume.json
  permissions_boundary = local.permissions_boundary
}

resource "aws_iam_role" "pre_token_generation" {
  name                 = "${var.project}-pre-token-generation"
  assume_role_policy   = data.aws_iam_policy_document.lambda_assume.json
  permissions_boundary = local.permissions_boundary
}

resource "aws_iam_role_policy_attachment" "pre_sign_up_logs" {
  role       = aws_iam_role.pre_sign_up.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "pre_token_generation_logs" {
  role       = aws_iam_role.pre_token_generation.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_cloudwatch_log_group" "pre_sign_up" {
  name              = "/aws/lambda/${var.project}-pre-sign-up"
  retention_in_days = 14
}

resource "aws_cloudwatch_log_group" "pre_token_generation" {
  name              = "/aws/lambda/${var.project}-pre-token-generation"
  retention_in_days = 90
}

resource "aws_lambda_function" "pre_sign_up" {
  function_name    = "${var.project}-pre-sign-up"
  role             = aws_iam_role.pre_sign_up.arn
  runtime          = "nodejs22.x"
  handler          = "preSignUp.handler"
  filename         = data.archive_file.pre_sign_up.output_path
  source_code_hash = data.archive_file.pre_sign_up.output_base64sha256

  environment {
    variables = {
      ALLOWED_EMAILS = join(",", local.allowed_emails)
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.pre_sign_up,
    aws_iam_role_policy_attachment.pre_sign_up_logs,
  ]
}

resource "aws_lambda_function" "pre_token_generation" {
  function_name    = "${var.project}-pre-token-generation"
  role             = aws_iam_role.pre_token_generation.arn
  runtime          = "nodejs22.x"
  handler          = "preTokenGeneration.handler"
  filename         = data.archive_file.pre_token_generation.output_path
  source_code_hash = data.archive_file.pre_token_generation.output_base64sha256

  environment {
    variables = {
      ALLOWED_EMAILS = join(",", local.allowed_emails)
      # SSM /family-drive/access as written, after the plan's preconditions
      # (foundation_inputs.tf); the Lambda's parser normalizes it.
      ACCESS_LEVELS = local.access_levels_json
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.pre_token_generation,
    aws_iam_role_policy_attachment.pre_token_generation_logs,
  ]
}

resource "aws_lambda_permission" "pre_sign_up" {
  statement_id  = "AllowCognitoInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.pre_sign_up.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.main.arn
}

resource "aws_lambda_permission" "pre_token_generation" {
  statement_id  = "AllowCognitoInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.pre_token_generation.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.main.arn
}

# --- User pool ------------------------------------------------------------

resource "aws_cognito_user_pool" "main" {
  name                = var.project
  username_attributes = ["email"]

  # Native self sign-up is off; Google federated users are gated by the
  # pre sign-up trigger.
  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  lambda_config {
    pre_sign_up = aws_lambda_function.pre_sign_up.arn

    # V1_0 semantics, matching the plain pre-token-generation event.
    pre_token_generation_config {
      lambda_arn     = aws_lambda_function.pre_token_generation.arn
      lambda_version = "V1_0"
    }
  }
}

resource "aws_cognito_identity_provider" "google" {
  user_pool_id  = aws_cognito_user_pool.main.id
  provider_name = "Google"
  provider_type = "Google"

  provider_details = {
    client_id        = data.aws_ssm_parameter.google_client_id.value
    client_secret    = data.aws_ssm_parameter.google_client_secret.value
    authorize_scopes = "openid email profile"
  }

  attribute_mapping = {
    email          = "email"
    email_verified = "email_verified"
    username       = "sub"
  }
}

# Deterministic prefix (unique per account) so the Google OAuth redirect URI
# https://<domain>.auth.<region>.amazoncognito.com/oauth2/idpresponse stays the
# same when the app stack is destroyed and recreated.
resource "aws_cognito_user_pool_domain" "main" {
  domain       = "${var.project}-${local.account_id}"
  user_pool_id = aws_cognito_user_pool.main.id
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "${var.project}-web"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret = false

  supported_identity_providers         = ["Google"]
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["openid", "email", "profile"]

  # Must match the SPA Amplify redirect URIs (origin + "/"). The dev origin is
  # included only when dev_origin is set (issue #57).
  callback_urls = [for o in local.app_origins : "${o}/"]
  logout_urls   = [for o in local.app_origins : "${o}/"]

  explicit_auth_flows = ["ALLOW_REFRESH_TOKEN_AUTH"]

  # Explicit instead of the default (every attribute; issue #58). Write: only
  # `email`, the one writable attribute the Google mapping sets (Cognito needs
  # write access to mapped attributes). `email_verified` can't be listed:
  # Cognito rejects it as a write attribute ("Invalid write attributes") and
  # sets it from the mapping regardless. Read: only what the ID token needs;
  # `email` keys personal folders. The access claims come from the pre token
  # generation trigger, not from attributes.
  write_attributes = ["email"]
  read_attributes  = ["email", "email_verified"]

  # Bounds how long a removed person keeps access: an ID token lives 1 hour and
  # the Identity Pool credentials obtained with it up to 1 more hour. Every
  # refresh re-runs the allowlist check (pre token generation trigger).
  id_token_validity      = 60
  access_token_validity  = 60
  refresh_token_validity = 30
  token_validity_units {
    id_token      = "minutes"
    access_token  = "minutes"
    refresh_token = "days"
  }

  depends_on = [aws_cognito_identity_provider.google]
}
