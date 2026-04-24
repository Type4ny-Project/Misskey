# Terraform for Cloudflare single-origin routing

This Terraform config manages the **single-origin** Cloudflare routing model for `frontend-worker`:

- one broad Worker route on `<hostname>/*`
- a smaller set of **no-worker backend overrides** that fall through to the Tunnel/backend

## Files

- `versions.tf` — Terraform and provider requirements
- `variables.tf` — zone, hostname, Worker script, backend override list
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

## Expected Cloudflare shape

The resulting routing model is:

```txt
<hostname>/*
  -> frontend Worker

<hostname>/api/*
<hostname>/streaming*
...
  -> no Worker route
  -> Tunnel/backend
```

## Notes

- This config assumes the Worker script itself is already deployed as `worker_script_name`.
- Backend override routes are intentionally narrower and more stable than frontend routes.
- `/emoji/*` is included so backend custom emoji lookup keeps working, while Worker-handled root endpoints like `/emoji.webp*` are still covered by the broad route.
- In Terraform, the broad route sets `script = var.worker_script_name`; backend override routes omit `script` entirely.
- Cloudflare route precedence is based on **pattern specificity**, not Terraform resource order. The more-specific backend overrides automatically win over `<hostname>/*`.
