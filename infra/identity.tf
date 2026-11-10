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
    sid = "ManageDriveObjects"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:AbortMultipartUpload",
      "s3:ListMultipartUploadParts",
    ]
    resources = ["${data.aws_s3_bucket.files.arn}/Global/*"]
  }

  # Personal folders (ADR 0009): Personal/<email>/, where <email> is the
  # caller's `email` session tag (see the principal tag mapping below). "$$"
  # keeps the IAM variable literal instead of Terraform interpolation.
  statement {
    sid       = "ListOwnPersonalFolder"
    actions   = ["s3:ListBucket"]
    resources = [data.aws_s3_bucket.files.arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["Personal/$${aws:PrincipalTag/email}/", "Personal/$${aws:PrincipalTag/email}/*"]
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
  }
}

# Passes the ID token's `email` claim to STS as the `email` session tag, which
# the personal-folder statements above match on. Keyed by email rather than
# identity ID so folders survive recreating this stack.
resource "aws_cognito_identity_pool_provider_principal_tag" "email" {
  identity_pool_id       = aws_cognito_identity_pool.main.id
  identity_provider_name = aws_cognito_user_pool.main.endpoint
  use_defaults           = false
  principal_tags = {
    email = "email"
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
