# Simple Markdown Viewer 1.5.1

本版本修复 LaTeX 行内公式显示为源码的问题，提供 Windows 安装包。

## 修复

- 支持 `\(...\)` 行内公式，正确渲染矩阵、上下标、希腊字母及其他 LaTeX 表达式。
- 保持 `$...$` 行内公式和 `\[...\]` 块级公式兼容；代码示例、HTML 属性、转义及未闭合分隔符不会被误识别为公式。
- 继续保留 HTML 清理和 KaTeX 不可信命令限制。

## 下载与升级

- Windows：`SimpleMarkdownViewerSetup-1.5.1.exe`，关闭阅读器后覆盖安装。
- `SHA256SUMS.txt` 提供安装包的 SHA-256。
- 本次不提供新版 Android APK；Android 用户可继续使用 1.5.0。

## 验证与限制

通过 JavaScript 自动化测试及 Windows 安装包构建；公式回归覆盖截图中的电感表达式、矩阵及变量。尚未完成最终安装包的安装交互和桌面窗口目视复验。
