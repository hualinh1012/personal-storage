locals {
  account_id = data.aws_caller_identity.current.account_id
  app_url    = "https://${aws_cloudfront_distribution.web.domain_name}"

  # Origins the app trusts: the site, plus the local dev server only when
  # dev_origin is set (issue #57).
  app_origins = concat([local.app_url], var.dev_origin == "" ? [] : [var.dev_origin])
}

# Header list follows the Storage Browser for S3 CORS requirements.
resource "aws_s3_bucket_cors_configuration" "files" {
  bucket = data.aws_s3_bucket.files.id

  cors_rule {
    allowed_origins = local.app_origins
    allowed_methods = ["GET", "PUT", "POST", "DELETE", "HEAD"]
    allowed_headers = ["*"]
    expose_headers = [
      "ETag",
      "x-amz-server-side-encryption",
      "x-amz-request-id",
      "x-amz-id-2",
      "x-amz-version-id",
    ]
    max_age_seconds = 3000
  }
}
