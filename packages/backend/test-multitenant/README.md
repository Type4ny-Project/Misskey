# Multi-tenant local verification

This environment starts:

- one shared backend process
- two tenant DBs (`db.a.test`, `db.b.test`)
- two nginx frontends (`a.test`, `b.test`)
- one shared redis

The goal is to verify host-based DB routing and federation between two tenants handled by the same application process.
