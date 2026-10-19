---
doc_id: CONTRACT-COMPAT-001
title: 发布兼容性与环境检查契约
status: approved
owner: architecture
last_reviewed: 2026-10-19
authority: normative
---

# 发布兼容性与环境检查契约

## 来源与版本

源为 `src/core/compatibility/support-matrix.json`，`kind: xyvirtual-compatibility-matrix`、`schemaVersion: 2`。`productVersion` 与 package 版本一致，`revision` 标识矩阵修订，`reviewedOn` 为人工复核日期。工作流 requirements、功能等级、目标环境、硬件档及证据均由此声明。

WEB 在 `compatibility/support-matrix.json` 提供 v2，Appliance 在 `diagnostics/compatibility/support-matrix.json` 提供同样内容。旧 v1 路径保留字段，不再把一个操作系统的有限证据或未来版本扩散为全平台 full。

## 认证与能力

等级为 `supported|limited|experimental|unverified|unsupported`。已认证目标必须有有限的浏览器版本区间，以及对应产品/OS/架构/浏览器/工作流和成功状态的证据引用；supported 另需 hardware 证据。证据含测试环境、运行日期、生产构建标识、场景范围和报告相对路径。不存在的报告、错误范围、软件 GPU 冒充硬件均拒绝。

判定结果为 `capability: satisfied|limited|unknown` 与独立 `certification`，附稳定原因 code。必要能力失败为 limited，必要能力未检测为 unknown；API 存在不等于操作已成功。未知 OS 版本/架构不能匹配要求精确硬件的认证条目。缺失/非法矩阵返回 MATRIX_INVALID，不沿用旧 full 声明。

标准 WEB、浏览器项目、文件夹项目、XR VR/AR、单文件演示分别声明。`webgpu` 是可选实验性路径，不能通过 requested renderer 代替实际后端；XR 与 webgpu/webgpu-gl 组合不可用。WebGL2 清屏读回仅证明本次基本图形操作，不能代替模型渲染/帧率验收。

## 主动环境报告 v1

`kind: xyvirtual-environment-check`、`schemaVersion: 1`、时间、矩阵版本、已选择工作流/渲染路径、浏览器/OS 家族及版本、checks、assessment。每项为稳定 id/code、`pass|fail|unknown` 和白名单数据。无原始 UA、origin、地址、目录/文件名、客户资产、任意异常文本。结果保存在当前页面内存，显式下载 JSON，页面离开即释放，不自动上传。

检查只在用户点击后执行。OPFS 使用随机命名的自有临时文件，写/读后在 finally 删除；取消或超时后迟到的完成路径仍清理，清理失败独立显示。目录读写权限由独立按钮发起，只读取权限结果、不写用户选择目录；完整文件夹保存重开由受控测试工作流/人工验收完成。

## 生成与发布

`node scripts/generate-compatibility.mjs` 更新生成物，`--check` 只校验。规范源、发布产品版本、生成文档、静态页面、v1 投影必须一致。认证工具只输出证据，不自动将目标改成 supported。人工复核及发布确认后才能更新认证范围。

依据 [ADR-0018](../adr/ADR-0018-compatibility-evidence.md)。
