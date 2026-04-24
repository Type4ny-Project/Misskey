variable "cloudflare_api_token" {
  description = "Cloudflare API token with Workers Routes edit permission for the target zone."
  type        = string
  sensitive   = true
}

variable "targets" {
  description = "Per-zone public targets handled by this Worker, e.g. [{ zone_id = \"...\", hostname = \"prismisskey.space\" }, { zone_id = \"...\", hostname = \"mattyaski.co\" }]"
  type = list(object({
    zone_id  = string
    hostname = string
  }))
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
