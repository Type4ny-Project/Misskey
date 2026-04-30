# Terraform for Cloudflare single-origin routing

This Terraform config manages the **single-origin** Cloudflare routing model for `frontend-worker`:

- one broad Worker route on each `<hostname>/*`
- a smaller set of **no-worker backend overrides** that fall through to the Tunnel/backend for each hostname

## Files

- `versions.tf` — Terraform and provider requirements
- `variables.tf` — targets (`zone_id` + `hostname`), Worker script, backend override list
- `main.tf` — broad Worker route + backend override routes
- `terraform.tfvars.example` — example inputs

This config intentionally requires **Cloudflare provider >= 5.5.0** because early v5 releases had a bug around optional `cloudflare_workers_route.script`, which breaks no-worker override routes.

## Usage

```sh
cd packages/frontend-worker/terraform
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars
terraform init
terraform plan
terraform apply
```

## Migrating existing state from single-hostname to `targets`

If you already applied the earlier single-hostname version of this module for `prismisskey.space`, you do **not** need to recreate the routes. Move the existing state entries to the `targets` model first.

Example:

```sh
cd packages/frontend-worker/terraform

terraform state mv \
  'cloudflare_workers_route.frontend_worker' \
  'cloudflare_workers_route.frontend_worker["prismisskey.space"]'

terraform state mv 'cloudflare_workers_route.backend_overrides["/.well-known/*"]' 'cloudflare_workers_route.backend_overrides["prismisskey.space /.well-known/*"]'
terraform state mv 'cloudflare_workers_route.backend_overrides["/api-doc"]' 'cloudflare_workers_route.backend_overrides["prismisskey.space /api-doc"]'
terraform state mv 'cloudflare_workers_route.backend_overrides["/api.json"]' 'cloudflare_workers_route.backend_overrides["prismisskey.space /api.json"]'
terraform state mv 'cloudflare_workers_route.backend_overrides["/api/*"]' 'cloudflare_workers_route.backend_overrides["prismisskey.space /api/*"]'
terraform state mv 'cloudflare_workers_route.backend_overrides["/auth/*"]' 'cloudflare_workers_route.backend_overrides["prismisskey.space /auth/*"]'
terraform state mv 'cloudflare_workers_route.backend_overrides["/embed.js"]' 'cloudflare_workers_route.backend_overrides["prismisskey.space /embed.js"]'
terraform state mv 'cloudflare_workers_route.backend_overrides["/emoji/*"]' 'cloudflare_workers_route.backend_overrides["prismisskey.space /emoji/*"]'
terraform state mv 'cloudflare_workers_route.backend_overrides["/flush"]' 'cloudflare_workers_route.backend_overrides["prismisskey.space /flush"]'
terraform state mv 'cloudflare_workers_route.backend_overrides["/inbox*"]' 'cloudflare_workers_route.backend_overrides["prismisskey.space /inbox*"]'
terraform state mv 'cloudflare_workers_route.backend_overrides["/manifest.json"]' 'cloudflare_workers_route.backend_overrides["prismisskey.space /manifest.json"]'
terraform state mv 'cloudflare_workers_route.backend_overrides["/miauth/*"]' 'cloudflare_workers_route.backend_overrides["prismisskey.space /miauth/*"]'
terraform state mv 'cloudflare_workers_route.backend_overrides["/nodeinfo*"]' 'cloudflare_workers_route.backend_overrides["prismisskey.space /nodeinfo*"]'
terraform state mv 'cloudflare_workers_route.backend_overrides["/oauth/*"]' 'cloudflare_workers_route.backend_overrides["prismisskey.space /oauth/*"]'
terraform state mv 'cloudflare_workers_route.backend_overrides["/objects/*"]' 'cloudflare_workers_route.backend_overrides["prismisskey.space /objects/*"]'
terraform state mv 'cloudflare_workers_route.backend_overrides["/opensearch.xml"]' 'cloudflare_workers_route.backend_overrides["prismisskey.space /opensearch.xml"]'
terraform state mv 'cloudflare_workers_route.backend_overrides["/robots.txt"]' 'cloudflare_workers_route.backend_overrides["prismisskey.space /robots.txt"]'
terraform state mv 'cloudflare_workers_route.backend_overrides["/streaming*"]' 'cloudflare_workers_route.backend_overrides["prismisskey.space /streaming*"]'
terraform state mv 'cloudflare_workers_route.backend_overrides["/url*"]' 'cloudflare_workers_route.backend_overrides["prismisskey.space /url*"]'
terraform state mv 'cloudflare_workers_route.backend_overrides["/users/*"]' 'cloudflare_workers_route.backend_overrides["prismisskey.space /users/*"]'
```

After that, update `terraform.tfvars` to use:

```hcl
targets = [{
  zone_id  = "<prismisskey.space zone id>"
  hostname = "prismisskey.space"
}]
```

Then run:

```sh
terraform plan
terraform apply
```

## Expected Cloudflare shape

The resulting routing model is:

```txt
<hostname-a>/*
<hostname-b>/*
  -> frontend Worker

<hostname-a>/api/*
<hostname-a>/streaming*
<hostname-b>/api/*
<hostname-b>/streaming*
...
  -> no Worker route
  -> Tunnel/backend
```

## Notes

- This config assumes the Worker script itself is already deployed as `worker_script_name`.
- Backend override routes are intentionally narrower and more stable than frontend routes.
- `/emoji/*` is included so backend custom emoji lookup keeps working, while Worker-handled root endpoints like `/emoji.webp*` are still covered by the broad route.
- In Terraform, the broad routes set `script = var.worker_script_name`; backend override routes omit `script` entirely.
- Cloudflare route precedence is based on **pattern specificity**, not Terraform resource order. The more-specific backend overrides automatically win over each `<hostname>/*` route.
- Use `targets` when hostnames belong to different Cloudflare zones. Each target carries its own `zone_id` and `hostname`.
