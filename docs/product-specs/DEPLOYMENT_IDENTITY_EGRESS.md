---
doc_id: PS-CONFIG-001
title: 部署身份与默认零外呼
status: approved
owner: product
last_reviewed: 2026-08-29
authority: normative
---

# 部署身份与默认零外呼

## 1. 目标

同一份 XYvirtual WEB 源码应能通过版本化部署配置交付不同客户身份，不需要客户 fork。缺少或损坏配置时，应用仍可使用同源静态资源启动，并且不会自动访问第三方网络。

## 2. 用户可观察行为

1. 默认部署允许同源、`data:` 与 `blob:` 资源，拒绝外部 HTTP(S)、WebSocket、脚本、图片和遥测。
2. 外部访问必须同时具备用途和部署 allowlist；项目、模型、URL 参数与浏览器偏好不能放宽部署策略。
3. 产品名、短名、Logo、favicon、颜色和部署链接来自部署配置；首屏和 React UI 使用同一身份。
4. Analytics、新闻、文档、CONNECT 下载/版本、Firebase Demo、GitHub Library 和 CAD 目录链接默认关闭。
5. 二维码与 Draco decoder 使用随应用交付的本地实现/资源。
6. 配置无效时受影响能力失败关闭，并产生不含敏感信息的诊断；基础 Viewer、Planner、智能资产编辑器和 DES 仍可启动。
7. 用户主动配置工业接口或远程资产并不自动获得外呼权；部署策略必须明确允许对应 origin 和 purpose。

## 3. 不属于品牌剥离的内容

- SPDX、版权、许可证、无担保和对应源码入口；
- `rv_extras`、`userData.realvirtual`、NodeId、项目/文档/资产 ID、插件 ID 与持久化 key；
- Festo、Bosch Rexroth、TraceParts、3Dfindit 等真实协议、厂商、目录或 AAS 身份；
- 为读取旧 GLB、项目和场景所需的兼容名称。

这些内容可以不出现在普通产品界面，但不得通过无迁移的全局字符串替换修改。

## 4. 配置与优先级

本规格只批准部署层：安全内置默认值先建立边界，部署配置可在边界内启用能力；安全配置采用最严格规则优先。组织平台以后可以生成同一份已解析部署配置，但浏览器不直接合并多层策略。

项目、模型、用户和会话配置的通用覆盖字段与优先级已由 Closed `OD-003`、[`PS-CONFIG-002`](UNIFIED_CONFIGURATION.md) 和 Accepted [`ADR-0008`](../adr/ADR-0008-unified-configuration.md) 决定；本规格仍只管理部署身份、法律、服务与外呼安全字段。

## 5. 法律与身份边界

产品身份与法律告知是两类数据。部署身份可以改变产品展示；法律告知必须依据实际许可证和权利人决定生成，客户配置不能删除必需告知。本规格不解释或修改许可证。

## 6. 验收

- 默认配置完成首页、Projects、Asset Editor、DES、CONNECT、Library 与 VR/AR 入口巡检时没有跨 origin 请求；
- 允许一个用途/origin 后只有该组合可以访问，其他组合仍被拒绝；
- 缺失、未知版本、非法 origin 和错误字段均失败关闭；
- 构建后首屏、标题、meta、favicon 与 React UI 使用一致身份；
- 静态门禁阻止新的可执行外部 origin 绕过登记；
- 旧 GLB、`rv_extras`、项目文档、资产引用与保存场景保持兼容。
