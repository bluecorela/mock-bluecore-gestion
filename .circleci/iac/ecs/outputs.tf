output "service_name" {
  value = aws_ecs_service.web.name
}

output "target_group_arn" {
  value = aws_lb_target_group.web.arn
}

output "listener_arn" {
  value = aws_lb_listener.http.arn
}
