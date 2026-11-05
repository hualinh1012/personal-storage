# Refuse any request to the foundation buckets that isn't over HTTPS.

data "aws_iam_policy_document" "tls_only" {
  for_each = {
    tfstate = aws_s3_bucket.tfstate.arn
    files   = aws_s3_bucket.files.arn
  }

  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [each.value, "${each.value}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  policy = data.aws_iam_policy_document.tls_only["tfstate"].json

  depends_on = [aws_s3_bucket_public_access_block.tfstate]
}

resource "aws_s3_bucket_policy" "files" {
  bucket = aws_s3_bucket.files.id
  policy = data.aws_iam_policy_document.tls_only["files"].json

  depends_on = [aws_s3_bucket_public_access_block.files]
}
