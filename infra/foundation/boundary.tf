# Permissions boundary for every IAM role the app stack creates (issue #53).
# The app pipeline may create or change a family-drive-* role only with this
# boundary attached (ci/iam/app-pipeline-policy.json), so whatever policy it
# writes, the role can never do more than this: S3 on the files bucket's
# Global/, Personal/ and Deleted/ prefixes (the authenticated role), and
# writing the trigger Lambdas' logs. It lives here, in the retained foundation
# (applied by the gated foundation pipeline), because the app pipeline must not
# be able to edit its own ceiling.
#
# A new permission for an app role must fit inside this boundary: widen it here
# first, apply the foundation, then change the role in infra/.

data "aws_iam_policy_document" "boundary" {
  statement {
    sid       = "FilesBucketList"
    actions   = ["s3:ListBucket", "s3:ListBucketVersions"]
    resources = [aws_s3_bucket.files.arn]
  }

  statement {
    sid = "FilesBucketObjects"
    actions = [
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:DeleteObjectVersion",
      "s3:AbortMultipartUpload",
      "s3:ListMultipartUploadParts",
    ]
    resources = [for p in ["Global", "Personal", "Deleted"] : "${aws_s3_bucket.files.arn}/${p}/*"]
  }

  statement {
    sid     = "TriggerLambdaLogs"
    actions = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
    resources = [
      "arn:aws:logs:${var.region}:${local.account_id}:log-group:/aws/lambda/${var.project}-*",
      "arn:aws:logs:${var.region}:${local.account_id}:log-group:/aws/lambda/${var.project}-*:*",
    ]
  }
}

resource "aws_iam_policy" "boundary" {
  name        = "${var.project}-boundary"
  description = "Permissions boundary for the roles the ${var.project} app stack creates (issue #53)."
  policy      = data.aws_iam_policy_document.boundary.json

  lifecycle {
    prevent_destroy = true
  }
}
