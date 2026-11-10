resource "aws_cognito_identity_pool" "main" {
  identity_pool_name               = var.project
  allow_unauthenticated_identities = false

  cognito_identity_providers {
    client_id               = aws_cognito_user_pool_client.web.id
    provider_name           = aws_cognito_user_pool.main.endpoint
    server_side_token_check = true
  }
}

data "aws_iam_policy_document" "authenticated_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity", "sts:TagSession"]

    principals {
      type        = "Federated"
      identifiers = ["cognito-identity.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "cognito-identity.amazonaws.com:aud"
      values   = [aws_cognito_identity_pool.main.id]
    }

    condition {
      test     = "ForAnyValue:StringLike"
      variable = "cognito-identity.amazonaws.com:amr"
      values   = ["authenticated"]
    }
  }
}

resource "aws_iam_role" "authenticated" {
  name                 = "${var.project}-authenticated"
  assume_role_policy   = data.aws_iam_policy_document.authenticated_assume.json
  max_session_duration = 3600
}

data "aws_iam_policy_document" "authenticated" {
  # Everyone signed in can browse and download the shared drive.
  statement {
    sid       = "ListDriveFolder"
    actions   = ["s3:ListBucket"]
    resources = [data.aws_s3_bucket.files.arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["Global/", "Global/*"]
    }
  }

  statement {
    sid       = "ReadDriveObjects"
    actions   = ["s3:GetObject"]
    resources = ["${data.aws_s3_bucket.files.arn}/Global/*"]
  }

  # Per-person access levels (issue #15, ADR 0010): the pre token generation
  # trigger sets the `global_access` and `personal` claims from SSM
  # /family-drive/access, and the principal tag mapping below passes them to
  # STS as session tags. A missing tag fails these conditions: read-only.
  statement {
    sid = "WriteDriveObjects"
    actions = [
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:AbortMultipartUpload",
      "s3:ListMultipartUploadParts",
    ]
    resources = ["${data.aws_s3_bucket.files.arn}/Global/*"]

    condition {
      test     = "StringEquals"
      variable = "aws:PrincipalTag/global_access"
      values   = ["write"]
    }
  }

  # Personal folders (ADR 0009): Personal/<email>/, where <email> is the
  # caller's `email` session tag (see the principal tag mapping below), only
  # for people whose `personal` tag is "yes". "$$" keeps the IAM variable
  # literal instead of Terraform interpolation.
  statement {
    sid       = "ListOwnPersonalFolder"
    actions   = ["s3:ListBucket"]
    resources = [data.aws_s3_bucket.files.arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["Personal/$${aws:PrincipalTag/email}/", "Personal/$${aws:PrincipalTag/email}/*"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:PrincipalTag/personal"
      values   = ["yes"]
    }
  }

  statement {
    sid = "ManageOwnPersonalObjects"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:AbortMultipartUpload",
      "s3:ListMultipartUploadParts",
    ]
    resources = ["${data.aws_s3_bucket.files.arn}/Personal/$${aws:PrincipalTag/email}/*"]

    condition {
      test     = "StringEquals"
      variable = "aws:PrincipalTag/personal"
      values   = ["yes"]
    }
  }
}

# Passes ID-token claims to STS as session tags, which the statements above
# match on. `email` keys the personal folder (by email rather than identity ID,
# so folders survive recreating this stack); `global_access` and `personal` are
# the access level added by the pre token generation trigger.
resource "aws_cognito_identity_pool_provider_principal_tag" "email" {
  identity_pool_id       = aws_cognito_identity_pool.main.id
  identity_provider_name = aws_cognito_user_pool.main.endpoint
  use_defaults           = false
  principal_tags = {
    email         = "email"
    global_access = "global_access"
    personal      = "personal"
  }
}

resource "aws_iam_role_policy" "authenticated" {
  name   = "drive-access"
  role   = aws_iam_role.authenticated.id
  policy = data.aws_iam_policy_document.authenticated.json
}

resource "aws_cognito_identity_pool_roles_attachment" "main" {
  identity_pool_id = aws_cognito_identity_pool.main.id

  roles = {
    authenticated = aws_iam_role.authenticated.arn
  }
}
