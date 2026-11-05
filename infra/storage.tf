locals {
  account_id = data.aws_caller_identity.current.account_id
  app_url    = "https://${aws_cloudfront_distribution.web.domain_name}"
}

# The files bucket is owned by the retained foundation stack (infra/foundation).
# This stack only reads it and attaches CORS, so destroying the app never
# touches the family's files.
data "aws_s3_bucket" "files" {
  bucket = "${var.project}-files-${local.account_id}"
}

# Header list follows the Storage Browser for S3 CORS requirements.
resource "aws_s3_bucket_cors_configuration" "files" {
  bucket = data.aws_s3_bucket.files.id

  cors_rule {
    allowed_origins = [local.app_url, var.dev_origin]
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
