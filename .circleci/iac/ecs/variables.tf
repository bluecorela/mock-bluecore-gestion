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
