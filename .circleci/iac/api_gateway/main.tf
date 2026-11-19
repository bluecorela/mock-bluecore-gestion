resource "aws_apigatewayv2_vpc_link" "mgmt" {
  name               = var.vpc_link_name
  subnet_ids         = var.subnet_ids
  security_group_ids = [var.vpc_link_sg_id]
  tags               = merge(var.tags, { Name = var.vpc_link_name })
}

resource "aws_apigatewayv2_api" "mgmt" {
  name          = var.name
  protocol_type = "HTTP"
  tags          = merge(var.tags, { Name = var.name })
}

resource "aws_apigatewayv2_integration" "alb" {
  api_id                 = aws_apigatewayv2_api.mgmt.id
  integration_type       = "HTTP_PROXY"
  integration_method     = "ANY"
  integration_uri        = var.alb_listener_arn
  connection_type        = "VPC_LINK"
  connection_id          = aws_apigatewayv2_vpc_link.mgmt.id
  payload_format_version = "1.0"

  request_parameters = {
    "overwrite:path" = "$request.path"
  }
}

resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.mgmt.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.alb.id}"
}

resource "aws_cloudwatch_log_group" "access" {
  name              = var.log_group_name
  retention_in_days = 30
  tags              = merge(var.tags, { Name = var.log_group_name })
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.mgmt.id
  name        = "$default"
  auto_deploy = true
  tags        = merge(var.tags, { Name = "${var.name}-default" })

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.access.arn
    format = jsonencode({
      requestId        = "$context.requestId"
      sourceIp         = "$context.identity.sourceIp"
      requestPath      = "$context.path"
      status           = "$context.status"
      integrationError = "$context.integrationErrorMessage"
    })
  }

  depends_on = [aws_apigatewayv2_route.default]
}
