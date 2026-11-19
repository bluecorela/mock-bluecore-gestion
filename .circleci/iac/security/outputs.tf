output "task_security_group_id" {
  value = aws_security_group.tasks.id
}

output "vpc_link_security_group_id" {
  value = aws_security_group.vpc_link.id
  depends_on = [
    aws_vpc_security_group_egress_rule.vpc_link_to_alb,
    aws_vpc_security_group_ingress_rule.alb_from_vpc_link,
  ]
}
