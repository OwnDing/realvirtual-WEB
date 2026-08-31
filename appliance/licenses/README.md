# License material in an offline appliance

Every release includes the repository `LICENSE`, a production dependency SBOM, the target runtime
component lock, and this notice. A distributor must add the exact corresponding source archive or
the legally approved offline source-offer material for the delivered build. A public web link alone
is not sufficient handover documentation for an air-gapped customer.

Versioned release-notice templates are under `third-party/`. They document the selected baseline
but do not replace exact upstream license files or image-level notices. The CONNECT template must
be replaced with approved release evidence; its `MUST_BE_REPLACED` markers are intentionally not
valid formal-package content.
