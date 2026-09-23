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
