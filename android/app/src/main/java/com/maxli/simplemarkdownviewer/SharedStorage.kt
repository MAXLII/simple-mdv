package com.maxli.simplemarkdownviewer

import android.os.Build
import android.os.Environment
import android.net.Uri
import android.provider.DocumentsContract
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

// Broad access is opt-in through Android settings, never a replacement for OS checks.
// Canonical paths remain confined to shared storage; app-private directories are excluded.
class SharedStorage {
    @Suppress("DEPRECATION")
    private val base get() = Environment.getExternalStorageDirectory().canonicalFile
    fun available() = Build.VERSION.SDK_INT >= 30 && Environment.isExternalStorageManager()
    fun isLocal(ref: JSONObject) = ref.optString("id").startsWith("file:")

    fun checked(file: File): File {
        require(available()) { "请先开启“全部文件访问”权限" }
        val canonical = file.canonicalFile
        require(canonical == base || canonical.path.startsWith(base.path + File.separator)) { "不允许访问共享存储以外的目录" }
        val relative = canonical.relativeTo(base).invariantSeparatorsPath
        require(relative != "Android/data" && !relative.startsWith("Android/data/") &&
            relative != "Android/obb" && !relative.startsWith("Android/obb/")) { "安卓仍然保护其他应用的私有目录" }
        return canonical
    }

    fun file(ref: JSONObject) = checked(File(Uri.parse(ref.getString("id")).path ?: error("无效文件路径")))

    fun ref(file: File): JSONObject {
        val current = checked(file)
        require(current.exists() && current.canRead()) { "文件不存在或系统不允许读取" }
        val parts = current.relativeTo(base).invariantSeparatorsPath.split('/').filter { it.isNotEmpty() }
        return JSONObject().put("id", Uri.fromFile(current).toString()).put("name", if (current == base) "内部共享存储" else current.name)
            .put("writable", current.canWrite()).put("directory", current.isDirectory)
            .put("root", Uri.fromFile(base).toString()).put("segments", JSONArray(parts))
    }

    fun root() = ref(base)

    fun fromDocument(uri: Uri): JSONObject? {
        if (!available() || uri.authority != "com.android.externalstorage.documents") return null
        val id = if (DocumentsContract.isTreeUri(uri) && !uri.path.orEmpty().contains("/document/"))
            DocumentsContract.getTreeDocumentId(uri) else DocumentsContract.getDocumentId(uri)
        if (!id.startsWith("primary:")) return null
        return ref(File(base, id.removePrefix("primary:")))
    }

    fun resolve(document: JSONObject, relative: String): JSONObject {
        val normalized = relative.replace('\\', '/')
        val target = when {
            normalized.startsWith("file:") -> File(Uri.parse(normalized).path ?: error("无效图片路径"))
            normalized.startsWith('/') -> File(normalized)
            Regex("^[a-zA-Z][a-zA-Z0-9+.-]*:").containsMatchIn(normalized) -> error("图片链接不是安卓本地文件路径")
            else -> File(file(document).parentFile, normalized)
        }
        return ref(target)
    }

    fun list(document: JSONObject): JSONArray {
        val entries = file(document).listFiles() ?: error("系统不允许读取此目录")
        require(entries.size <= 10000) { "目录过大，请选择更小的子目录" }
        return JSONArray(entries.sortedWith(compareBy<File> { !it.isDirectory }.thenBy { it.name.lowercase() })
            .mapNotNull { try { ref(it) } catch (_: IllegalArgumentException) { null } })
    }
}
