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
  name               = "${var.project}-pre-sign-up"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role" "pre_token_generation" {
  name               = "${var.project}-pre-token-generation"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
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
  retention_in_days = 14
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
      ALLOWED_EMAILS = join(",", var.allowed_emails)
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
      ALLOWED_EMAILS = join(",", var.allowed_emails)
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
    client_id        = var.google_client_id
    client_secret    = var.google_client_secret
    authorize_scopes = "openid email profile"
  }

  attribute_mapping = {
    email          = "email"
    email_verified = "email_verified"
    username       = "sub"
  }
}

resource "random_string" "domain_suffix" {
  length  = 8
  lower   = true
  upper   = false
  numeric = true
  special = false
}

resource "aws_cognito_user_pool_domain" "main" {
  domain       = "${var.project}-${random_string.domain_suffix.result}"
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

  # Must match the SPA Amplify redirect URIs (origin + "/").
  callback_urls = ["${local.app_url}/", "${var.dev_origin}/"]
  logout_urls   = ["${local.app_url}/", "${var.dev_origin}/"]

  explicit_auth_flows = ["ALLOW_REFRESH_TOKEN_AUTH"]

  depends_on = [aws_cognito_identity_provider.google]
}
