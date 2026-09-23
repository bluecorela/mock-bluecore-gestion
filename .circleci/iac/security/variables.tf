variable "name" {
  type = string
}

variable "vpc_link_name" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "alb_security_group_id" {
  type = string
}

variable "container_port" {
  type = number
}

variable "listener_port" {
  type = number
}

variable "tags" {
  type = map(string)
}
