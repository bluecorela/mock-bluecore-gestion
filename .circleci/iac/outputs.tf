output "ecs_service_name" {
  value = module.ecs.service_name
}

output "target_group_arn" {
  value = module.ecs.target_group_arn
}

output "listener_arn" {
  value = module.ecs.listener_arn
}

output "task_security_group_id" {
  value = module.security.task_security_group_id
}

output "api_gateway_url" {
  value = module.api_gateway.api_endpoint
}

output "api_gateway_id" {
  value = module.api_gateway.api_id
}
