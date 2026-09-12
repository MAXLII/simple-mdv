# Simple Markdown Viewer 1.5.0

本版本新增简体中文安卓平板阅读器，并修复桌面与安卓共用的公式、流程图排版问题。

## 新增

- 安卓支持本地文件与文件夹、可选全部文件访问、相对图片、多标签、目录、搜索、主题和字号调整。
- 支持轻量编辑、显式保存、另存、保存冲突检测和恢复草稿；宽屏分栏与窄屏抽屉布局。
- 公式、流程图、代码高亮及字体随 APK 打包，本地内容可离线阅读。

## 修复

- KaTeX 上下标、横线和分式因样式过滤发生错位。
- Mermaid 流程图的反斜杠引号兼容、错误图挤占页面、图中文字丢失和自调用箭头出现黑色实心块。
- Windows 打开请求无法清理导致文档反复打开、标签无法关闭。
- Android 分屏切换时的生命周期崩溃，以及另存 Markdown 文件被追加 `.txt` 后缀。

## 下载与升级

- Windows：`SimpleMarkdownViewerSetup-1.5.0.exe`，关闭阅读器后覆盖安装。
- Android：`SimpleMarkdownViewer-1.5.0-android.apk`，沿用已有固定签名，versionCode 从 1 升至 2。
- `SHA256SUMS.txt` 提供两个安装包的 SHA-256。

## 验证与限制

发布前执行桌面和安卓 JavaScript 测试、Windows 安装包构建、Android Release 构建及 Lint。

开发阶段已在 Xiaomi Pad 6S Pro 12.4 / Android 16 上验证文件授权、图片、保存回读、另存、草稿恢复、横竖屏、半屏窗口、离线内容和中文输入。最新公式排版修复已通过共享渲染测试和 Windows 原生窗口验证，但尚未完成该修复及最终 1.5.0 APK 的平板复验。其他设备、系统版本及第三方文档提供者未验证。

Android 最低支持 Android 10；全部文件访问仍受系统保护目录限制。远程图片需要网络。真实只读文件、写入失败及授权撤销的完整真机交互仍待补验。详见 `docs/android-validation.md` 和各修复验证记录。
