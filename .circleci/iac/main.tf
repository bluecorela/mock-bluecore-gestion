data "aws_vpc" "mgmt" {
  filter {
    name   = "tag:Name"
    values = [var.vpc.name]
  }
}

data "aws_subnets" "private" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.mgmt.id]
  }

  filter {
    name   = "tag:Name"
    values = [var.vpc.private_subnet_name_pattern]
  }
}

data "aws_security_group" "alb" {
  filter {
    name   = "group-name"
    values = [var.security.alb_sg_name]
  }

  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.mgmt.id]
  }
}

data "aws_lb" "mgmt" {
  name = var.load_balancer.name
}

data "aws_ecs_cluster" "mgmt" {
  cluster_name = var.ecs.cluster_name
}

data "aws_ecr_repository" "web" {
  name = var.ecs.ecr_repository_name
}

data "aws_iam_role" "execution" {
  name = var.ecs.execution_role_name
}

module "security" {
  source                = "./security"
  name                  = var.security.task_sg_name
  vpc_link_name         = var.security.vpc_link_sg_name
  vpc_id                = data.aws_vpc.mgmt.id
  alb_security_group_id = data.aws_security_group.alb.id
  container_port        = var.ecs.container_port
  listener_port         = var.load_balancer.listener_port
  tags                  = var.tags
}

module "ecs" {
  source = "./ecs"

  cluster_arn        = data.aws_ecs_cluster.mgmt.arn
  alb_arn            = data.aws_lb.mgmt.arn
  service_name       = var.ecs.service_name
  target_group_name  = var.ecs.target_group_name
  listener_port      = var.load_balancer.listener_port
  vpc_id             = data.aws_vpc.mgmt.id
  subnet_ids         = sort(data.aws_subnets.private.ids)
  security_group_id  = module.security.task_security_group_id
  image              = "${data.aws_ecr_repository.web.repository_url}:${var.ecs.image_tag}"
  execution_role_arn = data.aws_iam_role.execution.arn
  log_group_name     = var.ecs.log_group_name
  aws_region         = var.aws_region
  desired_count      = var.ecs.desired_count
  container_port     = var.ecs.container_port
  tags               = var.tags
}

module "api_gateway" {
  source = "./api_gateway"

  name             = var.api_gateway.name
  vpc_link_name    = var.api_gateway.vpc_link_name
  log_group_name   = var.api_gateway.log_group_name
  subnet_ids       = sort(data.aws_subnets.private.ids)
  vpc_link_sg_id   = module.security.vpc_link_security_group_id
  alb_listener_arn = module.ecs.listener_arn
  tags             = var.tags
}
