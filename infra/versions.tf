terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
    # No longer used by any resource; kept so Terraform can remove the old
    # random_string.domain_suffix from existing state. Safe to drop afterwards.
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # The bucket name is supplied at init time:
  #   terraform init -backend-config="bucket=<project>-tfstate-<account_id>"
  backend "s3" {
    key          = "family-drive/terraform.tfstate"
    region       = "ap-southeast-1"
    use_lockfile = true
    encrypt      = true
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project = var.project
    }
  }
}

data "aws_caller_identity" "current" {}
