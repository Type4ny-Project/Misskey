output "broad_worker_route" {
  value       = cloudflare_workers_route.frontend_worker.pattern
  description = "The broad single-origin Worker route."
}

output "backend_override_routes" {
  value       = [for route in cloudflare_workers_route.backend_overrides : route.pattern]
  description = "The backend no-worker override routes."
}
