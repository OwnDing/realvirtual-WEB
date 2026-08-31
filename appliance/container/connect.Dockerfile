ARG BASE_IMAGE
FROM ${BASE_IMAGE}
LABEL org.opencontainers.image.title="XYvirtual CONNECT appliance runtime"
COPY appliance-image-input/realvirtual-Connect /usr/local/bin/realvirtual-Connect
RUN chmod 0755 /usr/local/bin/realvirtual-Connect && mkdir -p /var/lib/xyvirtual-connect && chown -R 10001:10001 /var/lib/xyvirtual-connect
USER 10001:10001
ENTRYPOINT ["/usr/local/bin/realvirtual-Connect"]
CMD ["--project-root", "/var/lib/xyvirtual-connect", "--port", "5100"]
