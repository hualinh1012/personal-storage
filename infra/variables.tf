variable "project" {
  type    = string
  default = "family-drive"
}

variable "region" {
  type    = string
  default = "ap-southeast-1"
}

variable "dev_origin" {
  description = "Local dev server origin, allowed by the files bucket CORS."
  type        = string
  default     = "http://localhost:5173"
}
