#!/usr/bin/env bash
# Installs a pinned Terraform version on the CodeBuild (Linux x86_64) image.
set -euo pipefail

TF_VERSION="${TF_VERSION:-1.16.6}"

curl -sSLo /tmp/terraform.zip \
  "https://releases.hashicorp.com/terraform/${TF_VERSION}/terraform_${TF_VERSION}_linux_amd64.zip"
unzip -o -q /tmp/terraform.zip -d /usr/local/bin
rm -f /tmp/terraform.zip
terraform version
