package com.maxli.simplemarkdownviewer

import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Build
import android.provider.Settings
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.TextView
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import org.json.JSONObject
import java.util.concurrent.Executors

class MainActivity : ComponentActivity() {
    private lateinit var web: WebView
    private lateinit var store: DocumentStore
    private val worker = Executors.newSingleThreadExecutor()
    private var picker: ((Any?, String?) -> Unit)? = null
    private var pickerKind = ""
    private var paused = false
    private var disposed = false
    private val origin = "https://appassets.androidplatform.net"

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        store = DocumentStore(this)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (::web.isInitialized) web.evaluateJavascript("window.androidApp?.back()", null) else finish()
            }
        })
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            setContentView(TextView(this).apply { text = "请更新 Android System WebView 后重新打开应用" })
            return
        }
        web = WebView(this)
        val container = FrameLayout(this).apply { setBackgroundColor(Color.WHITE); addView(web) }
        container.setOnApplyWindowInsetsListener { view, insets ->
            @Suppress("DEPRECATION")
            view.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop,
                insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
            insets
        }
        setContentView(container)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            setSupportMultipleWindows(false)
            mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            builtInZoomControls = false
        }
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this)).build()
        web.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                return loader.shouldInterceptRequest(request.url)
            }
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.isForMainFrame) return true
                return request.url.scheme != "https"
            }
            override fun onPageFinished(view: WebView, url: String) {
                view.evaluateJavascript("window.dispatchEvent(new Event('native-ready'))", null)
            }
        }
        web.webChromeClient = WebChromeClient()
        WebViewCompat.addWebMessageListener(web, "NativeBridge", setOf(origin)) { _, message, source, mainFrame, reply ->
            if (disposed || isDestroyed || !mainFrame || source.toString().trimEnd('/') != origin) return@addWebMessageListener
            val request = try { JSONObject(message.data ?: "") } catch (_: Exception) { return@addWebMessageListener }
            val id = request.optString("id")
            val respond: (Any?, String?) -> Unit = { value, error ->
                val response = JSONObject().put("id", id)
                if (error == null) response.put("result", value ?: JSONObject.NULL) else response.put("error", error)
                runOnUiThread { if (!disposed && !isDestroyed) reply.postMessage(response.toString()) }
            }
            val args = request.optJSONObject("args") ?: JSONObject()
            when (val method = request.optString("method")) {
                "requestAllFiles" -> try {
                    require(Build.VERSION.SDK_INT >= 30) { "此系统请使用“打开文件夹”授权" }
                    startActivity(Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:$packageName")))
                    respond(true, null)
                } catch (error: Exception) { respond(null, error.message) }
                "pickFile", "pickFolder", "createFile" -> launchPicker(method, args, respond)
                "openExternal" -> try {
                    val uri = Uri.parse(args.getString("url"))
                    require(uri.scheme in listOf("https", "http", "mailto")) { "不支持的外部链接" }
                    startActivity(Intent(Intent.ACTION_VIEW, uri)); respond(true, null)
                } catch (error: Exception) { respond(null, error.message) }
                "finish" -> { respond(true, null); finish() }
                else -> worker.execute {
                    try {
                        val result: Any = when (method) {
                            "storageStatus" -> JSONObject().put("allFiles", store.shared.available())
                            "storageRoot" -> store.shared.root()
                            "list" -> store.list(args.getJSONObject("ref"))
                            "read" -> store.read(args.getJSONObject("ref"))
                            "binary" -> store.binary(args.getJSONObject("ref"))
                            "resolve" -> store.resolve(args.getJSONObject("ref"), args.getString("relative"))
                            "write" -> store.write(args.getJSONObject("ref"), args.getString("content"),
                                if (args.has("expected")) args.getString("expected") else null, args.optBoolean("force"))
                            "loadSession" -> store.loadSession()
                            "saveSession" -> store.saveSession(args.getJSONObject("session"))
                            else -> error("未知平台操作")
                        }
                        respond(result, null)
                    } catch (error: Exception) { respond(null, error.message ?: "操作失败") }
                }
            }
        }
        web.loadUrl("$origin/assets/index.html")
    }

    private fun launchPicker(kind: String, args: JSONObject, callback: (Any?, String?) -> Unit) {
        if (picker != null) { callback(null, "文件选择器已打开"); return }
        picker = callback
        pickerKind = kind
        val intent = when (kind) {
            "pickFolder" -> Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
            "createFile" -> Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                val name = args.optString("name", "文档.md")
                val extension = name.substringAfterLast('.', "").lowercase(java.util.Locale.ROOT)
                type = if (extension in setOf("md", "markdown")) "text/markdown"
                    else android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension)
                        ?: "application/octet-stream"
                addCategory(Intent.CATEGORY_OPENABLE)
                putExtra(Intent.EXTRA_TITLE, name)
            }
            else -> Intent(Intent.ACTION_OPEN_DOCUMENT).apply { type = "*/*"; addCategory(Intent.CATEGORY_OPENABLE) }
        }.apply {
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION or Intent.FLAG_GRANT_PREFIX_URI_PERMISSION)
        }
        try { startActivityForResult(intent, 100) }
        catch (error: Exception) { picker = null; callback(null, error.message) }
    }

    @Deprecated("Platform picker result")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != 100) return
        val callback = picker ?: return
        picker = null
        val uri = data?.data
        if (resultCode != RESULT_OK || uri == null) { callback(null, null); return }
        try {
            if (data.flags and Intent.FLAG_GRANT_WRITE_URI_PERMISSION != 0) {
                contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            } else {
                contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            callback(store.ref(uri, if (pickerKind == "pickFolder") uri.toString() else ""), null)
        } catch (error: Exception) { callback(null, "无法保留文件授权：${error.message}") }
    }

    override fun onPause() {
        paused = true
        if (::web.isInitialized) web.evaluateJavascript("window.androidApp?.checkpoint()", null)
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        if (paused && ::web.isInitialized) web.evaluateJavascript("window.dispatchEvent(new Event('native-resume'))", null)
        paused = false
    }

    override fun onDestroy() {
        // WebView messages may already be queued when a window is recreated.
        // Close admission before removing the bridge and stopping its executor.
        disposed = true
        if (::web.isInitialized) {
            if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
                WebViewCompat.removeWebMessageListener(web, "NativeBridge")
            }
            web.destroy()
        }
        worker.shutdown()
        super.onDestroy()
    }
}
