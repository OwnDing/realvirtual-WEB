---
doc_id: ADR-0015
title: 视觉呈现与有界媒体导出
status: approved
adr_status: accepted
owner: architecture
last_reviewed: 2026-10-11
authority: normative
---

# 视觉呈现与有界媒体导出

## Context

现有视觉预设使用用户localStorage；材质setMaterial仅适用于未批量烘焙的编辑器；MCP截图已有完整渲染入口；公开资产编辑器已有文档、撤销、保存与引用保护。

## Decision

2026-10-11用户认可方案并要求实施。新增公开视觉呈现模块与UI插件，复用现有VisualSettings、AssetDocument、项目设置后端。展示配方为有界参数、稳定ID和版本，不存储渲染器对象。项目配方进入项目settings/profile，用户模板进入独立偏好；加载项目不写用户偏好。部署锁定继续优先。旧视觉设置和旧设置bundle兼容。

材质只通过公开资产文档的setMaterial操作链应用，保存经统一写入；引用保护不放宽，不新增实例材质覆盖。运行时控制材质与多槽对象拒绝。

导出使用完整帧渲染链与临时尺寸覆盖，统一恢复尺寸、画质、背景、相机及辅助层。每Viewer只允许一个捕获会话；文档切换取消旧任务；不改变固定步长、信号或工业写权限。Canvas捕获与MediaRecorder原生编码，无新增运行依赖或外部服务。

## Compatibility and Migration

项目设置增加可选presentation字段（含独立schemaVersion），已有modelProfiles可选择文档展示默认。旧设置未知字段读改写时保留，未知版本拒绝编辑。原始GLB/rv_extras/NodeId不变；原资产只在现有显式保存动作中写入。单文件演示格式不变。

## Validation

参数校验、存储CAS/只读/切换、撤销材质隔离、实际像素和编码、失败释放、离线加载、WebGPU限制、综合门禁与E2E。软件GPU不能证明硬件性能。

## Implementation Notes

入口使用现有 ActivityBar 与 LeftPanel，面板开关属于 LeftPanelManager；导出取消在模型清理前同步执行。录制期间由捕获会话调度渲染，原固定步长仿真不变。相机书签和鼠标参数保存不得把项目配方写入用户视觉偏好。

兼容验证启用了原有独立 embed 门禁，发现默认引用解析器的工作区查询将项目/HMI作为动态块带入独立库。独立库无工作区项目，在该构建中静态排除这一分支；保留库、相对路径解析和主应用的项目解析，恢复原有 embed 的无React契约，不扩充演示文件格式。

## Rollback

关闭视觉呈现插件并移除可选presentation配置，旧Visual设置继续工作。模板保留可导出；不自动删除用户文件，不需转换源模型。
