# Windows Mermaid 修复验证

日期：2026-09-12。版本保持 1.4.1，未提交或推送。

- Windows 的 Markdown 文件关联指向 `C:\Users\76475\AppData\Local\Programs\Simple Markdown Viewer\simple-markdown-viewer.exe`，其运行时尚未更新。
- 执行 `npm test` 全部通过，`npm run build` 成功生成嵌入资源运行时及安装包。
- 直接运行工作区内 `dist/installer-payload/simple-markdown-viewer-runtime.exe`，通过启动参数打开用户指定的 `D:\OneDrive\LWX\Book\section 自动注册机制教材.md`。
- 在实际 Windows 原生窗口确认正文加载、目录导航，以及第十节第三张流程图和文字显示正常；不再出现正文外的 Mermaid 错误图。
- 原文打开前后 SHA-256 一致：`08FF30DE4C975EEB898AC19A0357EA4E19AFE995DC7F3AA7F90CE052B0952F40`。
- 安装包：`dist/SimpleMarkdownViewerSetup-1.4.1.exe`，SHA-256：`A14E8594CA5385E7F956FA0CE0041A51242CFE433AF9A814196DDEC282388BA0`。
- 新运行时 SHA-256：`55B4C49E0A607E1AA0923E045CB517FC5023DDC3E431673B054FD07395144EE3`。
- 已安装旧运行时 SHA-256：`6DC5CB2D34D987F4098CA6CD84DFF078467F351794CD2D2981B575A994DA9DE1`。

安装目录位于工作区外，尚未替换。需取得用户对该具体路径更新的确认；届时先保留旧运行时备份，再替换并验证文件关联启动。当前打开的修复版窗口来自工作区构建目录。
