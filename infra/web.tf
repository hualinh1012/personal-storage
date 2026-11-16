resource "aws_s3_bucket" "web" {
  bucket = "${var.project}-web-${local.account_id}"

  # Only holds the built SPA, so the app stack can be destroyed freely.
  force_destroy = true
}

# ACLs off: the bucket owner owns every object (issue #58). The default for new
# buckets, made explicit.
resource "aws_s3_bucket_ownership_controls" "web" {
  bucket = aws_s3_bucket.web.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "web" {
  bucket                  = aws_s3_bucket.web.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "web" {
  bucket = aws_s3_bucket.web.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_cloudfront_origin_access_control" "web" {
  name                              = "${var.project}-web"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Content Security Policy (issue #55). Amplify keeps the Cognito tokens in
# localStorage, so this limits what an injected script could load or where it
# could send them. Hosts are exact where they're known: the files bucket, this
# region's Cognito endpoints and hosted domain, and the Google hosts the Drive
# import needs (CLAUDE.md lists them). 'unsafe-inline' is for styles only
# (Google sign-in and Picker inject them); scripts are 'self' plus Google.
locals {
  files_bucket_origin  = "https://${data.aws_s3_bucket.files.bucket_regional_domain_name}"
  cognito_login_origin = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.region}.amazoncognito.com"

  csp = join("; ", [
    "default-src 'self'",
    "script-src 'self' https://accounts.google.com https://apis.google.com",
    "style-src 'self' 'unsafe-inline' https://accounts.google.com",
    join(" ", [
      "connect-src 'self'",
      local.files_bucket_origin,
      "https://cognito-idp.${var.region}.amazonaws.com",
      "https://cognito-identity.${var.region}.amazonaws.com",
      local.cognito_login_origin,
      "https://www.googleapis.com https://accounts.google.com",
    ]),
    "frame-src https://docs.google.com https://accounts.google.com",
    "img-src 'self' data: blob: ${local.files_bucket_origin}",
    "media-src 'self' blob: ${local.files_bucket_origin}",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ])

  # Features the app never uses. Fullscreen stays allowed (videos).
  permissions_policy = join(", ", [
    "accelerometer=()",
    "browsing-topics=()",
    "camera=()",
    "display-capture=()",
    "geolocation=()",
    "gyroscope=()",
    "hid=()",
    "magnetometer=()",
    "microphone=()",
    "midi=()",
    "payment=()",
    "serial=()",
    "usb=()",
  ])
}

# Replaces Managed-SecurityHeadersPolicy with the same headers (HSTS,
# X-Frame-Options SAMEORIGIN, nosniff, strict-origin-when-cross-origin,
# X-XSS-Protection) plus the CSP and Permissions-Policy (issue #55). While
# var.csp_enforce is false the CSP is sent as Content-Security-Policy-Report-Only:
# browsers log violations in the console but block nothing.
resource "aws_cloudfront_response_headers_policy" "security" {
  name    = "${var.project}-security-headers"
  comment = "${var.project}: security headers, CSP and Permissions-Policy"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000
      override                   = true
    }

    content_type_options {
      override = true
    }

    frame_options {
      frame_option = "SAMEORIGIN"
      override     = true
    }

    xss_protection {
      protection = true
      mode_block = true
      override   = true
    }

    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }

    dynamic "content_security_policy" {
      for_each = var.csp_enforce ? [local.csp] : []

      content {
        content_security_policy = content_security_policy.value
        override                = true
      }
    }
  }

  custom_headers_config {
    items {
      header   = "Permissions-Policy"
      value    = local.permissions_policy
      override = true
    }

    dynamic "items" {
      for_each = var.csp_enforce ? [] : [local.csp]

      content {
        header   = "Content-Security-Policy-Report-Only"
        value    = items.value
        override = true
      }
    }
  }
}

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

resource "aws_cloudfront_distribution" "web" {
  enabled             = true
  comment             = "${var.project} web app"
  default_root_object = "index.html"
  price_class         = "PriceClass_200"

  origin {
    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_id                = "web-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id
  }

  default_cache_behavior {
    target_origin_id           = "web-s3"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_optimized.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
  }

  # SPA routing: a private S3 origin returns 403 for missing keys.
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

data "aws_iam_policy_document" "web_bucket" {
  statement {
    sid       = "AllowCloudFrontRead"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.web.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.web.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "web" {
  bucket = aws_s3_bucket.web.id
  policy = data.aws_iam_policy_document.web_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.web]
}
