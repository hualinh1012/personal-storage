output "tfstate_bucket" {
  value = aws_s3_bucket.tfstate.id
}

output "files_bucket" {
  value = aws_s3_bucket.files.id
}

output "ssm_parameters" {
  value = [
    aws_ssm_parameter.google_client_id.name,
    aws_ssm_parameter.google_client_secret.name,
    aws_ssm_parameter.allowed_emails.name,
    aws_ssm_parameter.google_api_key.name,
    aws_ssm_parameter.google_project_number.name,
  ]
}
