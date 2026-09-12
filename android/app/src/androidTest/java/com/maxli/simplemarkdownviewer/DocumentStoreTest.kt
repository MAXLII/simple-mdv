package com.maxli.simplemarkdownviewer

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.json.JSONArray
import org.json.JSONObject

@RunWith(AndroidJUnit4::class)
class DocumentStoreTest {
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    @Test
    fun testRecoverySnapshotRoundTrip() {
        // Instrumentation runs with the target UID; isolate the snapshot in its test cache.
        val context = instrumentation.targetContext
        val store = DocumentStore(context, java.io.File(context.cacheDir, "instrumentation-recovery.json"))
        val session = JSONObject().put("version", 1).put("tabs", JSONArray().put(
            JSONObject().put("draft", "中文草稿\n未保存").put("baseline", "源文件")))
        assertTrue(store.saveSession(session))
        assertEquals("中文草稿\n未保存", store.loadSession().getJSONArray("tabs").getJSONObject(0).getString("draft"))
        assertTrue(store.saveSession(JSONObject().put("tabs", JSONArray())))
        assertEquals(0, store.loadSession().getJSONArray("tabs").length())
    }

    @Test fun testArbitraryUrisAreRejected() {
        val store = DocumentStore(instrumentation.context)
        for (id in listOf("file:///data/data/private", "content://unknown.provider/private")) {
            try { store.read(JSONObject().put("id", id)); fail("Unauthorized URI accepted") }
            catch (_: IllegalArgumentException) { }
        }
    }

    @Test fun testTraversalAndUnselectedRootsAreRejected() {
        val store = DocumentStore(instrumentation.context)
        val ref = JSONObject().put("id", "content://unknown/document/a")
            .put("root", "content://unknown/tree/root").put("segments", JSONArray().put("a.md"))
        for (relative in listOf("../private.md", "/private.md", "content://unknown/b", "..\\private.md")) {
            try { store.resolve(ref, relative); fail("Invalid path accepted") }
            catch (_: IllegalArgumentException) { }
        }
        try { store.list(ref); fail("Unselected root accepted") }
        catch (_: IllegalArgumentException) { }
    }
}
