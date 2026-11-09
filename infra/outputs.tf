output "region" {
  value = var.region
}

output "files_bucket" {
  value = data.aws_s3_bucket.files.id
}

output "web_bucket" {
  value = aws_s3_bucket.web.id
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.web.id
}

output "app_url" {
  value = local.app_url
}

output "user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "user_pool_client_id" {
  value = aws_cognito_user_pool_client.web.id
}

output "cognito_domain" {
  value = "${aws_cognito_user_pool_domain.main.domain}.auth.${var.region}.amazoncognito.com"
}

output "identity_pool_id" {
  value = aws_cognito_identity_pool.main.id
}

# Public values for the Google Drive import (the client secret stays out).
output "google_client_id" {
  value = nonsensitive(data.aws_ssm_parameter.google_client_id.value)
}

output "google_api_key" {
  value = nonsensitive(data.aws_ssm_parameter.google_api_key.value)
}

output "google_project_number" {
  value = nonsensitive(data.aws_ssm_parameter.google_project_number.value)
}
