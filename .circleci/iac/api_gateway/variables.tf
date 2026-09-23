variable "name" {
  type = string
}

variable "vpc_link_name" {
  type = string
}

variable "log_group_name" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "vpc_link_sg_id" {
  type = string
}

variable "alb_listener_arn" {
  type = string
}

variable "tags" {
  type = map(string)
}
