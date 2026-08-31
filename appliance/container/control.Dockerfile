ARG BASE_IMAGE
FROM ${BASE_IMAGE}
LABEL org.opencontainers.image.title="XYvirtual Appliance control plane"
LABEL org.opencontainers.image.licenses="AGPL-3.0-only"
WORKDIR /app
COPY appliance/runtime/control-plane.mjs /app/control-plane.mjs
COPY appliance/runtime/lib /app/lib
COPY appliance/runtime/static /app/static
USER node
ENTRYPOINT ["node", "/app/control-plane.mjs"]
