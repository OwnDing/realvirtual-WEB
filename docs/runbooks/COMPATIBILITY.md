---
doc_id: RUNBOOK-COMPAT-001
title: 客户 IT 兼容性、最低配置与信任验收
status: approved
owner: engineering
last_reviewed: 2026-10-19
authority: normative-process
---

# 客户 IT 兼容性、最低配置与信任验收

## 支持声明

先查随交付版本的[兼容性矩阵](../generated/COMPATIBILITY_MATRIX.zh-CN.md)。首批认证目标为 Windows 11 x64 Chrome/Edge；完整产品认证、企业最低浏览器版本和具体硬件最低数值尚待实机留证。旧“143 以上完整支持”由版本化矩阵替代，不能作为采购承诺。未验证不等于已知不能运行。

正式支持需要对应范围的成功证据；有限支持列明用途和限制；实验性是可选试用路径；未验证没有认证承诺；不支持是已明确排除的组合。一次能力检测与产品等级独立。版本范围随发布冻结，不自动涵盖未来浏览器；复核超期提醒 Owner，不自动失效。

标准浏览器访问无需浏览器扩展、Java 或 ActiveX。Appliance 的 Node/容器/CONNECT 等由安装手册约束；工业连接可能需要网关；XR 驱动、浏览器、系统运行时和权限按设备清单单列。服务器 OS 和浏览器工作站分别验收。

## 检查流程

设置 → 诊断与支持提供环境检查。启动失败时直接访问部署基路径下 `compatibility/index.html`；Appliance 从 `/diagnostics/` 进入。页面、脚本和表格均为同源离线资源。

1. 选择语言、用途和请求的渲染路径，点击开始。
2. 浏览器项目检查创建随机专用 OPFS 文件，写/读后删除，不读业务文件。文件夹权限需另点击按钮并选择受控目录；按钮不写目录、不保留句柄。
3. 分别查看当前能力与产品认证。WebGL2 清屏读回、WebGPU 基础提交和 XR API 支持只证明前提，不证明场景帧率、文件保存或 XR 会话已通过。
4. 显式下载 JSON，查看后自行决定分享方式。报告没有原始 UA、origin、目录名、客户资产、凭证、信号值或任意异常文本，不自动上传、不连接工业服务。
5. 取消、超时、权限拒绝、配额和清理失败分别显示。超时不等于没有执行；迟到原生操作返回后仍尝试清理。不要清空业务站点数据来掩盖清理错误。

L3-1 诊断包继续被动采集。文件夹 API 不可用时，可使用经验证的浏览器项目或文件导入/下载；它们不等价于同步文件夹。浏览器存储可被清理或逐出，必须保留项目备份。

## HTTPS 与授信

TLS 信任与商业离线许可证分别验收。优先客户企业 CA；internal CA 根通过 IT 批准的离线介质、GPO、MDM 或证书管理流程分发，以独立渠道核对 SHA-256 指纹。见 [安装手册](../../appliance/docs/INSTALL.zh-CN.md)。不使用点击警告继续、关闭 TLS 校验或浏览器忽略证书错误参数交付。

在操作员相同网络/策略下检查 DNS、系统时间、主机名/SAN、证书链、到期和实际信任库。HTTPS 到网关使用 WSS 或同源代理。iframe/XR 另验宿主权限策略及用户授权。浏览器脚本不能读取证书链，只能报告 HTTPS/secure context，必须结合主机预检和 IT 验证。localhost HTTP 即使是安全上下文，也不是内网 HTTPS 验收。

续期保持 scheme/host/port；改变 origin 会隔离 OPFS、IndexedDB、localStorage，须另作迁移。CA 私钥按安装手册备份，证书分发不由检查页自动操作。

## 实机与工作流验收

办公集显和独显工作站分别记录 CPU、RAM、GPU、驱动、OS/架构、浏览器完整版本、分辨率/缩放、画质、电源策略以及远程桌面/虚拟机情况。不可读取的字段由 IT 填写，不用线程数推断整机最低配置。模型附摘要、节点、三角形、材质、纹理和字节量。

按 [L2-3 操作手册](../delivery/LOADING_PERFORMANCE_OPERATIONS.md) 在真实参考机运行至少 30 次基准，验证首屏、完整就绪、固定路线 FPS 和重复加载释放。软件 GPU 仅为功能证据，hardware 参数不自动批准销售承诺。

XR 清单记录头显型号、固件/OS、浏览器/运行时、VR/AR、图形后端和输入方式，实际验证进入、显示比例、控制器/手势、退出重进和释放。当前 WebGPU 与 XR 组合不支持；不会按 Quest/Pico UA 自动认证。

还须验证：承诺最低/最高浏览器版本；真实 Chrome/Edge；文件夹保存→关闭→重新授权→重开和权限拒绝；浏览器项目保存重开/备份恢复；真实 HTTPS/WSS、过期证书/错误 SAN/不信任根；单文件演示独立流程。WebKit 自动化不是 Safari 真机认证。不得使用生产 PLC 或客户秘密作为 fixture。

## 工程入口

已安装锁定依赖及对应浏览器的工程机运行：

```sh
node scripts/generate-compatibility.mjs --check
./scripts/verify.sh all
node scripts/verify-compatibility-production.mjs
node scripts/verify-compatibility-production.mjs --channel=chrome --hardware
node scripts/verify-compatibility-production.mjs --channel=msedge --hardware
node scripts/verify-compatibility-production.mjs --channel=chrome --hardware --renderer=webgpu
npm run benchmark:performance -- --hardware
```

企业冻结浏览器可用 `--executable=/absolute/path/to/browser`，与 channel 互斥；使用已批准的二进制，不自动下载、不改 UA 冒充。脚本只测试 dist 字节，自动关闭本机 loopback 服务，报告注明 HTTP 与真实信任的差异。缺少浏览器、硬件或所请求 WebGPU 后端必须失败，不能 skip 后认证。

证据附构建摘要、环境、日期、用途、正反例、结果和审批者。脚本只输出证据，人工复核后才能更新矩阵源并重新生成。未验证认证项由 [ExecPlan](../exec-plans/active/EP-COMPAT-001-compatibility-matrix.md) 持续跟踪。
