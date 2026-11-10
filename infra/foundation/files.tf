# The family's files. Private, encrypted, versioned (30-day recovery window).
# CORS lives in the app stack because it depends on the CloudFront URL.

resource "aws_s3_bucket" "files" {
  bucket = "${var.project}-files-${local.account_id}"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "files" {
  bucket                  = aws_s3_bucket.files.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "files" {
  bucket = aws_s3_bucket.files.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "files" {
  bucket = aws_s3_bucket.files.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "files" {
  bucket = aws_s3_bucket.files.id

  # Versioning must exist before noncurrent-version rules are applied.
  depends_on = [aws_s3_bucket_versioning.files]

  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }

  # Auto-empty the Deleted folder (issue #25). Expiring a current version in a
  # versioned bucket only adds a delete marker, so the noncurrent expiration
  # and the delete-marker rule below finish the job: "deleted from trash"
  # should mean gone, not 30 more days under the bucket-wide rule above.
  rule {
    id     = "expire-deleted-folder"
    status = "Enabled"

    filter {
      prefix = "Deleted/"
    }

    expiration {
      days = var.deleted_retention_days
    }

    noncurrent_version_expiration {
      noncurrent_days = 1
    }
  }

  # S3 won't combine expired_object_delete_marker with expiration days in one rule.
  rule {
    id     = "remove-deleted-folder-delete-markers"
    status = "Enabled"

    filter {
      prefix = "Deleted/"
    }

    expiration {
      expired_object_delete_marker = true
    }
  }

  rule {
    id     = "abort-incomplete-multipart-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}
