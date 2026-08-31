ARG BASE_IMAGE
FROM ${BASE_IMAGE}
LABEL org.opencontainers.image.title="XYvirtual Appliance HTTPS edge"
LABEL org.opencontainers.image.licenses="AGPL-3.0-only"
COPY appliance/container/edge-entrypoint.sh /usr/local/bin/xyvirtual-edge
RUN chmod 0755 /usr/local/bin/xyvirtual-edge
ENTRYPOINT ["/usr/local/bin/xyvirtual-edge"]
