---
doc_id: CONTRACT-BRAND-001
title: White Label v1 契约
status: approved
owner: architecture
last_reviewed: 2026-10-13
authority: normative
---

# White Label v1 契约

Deployment Config v2 可选 branding 段，schemaVersion=1；原 identity 的名称、描述、logoUrl/faviconUrl、primaryColor/secondaryColor 不变。批准依据为 [ADR-0016](../adr/ADR-0016-deployment-white-label.md)。

机器可读定义：[branding v1 Schema](../../schema/v1/branding.json)，入口为 [Deployment Config v2](../../schema/v2/deployment-config.json)。操作示例见[白标交付说明](../delivery/WHITE_LABEL_OPERATIONS.md)。

## 字段

- browserTitle：非空纯文本，最长 200。
- theme：surfaceColor/textColor/mutedTextColor/borderColor，均 #RRGGBB。
- splash：logoUrl、backgroundColor、textColor、tagline、animation（orbit/none）。
- attribution：visible（默认 false）、text、url（同源路径或 http(s)，HTTP(S) URL 必须显式包含 //，不含凭据、字面空白或反斜杠；外部导航必须通过已有 purpose 策略）。
- icons：appleTouchUrl、pwa192Url、pwa512Url、maskable512Url。分别为 180/192/512/512 方形 PNG；maskable 由交付者提供带安全留白版本。
- social：imageUrl（PNG/JPEG/WebP）、title（200 字）、description（500 字）。公开绝对 URL 由交付参数 pageUrl 推导；私有部署默认不公开页面地址。
- tagline/text 可为纯文本或 zh-CN/en-US 对象；回退为当前语言 → zh-CN → 默认文案；空 tagline 可显式隐藏。

## 校验与默认

资源限定部署目录内的相对路径（前导单斜杠兼容为部署根）；禁止 scheme、协议相对、反斜杠、控制字符、查询/fragment、编码路径与父目录段。交付检查真实路径，拒绝符号链接逃逸。Logo 可 PNG/JPEG/WebP/SVG；SVG 禁止主动内容和外部引用；文件大小有界。颜色只接收六位 hex，文字不得解释为 HTML。

运行时逐字段回退并产生不含输入值的诊断，解析幂等；交付对非法配置/资源失败。branding 仅 v2 生效，未来版本忽略。旧 v1 identity 的普通字段与默认值保持，资源路径统一采用上述约束；部署/项目/会话安全界限不变。

## 消费与兼容

共享解析器生成有效品牌，静态投影、UI、manifest 和独立入口共用。PWA id/start_url/scope 来自部署路径，名称更新不改变安装身份。图标/品牌资源使用内容 hash 路径，HTML/settings/manifest 需重新验证缓存。项目 branding API 仅允许 titleBar/title/titleLogoUrl/titleLogoHeight，清理后恢复部署品牌；拒绝身份和颜色覆盖。

导出只携带已解析的品牌展示及内嵌图片；不改变演示 payload schemaVersion=1 或 recipe。版权、许可证、源码及到期提示不受 attribution.visible 控制。
