---
doc_id: DELIVERY-BRAND-001
title: 白标配置与交付
status: approved
owner: engineering
last_reviewed: 2026-10-13
authority: normative-process
---

# 白标配置与交付

适用 [White Label v1 契约](../contracts/WHITE_LABEL.md)。应用、受保护访问页、Appliance 状态/诊断页与单文件演示共享部署品牌。部署通过 `settings.json` 管理；项目脚本不能改变平台身份和配色。

## 配置示例

把下面的 `identity`、`branding` 合并进现有 **schemaVersion=2** 的部署配置，保留模型、授权、服务与策略字段。该示例是虚构客户；路径对应下一节的资源目录。

```json
{
  "schemaVersion": 2,
  "identity": {
    "productName": "琥珀工厂数字孪生",
    "shortName": "Amber Twin",
    "companyName": "Amber Example",
    "description": "琥珀工厂设备与产线展示",
    "logoUrl": "brand/logo.png",
    "faviconUrl": "brand/favicon.png",
    "primaryColor": "#CC5500",
    "secondaryColor": "#339966"
  },
  "branding": {
    "schemaVersion": 1,
    "browserTitle": "琥珀工厂 · 数字孪生",
    "theme": {
      "surfaceColor": "#18232B",
      "textColor": "#EEEEEE",
      "mutedTextColor": "#BCC9D2",
      "borderColor": "#465661"
    },
    "splash": {
      "logoUrl": "brand/logo.png",
      "backgroundColor": "#18232B",
      "textColor": "#EEEEEE",
      "tagline": { "zh-CN": "连接每一条产线", "en-US": "Connect every production line" },
      "animation": "none"
    },
    "attribution": {
      "visible": true,
      "text": { "zh-CN": "琥珀技术中心", "en-US": "Amber Technology" }
    },
    "icons": {
      "appleTouchUrl": "brand/apple-180.png",
      "pwa192Url": "brand/icon-192.png",
      "pwa512Url": "brand/icon-512.png",
      "maskable512Url": "brand/maskable-512.png"
    },
    "social": {
      "imageUrl": "brand/og-image.png",
      "title": "琥珀工厂数字孪生",
      "description": "浏览器中的产线与设备"
    }
  }
}
```

第二套客户可复用完全相同的应用构建，例如把名称设为 `Cobalt Works`、主色设为 `#1667CC`，换一套图片，并设 `attribution.visible=false`。没有配置时保持默认品牌与隐藏署名。`attribution.url` 可为部署根内路径；外部链接必须由现有 `egress.allow` 授予 `documentation` 用途，否则仅显示文字。Appliance 页和离线演示仅显示署名文字。

## 准备资源与生成完整交付目录

资源放入独立目录（例如 `/srv/brand-assets/`），其中直接包含 `logo.png`、`favicon.png` 等文件；`--assets` 将该目录复制到交付包的 `brand/`。如资源已在应用包内，可不传此参数。

- Logo/favicon 支持 PNG/JPEG/WebP 或静态 SVG。单文件最大 4 MiB，最大边长 4096，只接受单帧。SVG 限制为基本形状、文字、渐变与裁剪；不接受脚本、事件、样式表、动画、链接或外部引用，复杂 Logo 请导出 PNG。
- Apple/PWA 图标须为准确的 180×180、192×192、512×512 PNG；maskable 图标单独准备安全留白。
- 社交图片支持 PNG/JPEG/WebP，建议 1200×630；不接受 SVG。
- 所有资源均属于部署根；禁止外链、查询参数、fragment、编码路径与父目录跳转。旧 `./logo.png` 改为 `logo.png`，旧缓存 query 由内容哈希取代。

依赖准备好后构建一次：

```sh
./scripts/verify.sh build
node scripts/prepare-brand-delivery.mjs \
  --input dist \
  --output /srv/releases/amber-20261012 \
  --settings /srv/config/amber.settings.json \
  --assets /srv/brand-assets \
  --base /twin/
```

输出必须是尚不存在且位于输入目录之外的新目录；失败不会替换现有交付。应用建议使用默认相对 Vite base（`./`）构建，之后同一 JS 可部署到 `/` 或 `/twin/`。已经按固定绝对 base 编译的包只能沿用该路径。

`--settings` 是**完整配置文件**，不是补丁。工具校验资源，写入 `_brand/<内容哈希>.*`，重投影 HTML、manifest、CSP/响应头和 `present/` 的公开品牌快照。未认证访问页只接收名称、配色与展示资源，不接收完整 settings、授权或工业连接信息。正常 `npm run build` 的 postbuild 也执行相同品牌投影。

公开站点可加 `--page-url https://example.test/twin/` 生成 canonical/OG 图片绝对 URL。私有部署不传该参数，工具清除继承的公开 URL；宿主访问权限仍由既有认证边界决定。品牌设置不会创建外部访问授权。受保护访问 API 仍使用既有 `/api/access/v1` 路由。

Appliance 打包时，把该完整交付目录作为已有打包命令的 `--web-dist` 输入，并传 `--no-build` 复用已校验构建；打包器同步生成状态和诊断页品牌，再计算清单。单文件演示在导出时冻结展示文案与主题，并把 Logo 栅格化后内嵌；不引用部署资源，保留演示标题、AGPL/源码和离线告知。

## 更新、缓存与回退

整体切换新交付目录，保留上个版本以便原子回滚；不要仅在线替换 settings。HTML/settings/manifest 应重新验证缓存，带哈希的 `_brand/` 图片可长期缓存。Appliance 已包含这些缓存规则；其他宿主需按 [离线交付说明](OFFLINE_OPERATIONS.md)应用 CSP 响应头与正确 MIME 类型。

安装身份使用部署路径作为 manifest id/scope/start_url，换品牌不更改身份。不同浏览器更新已安装图标的时机不同，须在目标设备实测。移除品牌配置并重新生成可恢复默认；代码可通过 revert 本功能提交回退，无项目数据迁移。

## 验证和兼容边界

`verify.sh` 的 governance/static/node/browser/build 为基础门禁；构建后运行 `node scripts/test-white-label.mjs`，报告及截图位于 `test-results/white-label/`。CI Browser Gate 包含此旅程。另运行 `node scripts/test-protected-presentations.mjs` 验证真实本地 HTTPS 认证边界，`node scripts/test-demo-package.mjs` 验证单文件离线渲染。

部署品牌在加载/清理模型时保持；旧项目 `setCustomBranding` 只保留 `titleBar/title/titleLogoUrl/titleLogoHeight`，身份/颜色覆盖会被忽略并诊断，需将这些值迁移到部署配置。登录插件原有 title/subtitle/footer 仍可作为页面附加文字，accentColor 改由部署主色控制。法律版权、许可证、对应源码、水印和到期警告不会因隐藏 powered by 而隐藏。

本功能不含图形化品牌编辑器、浅色主题或多租户在线切换；不改变信号、轴向、告警等语义配色。自动验证不能替代客户真实图片、移动浏览器、PWA 安装、生产访问策略与实际 Appliance 交付验收。
