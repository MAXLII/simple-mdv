package com.maxli.simplemarkdownviewer

import android.content.Context
import android.net.Uri
import android.util.AtomicFile
import android.util.Base64
import androidx.documentfile.provider.DocumentFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction

// Entity: authorized document references and durable recovery snapshots.
// Prior: providers may revoke grants or fail writes; drafts survive these failures.
// Time: callers serialize operations; a save checks the source immediately before writing.
class DocumentStore(private val context: Context, recoveryFile: File = File(context.filesDir, "session.json")) {
    private val resolver = context.contentResolver
    private val session = AtomicFile(recoveryFile)
    val shared = SharedStorage()

    fun ref(uri: Uri, root: String = "", segments: List<String> = emptyList()): JSONObject {
        shared.fromDocument(uri)?.let { return it }
        val file = if (segments.isEmpty() && root.isNotEmpty()) DocumentFile.fromTreeUri(context, uri)
                   else DocumentFile.fromSingleUri(context, uri)
        require(file != null && file.exists()) { "文件不存在或授权已失效，请重新选择文件夹" }
        return JSONObject().put("id", uri.toString()).put("name", file.name ?: "未命名")
            .put("writable", file.canWrite()).put("directory", file.isDirectory)
            .put("root", root).put("segments", JSONArray(segments))
    }

    private fun parts(ref: JSONObject): List<String> {
        val array = ref.optJSONArray("segments") ?: JSONArray()
        return (0 until array.length()).map { array.getString(it) }
    }

    private fun tree(root: String): DocumentFile {
        require(resolver.persistedUriPermissions.any { it.uri.toString() == root && it.isReadPermission }) {
            "文件夹授权已失效，请重新授权"
        }
        return DocumentFile.fromTreeUri(context, Uri.parse(root)) ?: error("无法访问文件夹")
    }

    private fun walk(root: String, segments: List<String>): DocumentFile {
        require(segments.size <= 100 && segments.none { it.isEmpty() || it == "." || it == ".." || it.contains('/') || it.contains('\\') }) {
            "无效路径或超出授权目录"
        }
        var current = tree(root)
        for (segment in segments) current = current.findFile(segment) ?: error("文件不存在：$segment")
        return current
    }

    private fun uri(ref: JSONObject): Uri {
        val root = ref.optString("root")
        if (root.isNotEmpty()) return walk(root, parts(ref)).uri
        val uri = Uri.parse(ref.getString("id"))
        require(uri.scheme == "content") { "仅支持系统授权的文档" }
        require(resolver.persistedUriPermissions.any { it.uri == uri && it.isReadPermission }) {
            "文件授权已失效，请重新打开文件"
        }
        return uri
    }

    fun list(ref: JSONObject): JSONArray {
        if (shared.isLocal(ref)) return shared.list(ref)
        val root = ref.getString("root")
        val path = parts(ref)
        val files = walk(root, path).listFiles()
        require(files.size <= 10000) { "目录超过 10000 项，请选择更小的子目录" }
        return JSONArray(files.sortedWith(compareBy<DocumentFile> { !it.isDirectory }.thenBy { it.name?.lowercase() })
            .map { this.ref(it.uri, root, path + (it.name ?: error("文件缺少名称"))) })
    }

    private fun bytes(ref: JSONObject, limit: Int): ByteArray =
        (if (shared.isLocal(ref)) shared.file(ref).inputStream() else resolver.openInputStream(uri(ref)))?.use {
        val output = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(16384)
        while (output.size() <= limit) {
            val count = it.read(buffer, 0, minOf(buffer.size, limit + 1 - output.size()))
            if (count < 0) break
            output.write(buffer, 0, count)
        }
        val bytes = output.toByteArray()
        require(bytes.size <= limit) { "文件过大，超过 ${limit / 1024 / 1024} MB 限制" }
        bytes
    } ?: error("无法读取文件")

    fun read(ref: JSONObject): String = Charsets.UTF_8.newDecoder()
        .onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
        .decode(ByteBuffer.wrap(bytes(ref, 8 * 1024 * 1024))).toString()

    fun binary(ref: JSONObject): String = Base64.encodeToString(bytes(ref, 24 * 1024 * 1024), Base64.NO_WRAP)

    fun resolve(ref: JSONObject, relative: String): JSONObject {
        if (shared.isLocal(ref)) return shared.resolve(ref, relative)
        shared.fromDocument(Uri.parse(ref.getString("id")))?.let { return shared.resolve(it, relative) }
        val root = ref.optString("root")
        require(root.isNotEmpty()) { "请先打开所在文件夹，以访问关联图片和文档" }
        require(!relative.startsWith('/') && !relative.contains('\\') && !Regex("^[a-zA-Z][a-zA-Z0-9+.-]*:").containsMatchIn(relative)) {
            "不允许访问授权目录以外的路径"
        }
        val path = parts(ref).dropLast(1).toMutableList()
        for (part in relative.split('/')) when (part) {
            "", "." -> Unit
            ".." -> { require(path.isNotEmpty()) { "不允许超出授权目录" }; path.removeAt(path.lastIndex) }
            else -> { require(!part.contains('\u0000')) { "无效文件名" }; path.add(part) }
        }
        return this.ref(walk(root, path).uri, root, path)
    }

    fun write(ref: JSONObject, content: String, expected: String?, force: Boolean): JSONObject {
        require(content.toByteArray(Charsets.UTF_8).size <= 8 * 1024 * 1024) { "文档超过 8 MB 保存限制" }
        if (!force && expected != null && read(ref) != expected) return JSONObject().put("conflict", true)
        if (shared.isLocal(ref)) {
            val file = shared.file(ref)
            require(file.canWrite()) { "文件只读，请另存为" }
            file.outputStream().use { it.write(content.toByteArray(Charsets.UTF_8)); it.flush(); it.fd.sync() }
        } else {
            val uri = uri(ref)
            require(DocumentFile.fromSingleUri(context, uri)?.canWrite() == true) { "文件只读，请另存为" }
            resolver.openOutputStream(uri, "wt")?.use { it.write(content.toByteArray(Charsets.UTF_8)); it.flush() }
                ?: error("无法写入，请重试或另存为；恢复草稿已保留")
        }
        require(read(ref) == content) { "写入后校验失败；请另存为，恢复草稿已保留" }
        return JSONObject().put("conflict", false).put("saved", true)
    }

    fun loadSession(): JSONObject = try {
        session.openRead().use { JSONObject(it.readBytes().toString(Charsets.UTF_8)) }
    } catch (_: java.io.FileNotFoundException) { JSONObject() }

    fun saveSession(value: JSONObject): Boolean {
        val bytes = value.toString().toByteArray(Charsets.UTF_8)
        require(bytes.size <= 48 * 1024 * 1024) { "草稿总量超过 48 MB，请先保存部分文档" }
        val stream = session.startWrite()
        try { stream.write(bytes); session.finishWrite(stream) }
        catch (error: Exception) { session.failWrite(stream); throw error }
        return true
    }
}
