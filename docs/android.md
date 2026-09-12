# 安卓平板版

简阅 Markdown 是当前桌面阅读器的安卓版本，采用 Kotlin、Android WebView 和共享的 JavaScript 渲染核心。界面使用简体中文，支持本地 Markdown、文本和源码阅读，以及轻量编辑。

## 构建

Windows 下在仓库根目录执行：

```powershell
python scripts/prepare-android.py
python scripts/prepare-android-signing.py
npm run build:android
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-android.ps1 -Tests
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-android.ps1 -Variant Release
```

构建工具放在被 Git 忽略的 `cache/android-tools/`，不修改全局 PATH。SDK Manager 下载时接受开发所需的 Android SDK 许可。构建组合固定为 JDK 17、Gradle 8.13、Android Gradle Plugin 8.11.1、Kotlin 2.1.20、Android API 36 与 Build Tools 35.0.0。最低系统版本为 Android 10；WebView 必须支持安全消息监听及 Chrome 100 对应的前端语法，过旧时需更新系统 WebView。

APK 输出：

- 调试包：`android/app/build/outputs/apk/debug/app-debug.apk`
- 日常使用包：`android/app/build/outputs/apk/release/app-release.apk`
- 原生测试包：`android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk`

应用 ID 为 `com.maxli.simplemarkdownviewer`，名称为“简阅 Markdown”。调试包开放 WebView 调试，发布包关闭。生成本地签名后，两种构建使用同一固定签名，可直接覆盖升级。

**请安全备份 `android/signing/` 整个目录。** 密钥与密码不进入 Git，不出现在构建日志中；丢失后无法对已安装应用进行同签名升级。没有生成本地签名时，调试构建使用工具链默认签名，发布构建没有可分发签名。

## 使用

1. 点击“打开文件夹”，在系统文件选择器中选择一个文档目录并允许访问。也可以单独打开文档。
   如果需要浏览内部共享存储或读取目录之外的关联图片，点击顶部“全部文件访问”，在安卓设置中允许管理所有文件。授权后按钮变为“浏览内部存储”。这是 Android 11 及以上的可选功能；不授权仍可使用文件夹模式。
2. 从左侧文件树打开文件。相对图片和文档链接在所授权目录内解析；单独打开文件不能自动获得相邻文件的访问权限。
3. 使用大纲、搜索、标签、字号和主题按钮阅读。较窄窗口自动使用抽屉侧栏；宽屏编辑时并列显示预览。
4. 点击“编辑”修改文本，再点击“保存”。只读文件可使用“另存”。写入成功后会回读校验。
5. 草稿自动保存在应用私有目录，**自动保留草稿不等于保存源文件**。恢复时可选择继续编辑或放弃草稿。

本地图片、公式、流程图和字体随应用资源或文档目录提供，无需联网；远程图片需要 HTTPS 网络访问。外部网页由系统浏览器打开。

开启全部文件访问后，内部存储中的相对图片、`/storage/emulated/0/...`、`/sdcard/...` 和 `file:///...` 图片路径可以通过原生层读取，再转换为临时图片地址展示。Windows 盘符路径不能自动映射到安卓；图片本身必须已复制到平板。系统仍限制其他应用的 `Android/data`、`Android/obb` 及私有数据，应用不会绕过这些限制。

## 接口与保存语义

`platform/android.js` 将异步文件选择、目录、文本读写、二进制读取、相对链接解析及会话操作映射到原生宿主。请求具有 ID 和超时，回复按 ID 对应。桌面系统初始化保留在 `platform/desktop.js`。

文档引用携带不透明 `id`、显示名称 `name`、可写标记 `writable`、授权目录 `root` 及相对路径段 `segments`。原生层重新验证授权并逐级解析路径，不直接信任网页传入的绝对路径。平台间共享渲染逻辑，不共享 Windows 路径处理。

全部文件模式由 `SharedStorage` 处理：每次文件操作检查系统授权，使用规范化后的实际路径约束访问范围；只允许内部共享存储，排除应用私有目录。旧的系统文件选择器引用可在获得广泛权限后解析关联图片，不要求重新导入文档。

编辑模型分别保存当前内容、上次源文件基线和正在写入的快照。外部修改会触发冲突提示；保存期间的新输入继续保持未保存状态。写入失败不会清除草稿。系统文档提供者不保证原子覆盖，源文件可能在失败写入时发生变化，因此恢复草稿和另存功能是必要的恢复路径。

会话采用原生 `AtomicFile` 持久化。输入停止约 350 ms、切换标签和进入后台时保存草稿；异常终止可恢复最后一次已持久化的快照，不能保证恢复进程被立即终止前尚未写入的最后输入。

资源边界：同时最多 12 个标签；单个文本文件及保存内容最多 8 MB；单张本地图片最多 24 MB；草稿会话最多 48 MB；单次目录枚举最多 10000 项。达到限制会报告错误，不能将错误当作保存成功。

## 测试

```powershell
npm test
npm run test:android
npm run build:app
node scripts/create-android-fixtures.js
```

真机测试文档生成在 `cache/android-test-fixtures/`。只将该专用目录推送到平板，不操作个人文档。`scripts/android-device-check.mjs` 通过调试包的 WebView 调试端口读取页面或执行验收脚本；默认设备序列号对应本次平板，也可用 `ANDROID_SERIAL` 环境变量指定。

首版不提供账号、云同步、PDF 导出、文档对比、外部文件实时监听、文件删除或应用商店发布。

技术依据：[本地 WebView 内容](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content)、[系统文档访问](https://developer.android.com/training/data-storage/shared/documents-files)、[AndroidX 返回导航](https://developer.android.com/guide/navigation/custom-back)、[AGP 8.11 兼容要求](https://developer.android.com/build/releases/agp-8-11-0-release-notes)。
