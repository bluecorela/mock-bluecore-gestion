variable "aws_region" {
  type = string
}

variable "tags" {
  type = map(string)
}

variable "ecs" {
  type = object({
    cluster_name        = string
    service_name        = string
    target_group_name   = string
    ecr_repository_name = string
    image_tag           = string
    execution_role_name = string
    log_group_name      = string
    desired_count       = number
    container_port      = number
  })
}

variable "security" {
  type = object({
    alb_sg_name      = string
    task_sg_name     = string
    vpc_link_sg_name = string
  })
}

variable "api_gateway" {
  type = object({
    name           = string
    vpc_link_name  = string
    log_group_name = string
  })
}

variable "load_balancer" {
  type = object({
    name          = string
    listener_port = number
  })
}

variable "vpc" {
  type = object({
    name                        = string
    private_subnet_name_pattern = string
  })
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
