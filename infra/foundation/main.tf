# Foundation stack: long-lived resources that must outlive the app stack in infra/.
#   - Terraform state bucket (holds this stack's state and the app stack's state)
#   - Family files bucket (the actual data)
#   - SSM parameters the deploy reads (Google client, allowed emails)
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
