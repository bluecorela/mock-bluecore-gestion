tags = {
  project   = "mgmt-back"
  terraform = true
  region    = "us-east-1"
}

aws_region = "us-east-1"

ecs = {
  cluster_name        = "mgmt-cluster"
  service_name        = "mgmt-back"
  target_group_name   = "mgmt-back-tg"
  ecr_repository_name = "mgmt-back"
  image_tag           = "{LATEST_VERSION}"
  execution_role_name = "ecsTaskExecutionRole"
  log_group_name      = "/ecs/mgmt-back"
  desired_count       = 1
  container_port      = 3000
}

security = {
  alb_sg_name      = "mgmt-prod-alb-sg"
  task_sg_name     = "mgmt-back-tasks"
  vpc_link_sg_name = "mgmt-back-vpc-link"
}

api_gateway = {
  name           = "mgmt-back-api"
  vpc_link_name  = "mgmt-back-vpc-link"
  log_group_name = "/aws/apigateway/mgmt-back-api"
}

load_balancer = {
  name          = "mgmt-lb"
  listener_port = 8080
}

vpc = {
  name                        = "mgmt-prod"
  private_subnet_name_pattern = "bluecore-gestion-prod-private-subnet-*"
}
