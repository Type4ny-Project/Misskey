FROM node:26.12.1-trixie-slim@sha256:36793bcbb160a6a16cede1e62b93f84e26b78a972a8a4c0b879c1c12f22761ec AS node
FROM ghcr.io/type4ny-project/misskey:develop@sha256:5fd72935f0fdc19af08acade2d8fbb830c530f13d0b0d211ec417bf84e39adeb
COPY --from=node /usr/local/bin/node /usr/local/bin/node
RUN node -e "require('node:assert').strictEqual(process.version, 'v26.12.1'); require('node:assert').strictEqual(process.versions.modules, '147')"
LABEL org.opencontainers.image.description="Production application preserved; Node.js runtime updated to 26.12.1" \
      org.opencontainers.image.base.name="ghcr.io/type4ny-project/misskey@sha256:5fd72935f0fdc19af08acade2d8fbb830c530f13d0b0d211ec417bf84e39adeb" \
      io.type4ny.node.version="26.12.1"
