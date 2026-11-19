resource "aws_security_group" "tasks" {
  name        = var.name
  description = "Allow HTTP from mgmt-lb to mgmt-web tasks"
  vpc_id      = var.vpc_id

  ingress {
    description     = "HTTP from the existing ALB"
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [var.alb_security_group_id]
  }

  egress {
    description = "ECR and CloudWatch through the NAT gateway"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, { Name = var.name })
}

resource "aws_vpc_security_group_egress_rule" "alb_to_tasks" {
  security_group_id            = var.alb_security_group_id
  referenced_security_group_id = aws_security_group.tasks.id
  description                  = "Allow HTTP from mgmt-lb to mgmt-web tasks"
  ip_protocol                  = "tcp"
  from_port                    = var.container_port
  to_port                      = var.container_port
  tags                         = merge(var.tags, { Name = "${var.name}-alb-egress" })
}

resource "aws_security_group" "vpc_link" {
  name        = var.vpc_link_name
  description = "Security group for API Gateway VPC Link to mgmt-lb"
  vpc_id      = var.vpc_id

  tags = merge(var.tags, { Name = var.vpc_link_name })
}

resource "aws_vpc_security_group_egress_rule" "vpc_link_to_alb" {
  security_group_id            = aws_security_group.vpc_link.id
  referenced_security_group_id = var.alb_security_group_id
  description                  = "Allow HTTP from API Gateway VPC Link to mgmt-lb"
  ip_protocol                  = "tcp"
  from_port                    = var.listener_port
  to_port                      = var.listener_port
  tags                         = merge(var.tags, { Name = "${var.vpc_link_name}-alb-egress" })
}

resource "aws_vpc_security_group_ingress_rule" "alb_from_vpc_link" {
  security_group_id            = var.alb_security_group_id
  referenced_security_group_id = aws_security_group.vpc_link.id
  description                  = "Allow HTTP from API Gateway VPC Link"
  ip_protocol                  = "tcp"
  from_port                    = var.listener_port
  to_port                      = var.listener_port
  tags                         = merge(var.tags, { Name = "${var.vpc_link_name}-alb-ingress" })
}
