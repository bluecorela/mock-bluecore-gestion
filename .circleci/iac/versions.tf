terraform {
  required_version = ">= 1.5.0"

  backend "s3" {
    bucket       = "bluecore-tf-states"
    key          = "bluecore-gestion-ecs/prod.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0, < 7.0"
    }
  }
}
