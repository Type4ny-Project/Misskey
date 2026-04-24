variable "cloudflare_api_token" {
  description = "Cloudflare API token with Workers Routes edit permission for the target zone."
  type        = string
  sensitive   = true
}

variable "zone_id" {
  description = "Cloudflare zone ID for the public hostname."
  type        = string
}

variable "hostname" {
  description = "Single-origin public hostname, e.g. prismisskey.space"
  type        = string
}

variable "worker_script_name" {
  description = "Deployed Worker script name, e.g. misskey-typeany-frontend"
  type        = string
  default     = "misskey-typeany-frontend"
}

variable "backend_override_patterns" {
  description = "More-specific no-worker routes that must bypass the broad Worker route and fall through to Tunnel/backend."
  type        = list(string)
  default = [
    "/api/*",
    "/streaming*",
    "/oauth/*",
    "/auth/*",
    "/miauth/*",
    "/.well-known/*",
    "/nodeinfo*",
    "/inbox*",
    "/users/*",
    "/objects/*",
    "/manifest.json",
    "/robots.txt",
    "/api.json",
    "/api-doc",
    "/opensearch.xml",
    "/embed.js",
    "/url*",
    "/flush",
    "/emoji/*"
  ]
}
