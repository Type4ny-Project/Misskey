locals {
  broad_worker_patterns = {
    for target in var.targets : target.hostname => {
      zone_id = target.zone_id
      pattern = "${target.hostname}/*"
    }
  }
  backend_override_map = {
    for pair in flatten([
      for target in var.targets : [
        for override_pattern in var.backend_override_patterns : {
          key      = "${target.hostname} ${override_pattern}"
          zone_id  = target.zone_id
          hostname = target.hostname
          pattern  = "${target.hostname}${override_pattern}"
        }
      ]
    ]) : pair.key => {
      zone_id  = pair.zone_id
      hostname = pair.hostname
      pattern  = pair.pattern
    }
  }
}

resource "cloudflare_workers_route" "frontend_worker" {
  for_each = local.broad_worker_patterns

  zone_id = each.value.zone_id
  pattern = each.value.pattern
  script  = var.worker_script_name
}

resource "cloudflare_workers_route" "backend_overrides" {
  for_each = local.backend_override_map

  zone_id = each.value.zone_id
  pattern = each.value.pattern
}
