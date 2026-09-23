output "api_endpoint" {
  value = aws_apigatewayv2_api.mgmt.api_endpoint
}

output "api_id" {
  value = aws_apigatewayv2_api.mgmt.id
}

output "vpc_link_id" {
  value = aws_apigatewayv2_vpc_link.mgmt.id
}
