output "region" {
  value = var.region
}

output "files_bucket" {
  value = aws_s3_bucket.files.id
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
