# 安卓版本验证记录

日期：2026-09-12。验证对象为本仓库新增的安卓平板版本。此记录严格区分本地验证与真机验证。

## 环境

- 平板：Xiaomi Pad 6S Pro 12.4，型号 24018RPACC。
- Android 16 / API 36；2032 × 3048；400 dpi。
- 系统 WebView：com.google.android.webview 147.0.7727.55。
- ADB：37.0.1，使用本地 5038 服务端口；设备状态 `device`。
- 便携构建环境：Microsoft OpenJDK 17.0.19、Gradle 8.13、AGP 8.11.1、Kotlin 2.1.20、compile/target SDK 36。

## 已通过的本地验证

| 检查 | 结果 |
|---|---|
| 现有 JavaScript 测试 | 通过：数学、文档、目录、对比、链接、生命周期及渲染安全 |
| 安卓平台模型测试 | 通过：保存失败、源文件冲突、并发输入、重复保存、草稿及 URI 输入验证 |
| 消息桥测试 | 通过：乱序回复对应、失败传播、无效回复及重复回复处理 |
| 完整前端集成测试 | 通过：使用实际打包代码，在 JSDOM 中验证渲染、高亮、搜索、编辑、草稿、冲突取消及覆盖保存 |
| 安卓图片适配测试 | 通过：相对路径、安卓绝对路径、file URI、缺失图片提示及临时地址回收 |
| Debug APK / 测试 APK 构建 | 通过 |
| 固定签名 Release APK 构建 | 通过 |
| APK 签名校验 | Debug 与 Release 均通过 apksigner 验证，签名证书相同 |
| Android Lint | 通过，无错误；仍有固定依赖版本、WebView 特性保护识别、JavaScript 启用、资源及备份配置等警告 |
| 桌面构建 | 通过；Neutralino 打包时仍输出 Linux ELF `.note` 节提示，Windows 产物成功生成 |

完整前端集成测试使用模拟文件提供者，不能代替真实 Android 文件授权与输入法测试。原生 instrumentation 已在本设备执行，3 项全部通过。

本次发布候选包：`android/app/build/outputs/apk/release/app-release.apk`。

```text
APK SHA-256:
AA2839A4A0653A3ED90D4F9973C8B304830B55D264D37451DB2837F0399922BF

Signing certificate SHA-256:
8832adb707c2699d900431e8927c359594ce98a8fe1555e68087d0efb8c523d1
```

签名材料已验证被 Git 忽略。最终 Release 包已通过 `install -r` 覆盖安装，原有全部文件访问授权仍为 allow，启动时出现未保存草稿恢复提示。选择恢复后，5 个标签、测试标记 `UPGRADE-20260912` 和 3 种路径的图片均在发布包实际页面保留，截图为 `release-restored.png`、`release-upgrade-draft.png`。

## 真机状态

已成功执行设备端 shell 命令，读取系统、屏幕与 WebView 信息。专用测试文档已推送至 `/sdcard/Documents/SimpleMDV-Test-20260912`，包括中文目录、图片、公式、流程图、源码、缺失资源、越界链接、大文档和多个复杂流程图；未修改个人文档。

初次安装调试 APK 曾被平板拒绝：

```text
INSTALL_FAILED_USER_RESTRICTED: Install canceled by user
```

此安装限制现已解除，调试 APK 和原生测试 APK 均已实际安装成功，并已完成多次同签名覆盖安装。

已在真机验证：中文首页加载、系统文件选择器授权专用目录、目录与标签恢复、公式、代码高亮、中文路径图片、缺失图片提示、搜索三处匹配、子目录文档与上级图片、复杂流程图渲染。截图保存在 `cache/android-diagnostics/tablet-reading.png`。原生 instrumentation 测试已通过 3 项：独立恢复快照、未授权 URI 拒绝和目录越界拒绝。

根据用户追加要求，已增加可选的全部文件访问权限及共享存储读取通道。用户解锁并授权后，已确认 `MANAGE_EXTERNAL_STORAGE: allow`；相对路径、`/sdcard/...` 绝对路径和 `file:///sdcard/...` 的 3 张图片均在实际 WebView 加载成功（600 × 150），使用受控读取后生成的 blob 地址。

| 真机场景 | 结果与证据（位于 cache/android-diagnostics/） |
|---|---|
| 阅读、数学、代码、搜索、子目录链接 | 页面自动操作 15 项通过，`device-scenarios.json` |
| 全部文件权限图片 | 3 种路径均成功，`image-scenarios-final.json` |
| 编辑、外部修改冲突、取消及覆盖保存 | 保留草稿，保存后重新读取源文件核对一致，`device-scenarios.json` |
| 系统选择器另存 | `SaveAs-fixed.md` 名称正确，回读文本与编辑器内容完全一致，`save-as-fixed.json` |
| 进程重建 | 强行停止后重新启动提示恢复；恢复后测试草稿仍在 |
| 横竖屏 | 813 × 1169、1219 × 762 CSS 像素，草稿和图片保留，页面无整体横向溢出，`layout-offline.json` |
| 系统半屏窗口 | 实际系统菜单切换到 605 CSS 像素宽度，侧栏折叠，草稿保留；`split-fixed.json`、`split-fixed.png` |
| 软键盘 | 真实键盘弹出后可视高度缩至 385 CSS 像素，编辑器位于键盘上方，`keyboard.png` |
| 中文输入 | 使用设备输入法候选提交“努”，编辑内容与未保存状态保留，`ime.json`；该输入法在原生候选区组合，未观察到 WebView composition 事件 |
| 飞行模式 | 切断网络后重新渲染，3 张本地图片、公式和流程图正常；测试后恢复原网络与旋转设置 |
| 性能样例 | 68,597 字符、1201 标题：打开 149 ms，渲染 80 ms；8 张各 30 节点流程图：打开 1096 ms，渲染 1080 ms；`performance.json`。单次测量，不代表极限负载 |

本次实际操作发现并修复两处问题：分屏导致 Activity 重建后，排队的桥接消息向已关闭线程池提交任务，引发 `RejectedExecutionException`；现于销毁前关闭消息入口并移除桥接，补充窗口配置处理，实际半屏复测通过。另存时原先统一使用 text/plain 导致系统追加 `.txt`，现根据文件扩展名选择 MIME 类型，已实际复测 `.md` 文件。

另修正切换标签时旧正文短暂保留导致链接使用新文档路径的问题。其他调试断连有系统强行停止、测试结束和覆盖安装记录，不能统一视为应用崩溃。

曾尝试用 ActivityScenario 自动压力测试重建，但本设备的 instrumentation 在 `startActivitySync` 启动阶段超时，尚未执行到测试断言；已移除该不可用试验，使用实际系统窗口切换验证。此限制与修复前已确认的应用崩溃分开记录。

系统文件创建方式参考 [Android 官方文档](https://developer.android.com/training/data-storage/shared/documents-files)。

## 已知限制与待补验收

### 2026-09-12 Mermaid 报错修复补验

用户文档《section 自动注册机制教材.md》第三张流程图采用 C 风格的反斜杠引号转义，Mermaid 原始解析失败。阅读器现在先尝试原文，仅在流程图失败时将该转义转换为 Mermaid 引号实体后重试，不修改文件。启用 `suppressErrorRendering`，无法解析的其他图表在原位置显示可展开的原因与源码，避免错误图插入正文外。改用 SVG 文本标签，防止 HTML 标签被安全净化移除后只剩空图框。

实际文档验证：3 张图均有 SVG 及文本标签，错误面板 0，正文外 Mermaid 错误节点 0；截图和结果为 `mermaid-document-fixed.png/json`。修复后的固定签名发布包已覆盖安装，原文件再次读取后逐字节比较一致。新增真实 Mermaid 解析、错误 DOM 清理、兼容重试、局部失败及错误文本净化测试；安卓测试、安全渲染测试和 Debug Lint 通过。

配置依据：[Mermaid 错误图控制](https://mermaid.js.org/config/schema-docs/config-properties-suppresserrorrendering.html)。

- 其他 Android 版本、其他设备、第三方或云端 DocumentsProvider 尚未验证。
- 真机只读文件、真实写入失败、撤销已有授权后的完整交互尚未覆盖；保存失败与冲突保留草稿已有模型测试，未授权 URI 与目录越界已有原生测试。
- 已验证系统半屏窗口切换；分屏比例连续拖动、第二应用组合和所有返回键交互尚未形成完整测试矩阵。
- 现有桌面自动测试和构建通过，桌面原生窗口打开、渲染及保存的手动回归尚未执行。
- 权限仍受系统边界限制，Android/data、Android/obb 及其他应用私有目录不开放；远程图片需要网络，Windows 本机路径不能映射为平板文件。
- 本交付为已在指定设备完成上述验证的首版候选包，不能将此记录理解为原计划全部场景均已验收完成。
