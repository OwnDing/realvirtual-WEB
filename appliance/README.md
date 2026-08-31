# XYvirtual Offline Appliance

This directory is the source of the versioned offline appliance. It is not itself a customer
installation package: the release builder adds the compiled WEB application and every locked
target runtime before it writes the full manifest and transport archive.

- Product behavior: `docs/product-specs/OFFLINE_APPLIANCE.md`
- Architecture: `docs/architecture/OFFLINE_APPLIANCE.md`
- Bundle contract: `docs/contracts/OFFLINE_APPLIANCE_BUNDLE.md`
- Customer installation: `appliance/docs/INSTALL.zh-CN.md`
- Release build procedure: `appliance/docs/BUILD.md`

No installer in this tree downloads a package or image. Missing target inputs are release errors.
