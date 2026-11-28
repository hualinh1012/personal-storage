# Foundation stack: long-lived resources that must outlive the app stack in infra/.
#   - Terraform state bucket (holds this stack's state and the app stack's state)
#   - Family files bucket (the actual data)
#   - SSM parameters the deploy reads (Google client, allowed emails, Deleted retention)
#   - Monthly cost budget with email alerts (budget.tf)
#   - Permissions boundary for the app stack's IAM roles (boundary.tf)
# Everything here has prevent_destroy. Apply it with ./bootstrap.sh from an admin
# machine; the CodePipeline only deploys the app stack.

terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Bucket is supplied at init time by bootstrap.sh. On the very first run the
  # bucket doesn't exist yet, so bootstrap.sh applies with local state and then
  # migrates it here.
  backend "s3" {
    key          = "foundation/terraform.tfstate"
    region       = "ap-southeast-1"
    use_lockfile = true
    encrypt      = true
  }
}

variable "project" {
  type    = string
  default = "family-drive"
}

variable "region" {
  type    = string
  default = "ap-southeast-1"
}

# How long files stay in the Deleted folder before S3 removes them for good
# (issue #25, ADR 0012). Counts from the deletion: a delete in the app copies
# the file into Deleted/, which gives it a fresh creation date.
variable "deleted_retention_days" {
  type    = number
  default = 30

  validation {
    condition     = var.deleted_retention_days >= 1 && floor(var.deleted_retention_days) == var.deleted_retention_days
    error_message = "deleted_retention_days must be a whole number of days, at least 1."
  }
}

# Monthly AWS cost budget in USD (budget.tf). The brief caps the running cost at
# about $2 a month (measure M1); the owner is emailed at 100% of actual and of
# forecast spend.
variable "monthly_budget_usd" {
  type    = number
  default = 2

  validation {
    condition     = var.monthly_budget_usd > 0
    error_message = "monthly_budget_usd must be greater than 0."
  }
}

# Custom domain for the app (ADR 0014). Empty keeps the app at its
# *.cloudfront.net address; set all three to switch. Written to SSM below
# (ssm.tf) for the app stack, which checks them before planning. These defaults
# are the source of truth: every foundation run writes them to SSM, so a value
# set only in SSM is reset to CHANGE_ME on the next run.
variable "custom_domain" {
  description = "Host name the app is served at, e.g. drive.example.com. Empty: no custom domain."
  type        = string
  default     = "drive.linhwas.dev"
}

variable "certificate_arn" {
  description = "Issued ACM certificate in us-east-1 (CloudFront's region) covering custom_domain."
  type        = string
  default     = "arn:aws:acm:us-east-1:084519186805:certificate/6834d47f-6904-47dd-9778-5434f92628aa"
}

variable "hosted_zone_id" {
  description = "Route 53 hosted zone in this account that holds custom_domain."
  type        = string
  default     = "Z04788981R8G05XYQJRR6"
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project = var.project
      Stack   = "foundation"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
}
