output "broad_worker_routes" {
  value       = { for hostname, route in cloudflare_workers_route.frontend_worker : hostname => route.pattern }
  description = "The broad single-origin Worker routes per hostname."
}

output "backend_override_routes" {
  value       = [for route in cloudflare_workers_route.backend_overrides : route.pattern]
  description = "The backend no-worker override routes across all configured targets."
}
