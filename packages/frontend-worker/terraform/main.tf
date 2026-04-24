locals {
  broad_worker_pattern = "${var.hostname}/*"
  backend_override_map = {
    for pattern in var.backend_override_patterns : pattern => "${var.hostname}${pattern}"
  }
}

resource "cloudflare_workers_route" "frontend_worker" {
  zone_id = var.zone_id
  pattern = local.broad_worker_pattern
  script  = var.worker_script_name
}

resource "cloudflare_workers_route" "backend_overrides" {
  for_each = local.backend_override_map

  zone_id = var.zone_id
  pattern = each.value
}
