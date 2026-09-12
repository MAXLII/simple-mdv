# 公式排版修复验证

2026-09-12。用户报告 four-leg-three-level-npc-zh.md 第 2.1 节上下标、横线错位。

原因：Marked 提前生成 KaTeX HTML，随后正文 DOMPurify 的禁止 style 属性规则移除了公式定位样式，并因仅允许 HTML profile 丢失 MathML。

修复：共享扩展保留原来的数学 tokenizer，但输出编码的公式占位符。正文先净化，再由本地 KaTeX 以 trust:false 生成排版与 MathML；不允许用户 HTML 保留任意样式。不修改用户 Markdown。桌面和安卓均采用同一流程。

验证：新增真实 KaTeX 对比测试，逐项比较行内横线/下标和块级分式的输出，确认定位属性完整、MathML 存在、恶意 HTML 与不可信公式命令未获准。现有桌面、安卓及渲染安全测试通过。Windows 原生窗口打开用户指定文件，定位第 2.1 节确认原截图段落已正常排列。原文 SHA-256：47564B54066A7656FC57002033F4B10C756B53760A5431367A5E47A3541CA33E。

产物：
- dist/SimpleMarkdownViewerSetup-1.4.1.exe，SHA-256：F275B5516079F5F435E7A60FAF6F91846191CF58A86B89759AE1E1B6CCB61A5B。
- android/app/build/outputs/apk/release/app-release.apk，SHA-256：FDBDAECCAE295075FE96267227CCB0585A0A0755A951EA0D015D7951A7D6A7E1。

本次未修改系统安装目录。平板当前未连接，安卓新包尚未安装或完成这次修复的真机验收。
