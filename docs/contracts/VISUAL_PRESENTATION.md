---
doc_id: CONTRACT-VISUAL-001
title: 展示配方与媒体输出 v1
status: approved
owner: architecture
last_reviewed: 2026-10-11
authority: normative
---

# 展示配方与媒体输出 v1

## 展示配方

presentation为可选对象：schemaVersion=1，style稳定ID，brightness/background/shadow/reflection有限数，ground布尔值。预设ID不翻译；用户模板携带id/name/look；名称1至80字符，模板最多50项，JSON导入上限256KiB。未知字段保存时保留；未知版本拒绝。

项目rv-project-config/1.0在根和modelProfiles对应稳定文档ID下允许presentation；旧rv-settings-bundle/1.0在settings.presentation中携带项目默认配方。配置读取不写用户偏好。显式项目保存使用现有settingsRef与后端CAS，失败无成功提示；不覆盖未知版本。个人导入不写项目。

## 媒体输出

PNG/JPEG尺寸为实际像素；长边最多3840、面积最多3840×2160，检查GPU限制。透明PNG关闭地面、反射和不保留alpha的后处理，并明确显示兼容说明。JPEG不支持透明。导出使用完整渲染帧，不放大低分辨率截图；取景框使用中心裁切，与导出一致。

录像为无声Canvas视频，30 FPS采集目标，最长180秒、最多256MiB编码数据；MP4优先但按isTypeSupported探测，WebM回退。构造/开始/编码错误可观察；停止等待最终dataavailable；取消不下载；后台停止并保存可用片段。型号、实时帧率与编码器决定实际结果。

每Viewer单一导出会话，任何终止路径释放MediaStream、监听、计时器、对象URL和临时GPU资源；不得取消另一个所有者任务。导出不写场景业务事实。
