variable "cluster_arn" {
  type = string
}

variable "alb_arn" {
  type = string
}

variable "service_name" {
  type = string
}

variable "target_group_name" {
  type = string
}

variable "listener_port" {
  type = number
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "security_group_id" {
  type = string
}

variable "image" {
  type = string
}

variable "execution_role_arn" {
  type = string
}

variable "log_group_name" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "desired_count" {
  type = number
}

variable "container_port" {
  type = number
}

variable "tags" {
  type = map(string)
}

variable "app_env" {
  description = "Environment variables injected into the application container."
  type = object({
    node_env                  = string
    port                      = string
    supabase_url              = string
    supabase_service_role_key = string
    supabase_anon_key         = string
    supabase_v2_schema        = string
    supabase_db_url           = string
    auth_email_provider       = string
    cors_origins              = string
    frontend_url              = string
    swagger_enabled           = string
  })
}
