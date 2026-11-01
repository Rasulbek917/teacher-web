package uz.teacherweb.mobile

import android.app.Activity
import android.os.Bundle
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.graphics.Color as AndroidColor
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.Crossfade
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.scaleIn
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import java.net.HttpURLConnection
import java.net.URL

private val Ink = Color(0xFF15213B)
private val Brand = Color(0xFF5147E8)
private val Canvas = Color(0xFFF4F6FB)
private val Muted = Color(0xFF74809A)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = AndroidColor.rgb(244, 246, 251)
        window.navigationBarColor = AndroidColor.rgb(255, 255, 255)
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
        setContent { TeacherWebNativeApp() }
    }
}

private object MobileApi {
    private fun readResponse(connection: HttpURLConnection): JSONObject {
        val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream
        val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
        val result = if (text.isBlank()) JSONObject() else JSONObject(text)
        if (connection.responseCode !in 200..299 || !result.optBoolean("ok", true)) {
            throw IllegalStateException(result.optString("error").ifBlank { "Serverga ulanib bo‘lmadi." })
        }
        return result
    }

    fun request(context: Context, token: String?, path: String, body: JSONObject? = null): JSONObject {
        val root = context.getString(R.string.server_url).trimEnd('/')
        val connection = (URL("$root/api/mobile/$path").openConnection() as HttpURLConnection).apply {
            requestMethod = if (body == null) "GET" else "POST"
            connectTimeout = 15_000
            readTimeout = 60_000
            setRequestProperty("Accept", "application/json")
            if (!token.isNullOrBlank()) setRequestProperty("Authorization", "Bearer $token")
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }
        }
        try {
            if (body != null) connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            return readResponse(connection)
        } finally {
            connection.disconnect()
        }
    }

    fun download(context: Context, token: String, url: String): ByteArray? {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 15_000
            readTimeout = 30_000
            useCaches = false
            setRequestProperty("Authorization", "Bearer $token")
        }
        return try {
            if (connection.responseCode == 200) connection.inputStream.use { it.readBytes() } else null
        } finally {
            connection.disconnect()
        }
    }

    private fun avatarBytes(context: Context, uri: Uri): ByteArray {
        val resolver = context.contentResolver
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw IllegalStateException("Rasmni o‘qib bo‘lmadi.")
        var sample = 1
        while (bounds.outWidth / sample > 1600 || bounds.outHeight / sample > 1600) sample *= 2
        val options = BitmapFactory.Options().apply { inSampleSize = sample }
        val bitmap = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) }
            ?: throw IllegalStateException("Rasmni o‘qib bo‘lmadi.")
        val orientation = runCatching {
            resolver.openInputStream(uri)?.use {
                ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
            } ?: ExifInterface.ORIENTATION_NORMAL
        }.getOrDefault(ExifInterface.ORIENTATION_NORMAL)
        val matrix = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
            ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
            ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.postScale(-1f, 1f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.postScale(1f, -1f)
        }
        val oriented = if (matrix.isIdentity) bitmap else Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
        return ByteArrayOutputStream().use { output ->
            oriented.compress(Bitmap.CompressFormat.JPEG, 88, output)
            output.toByteArray()
        }
    }

    fun uploadAvatar(context: Context, token: String, uri: Uri): JSONObject {
        val root = context.getString(R.string.server_url).trimEnd('/')
        val bytes = avatarBytes(context, uri)
        if (bytes.size > 5 * 1024 * 1024) throw IllegalStateException("Rasm hajmi 5 MB dan oshmasin.")
        val boundary = "----TeacherWeb${System.currentTimeMillis()}"
        val connection = (URL("$root/api/mobile/avatar/").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15_000
            readTimeout = 60_000
            doOutput = true
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Authorization", "Bearer $token")
            setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
        }
        try {
            DataOutputStream(connection.outputStream).use { output ->
                fun write(text: String) = output.write(text.toByteArray(Charsets.UTF_8))
                write("--$boundary\r\n")
                write("Content-Disposition: form-data; name=\"avatar\"; filename=\"avatar.jpg\"\r\n")
                write("Content-Type: image/jpeg\r\n\r\n")
                output.write(bytes)
                write("\r\n--$boundary--\r\n")
            }
            return readResponse(connection)
        } finally {
            connection.disconnect()
        }
    }
}

private fun resolveServerUrl(context: Context, url: String): String {
    if (url.startsWith("http://") || url.startsWith("https://")) return url
    val root = context.getString(R.string.server_url).trimEnd('/')
    return root + if (url.startsWith("/")) url else "/$url"
}

private data class AppSection(val id: String, val title: String, val icon: ImageVector)

private val sectionCatalog = listOf(
    AppSection("dashboard", "Bosh sahifa", Icons.Filled.Dashboard),
    AppSection("more", "Bo‘limlar", Icons.Filled.Apps),
    AppSection("groups", "Guruhlar", Icons.Filled.Groups),
    AppSection("teachers", "O‘qituvchilar", Icons.Filled.School),
    AppSection("students", "O‘quvchilar", Icons.Filled.People),
    AppSection("homework", "Uy vazifalari", Icons.Filled.Assignment),
    AppSection("attendance", "Davomat", Icons.Filled.EventAvailable),
    AppSection("grades", "Baholar", Icons.Filled.Grade),
    AppSection("materials", "Materiallar", Icons.Filled.MenuBook),
    AppSection("payments", "To‘lovlar", Icons.Filled.Payments),
    AppSection("tests", "Testlar", Icons.Filled.Quiz),
    AppSection("assistant", "AI yordamchi", Icons.Filled.AutoAwesome),
    AppSection("chats", "Xabarlar", Icons.Filled.Chat),
    AppSection("reviews", "Tekshiruvlar", Icons.Filled.FactCheck),
    AppSection("announcements", "E’lonlar", Icons.Filled.Campaign),
    AppSection("staff", "Boshqaruv", Icons.Filled.Business),
    AppSection("notifications", "Bildirishnomalar", Icons.Filled.Notifications),
    AppSection("settings", "Sozlamalar", Icons.Filled.Settings),
)

private fun sectionOrder(id: String): Int = sectionCatalog.indexOfFirst { it.id == id }.let { if (it < 0) sectionCatalog.size else it }

@Composable
private fun TeacherWebNativeApp() {
    val context = LocalContext.current
    val preferences = remember { context.getSharedPreferences("teacherweb", Context.MODE_PRIVATE) }
    val scope = rememberCoroutineScope()
    var token by remember { mutableStateOf(preferences.getString("token", null)) }
    var user by remember { mutableStateOf<JSONObject?>(null) }
    var sections by remember { mutableStateOf<List<String>>(emptyList()) }
    var active by remember { mutableStateOf("dashboard") }
    var lastContentSection by remember { mutableStateOf("dashboard") }
    var payload by remember { mutableStateOf(JSONObject()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var success by remember { mutableStateOf("") }
    var dialog by remember { mutableStateOf<String?>(null) }
    var selectedRow by remember { mutableStateOf(JSONObject()) }
    var selectedConversation by remember { mutableStateOf<Long?>(null) }
    var selectedGroup by remember { mutableStateOf<Long?>(null) }
    var testAttempt by remember { mutableStateOf<JSONObject?>(null) }
    var bootstrapRetry by remember { mutableIntStateOf(0) }
    var aiSending by remember { mutableStateOf(false) }
    var avatarBitmap by remember { mutableStateOf<ImageBitmap?>(null) }
    var avatarVersion by remember { mutableIntStateOf(0) }
    var avatarUploading by remember { mutableStateOf(false) }

    fun refresh(section: String = active) {
        val auth = token ?: return
        scope.launch {
            loading = true
            error = ""
            try {
                val suffix = when {
                    section == "attendance" && selectedGroup != null -> "?group=$selectedGroup"
                    section == "chats" && selectedConversation != null -> "?conversation=$selectedConversation"
                    section == "assistant" && selectedConversation != null -> "?conversation=$selectedConversation"
                    else -> ""
                }
                val response = withContext(Dispatchers.IO) { MobileApi.request(context, auth, "section/$section/$suffix") }
                payload = response.optJSONObject("data") ?: JSONObject()
            } catch (e: Exception) {
                error = e.message ?: "Ma’lumotni yuklab bo‘lmadi."
            } finally {
                loading = false
            }
        }
    }

    fun doAction(action: String, values: JSONObject, successText: String = "Saqlandi.", onData: (JSONObject) -> Unit = {}) {
        val auth = token ?: return
        val aiAction = action in setOf("send_ai_message", "confirm_ai_action", "cancel_ai_action")
        scope.launch {
            loading = true
            error = ""
            success = ""
            if (aiAction) aiSending = true
            try {
                val body = JSONObject(values.toString()).put("action", action)
                val response = withContext(Dispatchers.IO) { MobileApi.request(context, auth, "action/", body) }
                val data = response.optJSONObject("data") ?: JSONObject()
                if (!aiAction) success = data.optString("message", successText)
                if (action == "start_test") testAttempt = data
                if (action == "update_profile") data.optJSONObject("user")?.let { user = it }
                val relogin = action == "update_profile" && data.optBoolean("relogin")
                if (relogin) {
                    preferences.edit().remove("token").apply()
                    token = null
                    user = null
                }
                if (action == "create_ai_chat" || action == "start_chat") {
                    selectedConversation = data.optLong("id").takeIf { it > 0 }
                }
                onData(data)
                if (action == "logout") {
                    preferences.edit().remove("token").apply()
                    token = null
                    user = null
                }
                if (action != "logout" && !relogin) refresh()
            } catch (e: Exception) {
                error = e.message ?: "Amal bajarilmadi."
            } finally {
                loading = false
                if (aiAction) aiSending = false
            }
        }
    }

    LaunchedEffect(token, bootstrapRetry) {
        val auth = token ?: return@LaunchedEffect
        loading = true
        try {
            val response = withContext(Dispatchers.IO) { MobileApi.request(context, auth, "bootstrap/") }
            val data = response.optJSONObject("data") ?: JSONObject()
            user = data.optJSONObject("user")
            val roleSections = data.optJSONArray("sections") ?: JSONArray()
            sections = (0 until roleSections.length()).mapNotNull { roleSections.optString(it).takeIf(String::isNotBlank) }
            if (active !in sections) active = "dashboard"
        } catch (e: Exception) {
            error = e.message ?: "Hisobni yuklab bo‘lmadi. Internetni tekshirib qayta urinib ko‘ring."
            user = null
        } finally {
            loading = false
        }
    }

    LaunchedEffect(token, active, selectedGroup, selectedConversation) {
        if (token != null && active != "more") refresh(active)
    }

    LaunchedEffect(active) {
        if (active != "more") lastContentSection = active
    }

    LaunchedEffect(token, user?.optString("avatar_url"), avatarVersion) {
        val auth = token
        val url = user?.optString("avatar_url").orEmpty()
        if (auth == null || url.isBlank()) {
            avatarBitmap = null
            return@LaunchedEffect
        }
        val fullUrl = resolveServerUrl(context, url)
        val bytes = withContext(Dispatchers.IO) { runCatching { MobileApi.download(context, auth, fullUrl) }.getOrNull() }
        avatarBitmap = bytes?.let { BitmapFactory.decodeByteArray(it, 0, it.size)?.asImageBitmap() }
    }

    val avatarPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        val auth = token
        if (uri == null || auth == null) return@rememberLauncherForActivityResult
        scope.launch {
            avatarUploading = true
            error = ""
            success = ""
            try {
                val response = withContext(Dispatchers.IO) { MobileApi.uploadAvatar(context, auth, uri) }
                val data = response.optJSONObject("data") ?: JSONObject()
                data.optJSONObject("user")?.let { user = it }
                avatarVersion++
                success = data.optString("message", "Profil rasmi yangilandi.")
                refresh("settings")
            } catch (e: Exception) {
                error = e.message ?: "Rasmni yuklab bo‘lmadi."
            } finally {
                avatarUploading = false
            }
        }
    }

    MaterialTheme(
        colorScheme = lightColorScheme(primary = Brand, background = Canvas, surface = Color.White, onBackground = Ink, onSurface = Ink)
    ) {
        if (token != null && user == null) {
            Box(Modifier.fillMaxSize().background(Canvas), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    if (loading) {
                        CircularProgressIndicator(color = Brand)
                        Spacer(Modifier.height(12.dp)); Text("Hisob yuklanmoqda…", color = Muted)
                    } else {
                        Text("Hisobni ochib bo‘lmadi", color = Ink, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(8.dp)); Text(error.ifBlank { "Internet aloqasini tekshiring." }, color = Muted)
                        Spacer(Modifier.height(16.dp))
                        Button(onClick = { error = ""; bootstrapRetry++ }) { Text("Qayta urinish") }
                        TextButton(onClick = { preferences.edit().remove("token").apply(); token = null; user = null; error = "" }) { Text("Boshqa hisob bilan kirish") }
                    }
                }
            }
        } else if (token == null) {
            LoginScreen(loading, error) { login, password ->
                scope.launch {
                    loading = true
                    error = ""
                    try {
                        val body = JSONObject().put("login", login).put("password", password)
                        val response = withContext(Dispatchers.IO) { MobileApi.request(context, null, "login/", body) }
                        val data = response.optJSONObject("data") ?: JSONObject()
                        val newToken = data.optString("token")
                        if (newToken.isBlank()) error = "Kirish amalga oshmadi."
                        else {
                            preferences.edit().putString("token", newToken).apply()
                            token = newToken
                            user = data.optJSONObject("user")
                        }
                    } catch (e: Exception) {
                        error = e.message ?: "Login yoki parol noto‘g‘ri."
                    } finally {
                        loading = false
                    }
                }
            }
        } else {
            val title = sectionCatalog.firstOrNull { it.id == active }?.title ?: "TeacherWeb"
            Scaffold(
                containerColor = Canvas,
                bottomBar = {
                    NavigationBar(containerColor = Color.White, tonalElevation = 8.dp) {
                        val bottom = listOf("dashboard", "homework", "chats", "more")
                        bottom.forEach { id ->
                            val item = sectionCatalog.first { it.id == id }
                            val selected = (id == "more" && active !in bottom) || active == id
                            NavigationBarItem(
                                selected = selected,
                                onClick = { if (id == "more") active = "more" else { active = id; selectedConversation = null; selectedGroup = null } },
                                icon = {
                                    val iconColor by animateColorAsState(if (selected) Brand else Muted, label = "navigation-icon")
                                    val iconScale by animateFloatAsState(
                                        if (selected) 1.12f else 1f,
                                        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMediumLow),
                                        label = "navigation-scale",
                                    )
                                    Icon(item.icon, contentDescription = item.title, tint = iconColor, modifier = Modifier.scale(iconScale))
                                },
                                label = { Text(if (id == "more") "Bo‘limlar" else item.title, fontSize = 11.sp) },
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = Brand,
                                    selectedTextColor = Brand,
                                    indicatorColor = Brand.copy(alpha = 0.13f),
                                    unselectedIconColor = Muted,
                                    unselectedTextColor = Muted
                                )
                            )
                        }
                    }
                }
            ) { padding ->
                Column(Modifier.fillMaxSize().padding(padding)) {
                    TopBar(title, user!!.optString("name"), avatarBitmap, onLogout = {
                        preferences.edit().remove("token").apply(); token = null; user = null
                    })
                    AnimatedVisibility(visible = loading, enter = fadeIn(tween(120)), exit = fadeOut(tween(180))) {
                        LinearProgressIndicator(Modifier.fillMaxWidth(), color = Brand)
                    }
                    AnimatedVisibility(
                        visible = error.isNotBlank(),
                        enter = fadeIn(tween(160)) + expandVertically(tween(220)),
                        exit = fadeOut(tween(120)) + shrinkVertically(tween(160)),
                    ) { MessageBanner(error, true) { error = "" } }
                    AnimatedVisibility(
                        visible = success.isNotBlank(),
                        enter = fadeIn(tween(160)) + expandVertically(tween(220)),
                        exit = fadeOut(tween(120)) + shrinkVertically(tween(160)),
                    ) { MessageBanner(success, false) { success = "" } }
                    AnimatedContent(
                        targetState = active,
                        modifier = Modifier.weight(1f),
                        transitionSpec = {
                            val forward = sectionOrder(targetState) >= sectionOrder(initialState)
                            (fadeIn(tween(240, easing = FastOutSlowInEasing)) +
                                slideInVertically(tween(260, easing = FastOutSlowInEasing)) { if (forward) it / 12 else -it / 12 })
                                .togetherWith(fadeOut(tween(130)))
                        },
                        label = "section-transition",
                    ) { shownSection ->
                    if (shownSection == "more") {
                        MoreSections(sections, lastContentSection) { active = it; selectedConversation = null; selectedGroup = null }
                    } else if (testAttempt != null) {
                        TestAttemptScreen(testAttempt!!, onSubmit = { answers ->
                            val body = JSONObject().put("attempt_id", testAttempt!!.optInt("attempt_id")).put("answers", answers)
                            doAction("submit_test", body, "Test topshirildi.")
                            testAttempt = null
                        }, onClose = { testAttempt = null })
                    } else if (shownSection == "dashboard") {
                        DashboardScreen(user!!, payload, sections, avatarBitmap) { active = it }
                    } else if (shownSection == "settings") {
                        SettingsScreen(
                            profile = payload.optJSONObject("user") ?: user!!,
                            telegram = payload.optJSONObject("telegram") ?: JSONObject(),
                            avatar = avatarBitmap,
                            uploading = avatarUploading,
                            onEdit = { dialog = "update_profile" },
                            onPickAvatar = { avatarPicker.launch("image/*") },
                            onTelegram = {
                                doAction("telegram_link", JSONObject(), "Telegram havolasi tayyor.") { data ->
                                    val url = data.optString("url")
                                    if (url.isNotBlank()) {
                                        try {
                                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                                        } catch (e: Exception) {
                                            error = "Telegram havolasini ochib bo‘lmadi."
                                        }
                                    }
                                }
                            },
                        )
                    } else if (shownSection == "attendance" && selectedGroup == null && user!!.optString("role") != "STUDENT") {
                        GroupPicker(payload.optJSONArray("groups") ?: JSONArray(), onChoose = { selectedGroup = it }, onAddGroup = { dialog = "create_group" })
                    } else if (shownSection == "chats" && selectedConversation != null) {
                        ChatScreen(payload.optJSONObject("conversation"), payload.optJSONArray("messages") ?: JSONArray(),
                            onBack = { selectedConversation = null }, onSend = { text ->
                                doAction("send_message", JSONObject().put("conversation_id", selectedConversation).put("text", text))
                            })
                    } else if (shownSection == "assistant" && selectedConversation != null) {
                        AiChatScreen(payload.optJSONObject("conversation"), payload.optJSONArray("messages") ?: JSONArray(),
                            sending = aiSending,
                            onBack = { selectedConversation = null },
                            onSend = { text -> doAction("send_ai_message", JSONObject().put("conversation_id", selectedConversation).put("text", text)) },
                            onConfirm = { doAction("confirm_ai_action", JSONObject().put("conversation_id", selectedConversation)) },
                            onCancel = { doAction("cancel_ai_action", JSONObject().put("conversation_id", selectedConversation)) })
                    } else {
                        SectionScreen(
                            name = shownSection,
                            payload = payload,
                            role = user!!.optString("role"),
                            onItem = { item ->
                                selectedRow = item
                                when (shownSection) {
                                    "chats" -> { selectedConversation = item.optLong("id"); refresh("chats") }
                                    "assistant" -> { selectedConversation = item.optLong("id"); refresh("assistant") }
                                    "notifications" -> doAction("read_notification", JSONObject().put("id", item.optInt("id")))
                                    "grades" -> if (user!!.optString("role") != "STUDENT") dialog = "review_submission"
                                    "homework" -> dialog = if (user!!.optString("role") == "STUDENT") "submit_homework" else "review_list"
                                    "payments" -> if (user!!.optString("role") == "TEACHER") dialog = "mark_paid"
                                    "tests" -> if (user!!.optString("role") == "STUDENT") doAction("start_test", JSONObject().put("share_id", item.optInt("share_id"))) else dialog = "publish_test"
                                    "reviews" -> { active = "grades" }
                                    "students" -> if (user!!.optString("role") in listOf("TEACHER", "STUDENT")) dialog = "start_chat"
                                }
                            },
                            onAdd = { kind -> dialog = kind },
                            onManageItem = { actionName, item ->
                                selectedRow = item
                                if (actionName == "rename_ai_chat" || actionName == "delete_ai_chat") dialog = actionName
                                else doAction(actionName, JSONObject().put("conversation_id", item.optLong("id")))
                            },
                            onGroupSelect = { selectedGroup = it },
                            onAttendanceToggle = { studentId ->
                                val marks = payload.optJSONArray("items") ?: JSONArray()
                                for (i in 0 until marks.length()) {
                                    val mark = marks.optJSONObject(i) ?: continue
                                    if (mark.optLong("id") == studentId) mark.put("present", !mark.optBoolean("present"))
                                }
                                payload = JSONObject(payload.toString())
                            }
                        )
                    }
                    }
                }
            }
            if (dialog != null) {
                if (dialog == "review_list") {
                    AlertDialog(onDismissRequest = { dialog = null }, title = { Text("Tekshirish uchun ishlar") },
                        text = { Text("Baholar bo‘limidan o‘quvchi topshirig‘ini tanlang.") }, confirmButton = { TextButton(onClick = { dialog = null; active = "grades" }) { Text("Baholarni ochish") } },
                        dismissButton = { TextButton(onClick = { dialog = null }) { Text("Yopish") } })
                } else if (dialog == "delete_ai_chat") {
                    AlertDialog(onDismissRequest = { dialog = null }, title = { Text("AI chatni o‘chirish") },
                        text = { Text("‘${selectedRow.optString("title")}’ suhbatini o‘chirilsinmi?") },
                        confirmButton = { Button(onClick = { doAction("delete_ai_chat", JSONObject().put("conversation_id", selectedRow.optLong("id"))); dialog = null }) { Text("O‘chirish") } },
                        dismissButton = { TextButton(onClick = { dialog = null }) { Text("Bekor qilish") } })
                } else {
                    ActionDialog(dialog!!, selectedRow, payload, user!!.optString("role"), onClose = { dialog = null }, onSubmit = { actionName, values ->
                        if (actionName == "mark_attendance") {
                            val items = payload.optJSONArray("items") ?: JSONArray()
                            val marks = JSONArray()
                            for (index in 0 until items.length()) {
                                val student = items.optJSONObject(index) ?: continue
                                marks.put(JSONObject().put("student_id", student.optInt("id")).put("present", student.optBoolean("present")))
                            }
                            values.put("group_id", selectedGroup).put("date", payload.optString("date")).put("marks", marks)
                        }
                        doAction(actionName, values)
                        dialog = null
                    })
                }
            }
        }
    }
}

@Composable
private fun LoginScreen(loading: Boolean, error: String, onLogin: (String, String) -> Unit) {
    var login by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    var appeared by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { appeared = true }
    val glow by rememberInfiniteTransition(label = "login-glow").animateFloat(
        initialValue = .9f,
        targetValue = 1.12f,
        animationSpec = infiniteRepeatable(tween(3600, easing = LinearEasing), RepeatMode.Reverse),
        label = "login-glow-scale",
    )
    Box(
        Modifier.fillMaxSize().background(
            Brush.linearGradient(listOf(Color(0xFF0F172A), Color(0xFF1E1B4B), Color(0xFF312E81)))
        )
    ) {
        Box(
            Modifier.size(300.dp).offset(x = (-110).dp, y = (-150).dp).scale(glow)
                .background(Brush.radialGradient(listOf(Color(0x995C6BFF), Color.Transparent)), CircleShape)
        )
        Box(
            Modifier.size(260.dp).align(Alignment.BottomEnd).offset(x = 90.dp, y = 110.dp).scale(2f - glow)
                .background(Brush.radialGradient(listOf(Color(0x6638BDF8), Color.Transparent)), CircleShape)
        )
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(horizontal = 26.dp, vertical = 32.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            AnimatedVisibility(
                visible = appeared,
                enter = fadeIn(tween(360)) + slideInVertically(tween(420, easing = FastOutSlowInEasing)) { -it / 10 },
            ) {
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(48.dp).background(Brand, RoundedCornerShape(15.dp)), contentAlignment = Alignment.Center) {
                            Icon(Icons.Filled.School, null, tint = Color.White, modifier = Modifier.size(26.dp))
                        }
                        Spacer(Modifier.width(12.dp))
                        Text("TeacherWeb", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = Color.White)
                    }
                    Spacer(Modifier.height(10.dp))
                    Text("O‘quv markazingizni bir joydan boshqaring", color = Color.White.copy(alpha = .68f), fontSize = 15.sp)
                }
            }
            Spacer(Modifier.height(28.dp))
            AnimatedVisibility(
                visible = appeared,
                enter = fadeIn(tween(420, delayMillis = 100)) + slideInVertically(tween(480, delayMillis = 100, easing = FastOutSlowInEasing)) { it / 8 },
            ) {
                Card(
                    shape = RoundedCornerShape(24.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(defaultElevation = 10.dp),
                    modifier = Modifier.animateContentSize(),
                ) {
                    Column(Modifier.fillMaxWidth().padding(22.dp)) {
                        Text("Hisobingizga kiring", fontSize = 23.sp, fontWeight = FontWeight.Bold, color = Ink)
                        Text("Davom etish uchun login va parolingizni kiriting.", color = Muted, fontSize = 12.sp)
                        Spacer(Modifier.height(18.dp))
                        OutlinedTextField(login, { login = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Login") }, singleLine = true)
                        Spacer(Modifier.height(10.dp))
                        OutlinedTextField(
                            value = password,
                            onValueChange = { password = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Parol") },
                            singleLine = true,
                            visualTransformation = if (passwordVisible) androidx.compose.ui.text.input.VisualTransformation.None else PasswordVisualTransformation(),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                            trailingIcon = {
                                IconButton(onClick = { passwordVisible = !passwordVisible }) {
                                    Icon(if (passwordVisible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility, contentDescription = if (passwordVisible) "Parolni yashirish" else "Parolni ko‘rsatish", tint = Muted)
                                }
                            }
                        )
                        AnimatedVisibility(
                            visible = error.isNotBlank(),
                            enter = fadeIn(tween(160)) + expandVertically(tween(200)),
                            exit = fadeOut(tween(120)) + shrinkVertically(tween(160)),
                        ) {
                            Column {
                                Spacer(Modifier.height(12.dp))
                                Text(error, color = Color(0xFFB42318), fontSize = 13.sp)
                            }
                        }
                        Spacer(Modifier.height(18.dp))
                        Button(onClick = { onLogin(login, password) }, modifier = Modifier.fillMaxWidth().height(52.dp), enabled = !loading && login.isNotBlank() && password.isNotBlank(), shape = RoundedCornerShape(14.dp)) {
                            Crossfade(targetState = loading, animationSpec = tween(160), label = "login-button") { busy ->
                                if (busy) CircularProgressIndicator(Modifier.size(20.dp), color = Color.White, strokeWidth = 2.dp) else Text("Kirish", fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
            Spacer(Modifier.height(18.dp))
            AnimatedVisibility(visible = appeared, enter = fadeIn(tween(420, delayMillis = 220))) {
                Text("O‘qituvchi, o‘quvchi va rahbarlar uchun mobil ilova", color = Color.White.copy(alpha = .55f), fontSize = 12.sp)
            }
        }
    }
}

@Composable
private fun TopBar(title: String, name: String, avatar: ImageBitmap?, onLogout: () -> Unit) {
    Row(Modifier.fillMaxWidth().background(Color.White).padding(horizontal = 18.dp, vertical = 11.dp), verticalAlignment = Alignment.CenterVertically) {
        UserAvatar(avatar, name, 38.dp, 14.sp)
        Spacer(Modifier.width(11.dp))
        Column(Modifier.weight(1f)) {
            Crossfade(targetState = title, animationSpec = tween(200), label = "topbar-title") { shownTitle ->
                Text(shownTitle, color = Ink, fontSize = 19.sp, fontWeight = FontWeight.Bold)
            }
            Text(name, color = Muted, fontSize = 12.sp)
        }
        IconButton(onClick = onLogout) { Icon(Icons.Filled.Logout, "Chiqish", tint = Muted) }
    }
}

@Composable
private fun UserAvatar(avatar: ImageBitmap?, name: String, size: Dp, fontSize: androidx.compose.ui.unit.TextUnit, modifier: Modifier = Modifier) {
    Box(
        modifier.size(size).clip(CircleShape).background(Brand.copy(alpha = .12f)),
        contentAlignment = Alignment.Center,
    ) {
        Crossfade(targetState = avatar, animationSpec = tween(220), label = "avatar-image") { image ->
            if (image != null) {
                Image(image, contentDescription = name, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize().clip(CircleShape))
            } else {
                Text(initialsOf(name), color = Brand, fontWeight = FontWeight.Bold, fontSize = fontSize)
            }
        }
    }
}

private fun initialsOf(name: String): String = name.trim().split(" ")
    .filter { it.isNotBlank() }
    .take(2)
    .joinToString("") { it.first().uppercase() }
    .ifBlank { "T" }

@Composable
private fun DashboardScreen(user: JSONObject, payload: JSONObject, sections: List<String>, avatar: ImageBitmap?, onOpen: (String) -> Unit) {
    val metrics = payload.optJSONObject("metrics") ?: JSONObject()
    val heroGlow by rememberInfiniteTransition(label = "hero-glow").animateFloat(
        initialValue = .9f,
        targetValue = 1.08f,
        animationSpec = infiniteRepeatable(tween(2800, easing = LinearEasing), RepeatMode.Reverse),
        label = "hero-glow-scale",
    )
    LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp), contentPadding = PaddingValues(top = 18.dp, bottom = 20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            Reveal {
                Card(colors = CardDefaults.cardColors(containerColor = Color.Transparent), shape = RoundedCornerShape(24.dp), elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)) {
                    Box(
                        Modifier.fillMaxWidth().background(
                            Brush.linearGradient(listOf(Color(0xFF4F46E5), Color(0xFF6D5AE6), Color(0xFF8B5CF6)))
                        ).padding(20.dp)
                    ) {
                        Box(
                            Modifier.size(150.dp).align(Alignment.TopEnd).offset(x = 46.dp, y = (-58).dp).scale(heroGlow)
                                .background(Color.White.copy(alpha = .09f), CircleShape)
                        )
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text("Xush kelibsiz, ${user.optString("first_name")}", color = Color.White.copy(alpha = .82f), fontSize = 14.sp)
                                Text("Ishlaringiz bir joyda", color = Color.White, fontSize = 23.sp, fontWeight = FontWeight.Bold)
                                Spacer(Modifier.height(14.dp))
                                Text("Guruhlar: ${metrics.optInt("groups")}", color = Color.White.copy(alpha = .9f), fontSize = 14.sp, fontWeight = FontWeight.Medium)
                            }
                            Box(Modifier.border(3.dp, Color.White.copy(alpha = .35f), CircleShape).padding(3.dp)) {
                                UserAvatar(avatar, user.optString("name"), 62.dp, 22.sp)
                            }
                        }
                    }
                }
            }
        }
        item { Text("Ko‘rsatkichlar", fontSize = 17.sp, fontWeight = FontWeight.Bold, color = Ink) }
        item {
            val fields = when (user.optString("role")) {
                "STUDENT" -> listOf(
                    Triple("homework_done", "Bajarilgan vazifa", Color(0xFF5147E8)),
                    Triple("homework_total", "Jami vazifa", Color(0xFF0891B2)),
                    Triple("average_grade", "O‘rtacha baho", Color(0xFF059669)),
                    Triple("attendance", "Davomat %", Color(0xFFD97706)),
                )
                "TEACHER" -> listOf(
                    Triple("students", "O‘quvchilar", Color(0xFF5147E8)),
                    Triple("homeworks", "Uy vazifalari", Color(0xFF0891B2)),
                    Triple("income", "Tushum (so‘m)", Color(0xFF059669)),
                    Triple("outstanding", "Qarzdorlik (so‘m)", Color(0xFFE11D48)),
                )
                "DIRECTOR" -> listOf(
                    Triple("teachers", "O‘qituvchilar", Color(0xFF5147E8)),
                    Triple("students", "O‘quvchilar", Color(0xFF0891B2)),
                    Triple("groups", "Guruhlar", Color(0xFFD97706)),
                    Triple("income", "Oylik tushum (so‘m)", Color(0xFF059669)),
                )
                else -> listOf(
                    Triple("directors", "Direktorlar", Color(0xFF5147E8)),
                    Triple("teachers", "O‘qituvchilar", Color(0xFF0891B2)),
                    Triple("students", "O‘quvchilar", Color(0xFFD97706)),
                    Triple("groups", "Guruhlar", Color(0xFFE11D48)),
                )
            }
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                fields.chunked(2).forEachIndexed { rowIndex, row ->
                    Reveal(delayMillis = 60 + rowIndex * 50) {
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            row.forEach { (key, label, tint) -> MetricCard(label, metrics.opt(key)?.toString() ?: "—", Modifier.weight(1f), tint) }
                            if (row.size == 1) Spacer(Modifier.weight(1f))
                        }
                    }
                }
            }
        }
        item { Text("Tezkor bo‘limlar", fontSize = 17.sp, fontWeight = FontWeight.Bold, color = Ink) }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                sections.filter { it != "dashboard" }.take(6).chunked(2).forEachIndexed { rowIndex, row ->
                    Reveal(delayMillis = 120 + rowIndex * 50) {
                        Row(horizontalArrangement = Arrangement.spacedBy(9.dp)) { row.forEach { id -> SectionTile(id, false, Modifier.weight(1f)) { onOpen(id) } } }
                    }
                }
            }
        }
    }
}

@Composable
private fun MetricCard(label: String, value: String, modifier: Modifier = Modifier, tint: Color = Brand) {
    Card(
        modifier,
        colors = CardDefaults.cardColors(containerColor = Color.White),
        shape = RoundedCornerShape(18.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(Modifier.fillMaxWidth().padding(15.dp)) {
            Box(Modifier.size(26.dp).background(tint.copy(alpha = .12f), RoundedCornerShape(8.dp)), contentAlignment = Alignment.Center) {
                Box(Modifier.size(8.dp).background(tint, CircleShape))
            }
            Spacer(Modifier.height(10.dp))
            Text(value, color = tint, fontSize = 21.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            Spacer(Modifier.height(4.dp)); Text(label, color = Muted, fontSize = 12.sp)
        }
    }
}

@Composable
private fun MoreSections(sections: List<String>, active: String, onOpen: (String) -> Unit) {
    LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp), contentPadding = PaddingValues(top = 18.dp, bottom = 20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { Text("Barcha bo‘limlar", color = Ink, fontSize = 21.sp, fontWeight = FontWeight.Bold) }
        items(sections.filter { it != "dashboard" }) { id -> Reveal { SectionTile(id, active == id, Modifier.fillMaxWidth()) { onOpen(id) } } }
    }
}

@Composable
private fun SectionTile(id: String, selected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val item = sectionCatalog.firstOrNull { it.id == id } ?: AppSection(id, id, Icons.Filled.Apps)
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.97f else 1f, animationSpec = spring(stiffness = Spring.StiffnessMediumLow), label = "section-tile-scale")
    val container by animateColorAsState(if (selected) Brand.copy(alpha = .11f) else Color.White, label = "section-tile-color")
    val iconBackground by animateColorAsState(if (selected) Brand else Brand.copy(alpha = .1f), label = "section-tile-icon")
    val iconTint by animateColorAsState(if (selected) Color.White else Brand, label = "section-tile-tint")
    Card(modifier.scale(scale).clickable(interactionSource = interaction, indication = LocalIndication.current, onClick = onClick), colors = CardDefaults.cardColors(containerColor = container),
        shape = RoundedCornerShape(17.dp), border = if (selected) androidx.compose.foundation.BorderStroke(1.dp, Brand.copy(alpha = .5f)) else null,
        elevation = CardDefaults.cardElevation(defaultElevation = if (selected) 0.dp else 1.dp)) {
        Row(Modifier.fillMaxWidth().padding(15.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(40.dp).background(iconBackground, CircleShape), contentAlignment = Alignment.Center) {
                Icon(item.icon, item.title, tint = iconTint, modifier = Modifier.size(21.dp))
            }
            Spacer(Modifier.width(12.dp)); Text(item.title, Modifier.weight(1f), color = Ink, fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium)
            AnimatedVisibility(visible = selected, enter = scaleIn(tween(180)), exit = fadeOut(tween(120))) {
                Icon(Icons.Filled.CheckCircle, "Tanlangan", tint = Brand, modifier = Modifier.size(20.dp))
            }
        }
    }
}

@Composable
private fun SettingsScreen(
    profile: JSONObject,
    telegram: JSONObject,
    avatar: ImageBitmap?,
    uploading: Boolean,
    onEdit: () -> Unit,
    onPickAvatar: () -> Unit,
    onTelegram: () -> Unit,
) {
    val name = profile.optString("name")
    val roleLabel = when (profile.optString("role")) {
        "TEACHER" -> "O‘qituvchi"
        "STUDENT" -> "O‘quvchi"
        "DIRECTOR" -> "Direktor"
        "SUPER_ADMIN" -> "Super admin"
        else -> profile.optString("role")
    }
    val telegramAvailable = telegram.optBoolean("available")
    val telegramLinked = telegram.optBoolean("linked")
    val telegramMessage = telegram.optString("message").ifBlank {
        if (telegramLinked) "Ulangan — bildirishnomalar Telegramga keladi." else "Ulanmagan — botga ulang va bildirishnomalarni oling."
    }
    LazyColumn(
        Modifier.fillMaxSize().padding(horizontal = 16.dp),
        contentPadding = PaddingValues(top = 18.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Reveal {
                Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(24.dp), elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)) {
                    Column(Modifier.fillMaxWidth().padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Box {
                            Box(Modifier.border(3.dp, Brand.copy(alpha = .16f), CircleShape).padding(4.dp)) {
                                UserAvatar(avatar, name, 92.dp, 28.sp)
                            }
                            if (uploading) {
                                Box(Modifier.size(100.dp).clip(CircleShape).background(Color.Black.copy(alpha = .38f)), contentAlignment = Alignment.Center) {
                                    CircularProgressIndicator(Modifier.size(24.dp), color = Color.White, strokeWidth = 2.dp)
                                }
                            }
                            Box(
                                Modifier.align(Alignment.BottomEnd).size(34.dp)
                                    .background(Brand, CircleShape).border(2.dp, Color.White, CircleShape)
                                    .clickable(enabled = !uploading, onClick = onPickAvatar),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(Icons.Filled.PhotoCamera, "Rasm tanlash", tint = Color.White, modifier = Modifier.size(17.dp))
                            }
                        }
                        Spacer(Modifier.height(14.dp))
                        Text(name, color = Ink, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        Text("@${profile.optString("login")}", color = Muted, fontSize = 12.sp)
                        Spacer(Modifier.height(9.dp))
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                            Text(
                                roleLabel,
                                Modifier.background(Brand.copy(alpha = .1f), RoundedCornerShape(50)).padding(horizontal = 10.dp, vertical = 5.dp),
                                color = Brand, fontSize = 11.sp, fontWeight = FontWeight.Bold,
                            )
                            val phone = profile.optString("phone")
                            if (phone.isNotBlank()) Text(phone, color = Muted, fontSize = 12.sp)
                        }
                        Spacer(Modifier.height(18.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                            OutlinedButton(onClick = onPickAvatar, modifier = Modifier.weight(1f), enabled = !uploading) {
                                Icon(Icons.Filled.PhotoCamera, null, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(6.dp)); Text("Rasm", fontSize = 13.sp)
                            }
                            Button(onClick = onEdit, modifier = Modifier.weight(1f)) {
                                Icon(Icons.Filled.Edit, null, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(6.dp)); Text("Tahrirlash", fontSize = 13.sp)
                            }
                        }
                    }
                }
            }
        }
        item { Text("Ulanishlar", color = Ink, fontSize = 17.sp, fontWeight = FontWeight.Bold) }
        item {
            Reveal(70) {
                Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(20.dp), elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)) {
                    Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(42.dp).background(Color(0xFF229ED9).copy(alpha = .12f), CircleShape), contentAlignment = Alignment.Center) {
                            Icon(Icons.Filled.Send, null, tint = Color(0xFF229ED9), modifier = Modifier.size(20.dp))
                        }
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text("Telegram bot", color = Ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                                if (telegramLinked) {
                                    Spacer(Modifier.width(6.dp))
                                    Box(Modifier.size(7.dp).background(Color(0xFF16855B), CircleShape))
                                }
                            }
                            Text(telegramMessage, color = if (telegramAvailable) Muted else Color(0xFF9E2F24), fontSize = 11.sp, maxLines = 2)
                        }
                        Spacer(Modifier.width(8.dp))
                        if (telegramAvailable) {
                            Button(onClick = onTelegram, contentPadding = PaddingValues(horizontal = 13.dp, vertical = 8.dp)) {
                                Text(if (telegramLinked) "Ochish" else "Ulash", fontSize = 12.sp)
                            }
                        }
                    }
                }
            }
        }
        item {
            Reveal(120) {
                Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(20.dp), elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)) {
                    Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(42.dp).background(Brand.copy(alpha = .1f), CircleShape), contentAlignment = Alignment.Center) {
                            Icon(Icons.Filled.Shield, null, tint = Brand, modifier = Modifier.size(20.dp))
                        }
                        Spacer(Modifier.width(12.dp))
                        Column {
                            Text("Profil va xavfsizlik", color = Ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                            Text("Ism, telefon va rasm sayt bilan bir xil saqlanadi. Parolni “Tahrirlash” orqali almashtirasiz.", color = Muted, fontSize = 11.sp)
                        }
                    }
                }
            }
        }
        item {
            Reveal(170) {
                Text("TeacherWeb 1.0.3 · Android", Modifier.fillMaxWidth().padding(top = 4.dp), color = Muted, fontSize = 11.sp)
            }
        }
    }
}

@Composable
private fun SectionScreen(name: String, payload: JSONObject, role: String, onItem: (JSONObject) -> Unit, onAdd: (String) -> Unit, onGroupSelect: (Long) -> Unit, onAttendanceToggle: (Long) -> Unit, onManageItem: (String, JSONObject) -> Unit) {
    val itemsArray = payload.optJSONArray("items") ?: JSONArray()
    val title = payload.optString("title", sectionCatalog.firstOrNull { it.id == name }?.title ?: "Bo‘lim")
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 17.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(title, Modifier.weight(1f), color = Ink, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            when {
                name == "groups" && role in listOf("TEACHER", "DIRECTOR", "SUPER_ADMIN") -> SmallAction("Guruh qo‘shish") { onAdd("create_group") }
                name == "teachers" && role == "DIRECTOR" -> SmallAction("Ustoz qo‘shish") { onAdd("create_teacher") }
                name == "staff" && role == "SUPER_ADMIN" -> SmallAction("Direktor qo‘shish") { onAdd("create_director") }
                name == "students" && role in listOf("TEACHER", "DIRECTOR") -> SmallAction("O‘quvchi qo‘shish") { onAdd("create_student") }
                name == "homework" && role in listOf("TEACHER", "DIRECTOR", "SUPER_ADMIN") -> SmallAction("Vazifa berish") { onAdd("create_homework") }
                name == "attendance" && role != "STUDENT" -> SmallAction("Davomatni saqlash") { onAdd("mark_attendance") }
                name == "materials" && role in listOf("TEACHER", "SUPER_ADMIN") -> SmallAction("Material qo‘shish") { onAdd("create_material") }
                name == "tests" && role in listOf("TEACHER", "SUPER_ADMIN") -> SmallAction("AI test") { onAdd("create_ai_test") }
                name == "assistant" -> SmallAction("Yangi chat") { onAdd("create_ai_chat") }
                name == "chats" && role in listOf("TEACHER", "STUDENT") -> SmallAction("Yangi suhbat") { onAdd("start_chat") }
                name == "announcements" && role == "DIRECTOR" -> SmallAction("Yuborish") { onAdd("send_announcement") }
                name == "settings" -> SmallAction("Tahrirlash") { onAdd("update_profile") }
            }
        }
        if (name == "attendance" && role != "STUDENT") {
            val groups = payload.optJSONArray("groups") ?: JSONArray()
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                (0 until groups.length()).forEach { i ->
                    val group = groups.optJSONObject(i) ?: return@forEach
                    FilterChip(selected = payload.optInt("group_id") == group.optInt("id"), onClick = { onGroupSelect(group.optLong("id")) }, label = { Text(group.optString("name"), maxLines = 1) })
                }
            }
        }
        if (itemsArray.length() == 0 && name == "settings") {
            val profile = payload.optJSONObject("user") ?: JSONObject()
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                MetricCard("Hisob turi", profile.optString("role"), Modifier.fillMaxWidth())
                DataCard("settings", JSONObject().put("title", profile.optString("name")).put("subtitle", profile.optString("login")).put("description", profile.optString("phone"))) {}
                Text("Profil ma’lumotlari hisobingizda saqlanadi.", Modifier.padding(4.dp), color = Muted, fontSize = 13.sp)
            }
        } else if (itemsArray.length() == 0) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(sectionCatalog.firstOrNull { it.id == name }?.icon ?: Icons.Filled.Inbox, null, tint = Brand.copy(alpha = .6f), modifier = Modifier.size(44.dp))
                    Spacer(Modifier.height(10.dp)); Text("Hozircha ma’lumot yo‘q", color = Muted)
                }
            }
        } else {
            LazyColumn(Modifier.fillMaxSize().padding(horizontal = 14.dp), contentPadding = PaddingValues(top = 4.dp, bottom = 20.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                items(itemsArray.length()) { index ->
                    val row = itemsArray.optJSONObject(index) ?: JSONObject()
                    Reveal(delayMillis = (index % 8) * 20) {
                        if (name == "attendance" && role != "STUDENT") {
                            Row(Modifier.fillMaxWidth().background(Color.White, RoundedCornerShape(16.dp)).clickable { onAttendanceToggle(row.optLong("id")) }.padding(horizontal = 14.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                                Checkbox(checked = row.optBoolean("present"), onCheckedChange = { onAttendanceToggle(row.optLong("id")) }, colors = CheckboxDefaults.colors(checkedColor = Brand))
                                Column(Modifier.weight(1f)) { Text(row.optString("title"), color = Ink, fontWeight = FontWeight.SemiBold); Text(if (row.optBoolean("present")) "Keldi" else "Kelmagan", color = Muted, fontSize = 12.sp) }
                            }
                        } else if (name == "assistant") AssistantChatCard(row, onOpen = { onItem(row) }, onManage = { action -> onManageItem(action, row) })
                        else DataCard(name, row) { onItem(row) }
                    }
                }
            }
        }
    }
}

@Composable
private fun AssistantChatCard(row: JSONObject, onOpen: () -> Unit, onManage: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Card(Modifier.fillMaxWidth().clickable(onClick = onOpen), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(17.dp)) {
        Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(40.dp).background(Brand.copy(alpha = .1f), CircleShape), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.AutoAwesome, null, tint = Brand)
            }
            Spacer(Modifier.width(11.dp))
            Column(Modifier.weight(1f)) {
                Text(row.optString("title"), color = Ink, fontWeight = FontWeight.SemiBold)
                Text(row.optString("subtitle"), color = Muted, fontSize = 12.sp)
            }
            if (row.optBoolean("pinned")) Icon(Icons.Filled.PushPin, "Qadalgan", tint = Brand, modifier = Modifier.size(18.dp))
            Box {
                IconButton(onClick = { expanded = true }) { Icon(Icons.Filled.MoreVert, "Chat sozlamalari", tint = Muted) }
                DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                    DropdownMenuItem(text = { Text(if (row.optBoolean("pinned")) "Qadog‘dan olish" else "Qadash") }, leadingIcon = { Icon(Icons.Filled.PushPin, null) }, onClick = { expanded = false; onManage("pin_ai_chat") })
                    DropdownMenuItem(text = { Text("Nomini o‘zgartirish") }, leadingIcon = { Icon(Icons.Filled.Edit, null) }, onClick = { expanded = false; onManage("rename_ai_chat") })
                    DropdownMenuItem(text = { Text("O‘chirish", color = Color(0xFFB42318)) }, leadingIcon = { Icon(Icons.Filled.Delete, null, tint = Color(0xFFB42318)) }, onClick = { expanded = false; onManage("delete_ai_chat") })
                }
            }
        }
    }
}

@Composable
private fun DataCard(section: String, row: JSONObject, onClick: () -> Unit) {
    val title = row.optString("title", row.optString("name", "Ma’lumot"))
    val subtitle = row.optString("subtitle").ifBlank { row.optString("level") }
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.985f else 1f, animationSpec = spring(stiffness = Spring.StiffnessMediumLow), label = "data-card-scale")
    Card(Modifier.fillMaxWidth().scale(scale).clickable(interactionSource = interaction, indication = LocalIndication.current, onClick = onClick), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(18.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)) {
        Column(Modifier.fillMaxWidth().padding(15.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(38.dp).background(Brand.copy(alpha = .1f), CircleShape), contentAlignment = Alignment.Center) {
                    Icon(sectionCatalog.firstOrNull { it.id == section }?.icon ?: Icons.Filled.Description, null, tint = Brand, modifier = Modifier.size(19.dp))
                }
                Spacer(Modifier.width(11.dp))
                Column(Modifier.weight(1f)) {
                    Text(title, color = Ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                    if (subtitle.isNotBlank()) Text(subtitle, color = Muted, fontSize = 12.sp)
                }
                val grade = row.opt("grade")
                if (grade != null && grade != JSONObject.NULL) Text("$grade/100", color = Brand, fontWeight = FontWeight.Bold)
                else if (row.optString("status").isNotBlank()) StatusPill(row.optString("status"))
                else Icon(Icons.Filled.ChevronRight, null, tint = Muted)
            }
            val description = row.optString("description").ifBlank { row.optString("text") }
            if (description.isNotBlank()) { Spacer(Modifier.height(10.dp)); Text(description, color = Muted, fontSize = 13.sp, maxLines = 3) }
            val meta = buildList {
                if (row.has("students")) add("O‘quvchi: ${row.optInt("students")}")
                if (row.has("submitted")) add("Topshirgan: ${row.optInt("submitted")}")
                if (row.has("unchecked") && row.optInt("unchecked") > 0) add("Tekshirilmagan: ${row.optInt("unchecked")}")
                if (row.has("price")) add("Narx: ${row.optInt("price")} so‘m")
                if (row.has("amount") && row.optInt("amount") > 0) add("To‘langan: ${row.optInt("amount")} so‘m")
                if (row.optString("due").isNotBlank()) add("Muddat: ${row.optString("due").take(10)}")
            }
            if (meta.isNotEmpty()) { Spacer(Modifier.height(8.dp)); Text(meta.joinToString("   •   "), color = Muted, fontSize = 11.sp) }
        }
    }
}

@Composable
private fun StatusPill(text: String) {
    val color = when (text.uppercase()) {
        "PAID", "PUBLISHED", "SUBMITTED", "DONE", "KELDI" -> Color(0xFF16855B)
        "UNPAID", "DRAFT", "KUTILMOQDA", "LATE" -> Color(0xFFB26A00)
        else -> Muted
    }
    Text(text, modifier = Modifier.background(color.copy(alpha = .12f), RoundedCornerShape(50)).padding(horizontal = 9.dp, vertical = 5.dp), color = color, fontSize = 10.sp, fontWeight = FontWeight.Bold)
}

@Composable
private fun GroupPicker(groups: JSONArray, onChoose: (Long) -> Unit, onAddGroup: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Guruhni tanlang", Modifier.weight(1f), color = Ink, fontWeight = FontWeight.Bold, fontSize = 19.sp)
            SmallAction("Yangi guruh") { onAddGroup() }
        }
        Spacer(Modifier.height(12.dp))
        LazyColumn(verticalArrangement = Arrangement.spacedBy(9.dp)) {
            items(groups.length()) { index ->
                val group = groups.optJSONObject(index) ?: JSONObject()
                Reveal(delayMillis = (index % 6) * 30) { DataCard("groups", group) { onChoose(group.optLong("id")) } }
            }
        }
    }
}

@Composable
private fun SmallAction(text: String, onClick: () -> Unit) {
    FilledTonalButton(onClick = onClick, contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp)) { Text(text, fontSize = 12.sp) }
}

@Composable
private fun MessageBanner(text: String, isError: Boolean, onClose: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 15.dp, vertical = 6.dp).background(if (isError) Color(0xFFFFE9E7) else Color(0xFFE5F7ED), RoundedCornerShape(12.dp)).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(text, Modifier.weight(1f), color = if (isError) Color(0xFF9E2F24) else Color(0xFF156B48), fontSize = 12.sp)
        IconButton(onClick = onClose, modifier = Modifier.size(24.dp)) { Icon(Icons.Filled.Close, null, modifier = Modifier.size(16.dp)) }
    }
}

@Composable
private fun Reveal(delayMillis: Int = 0, content: @Composable () -> Unit) {
    var visible by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        if (delayMillis > 0) delay(delayMillis.toLong())
        visible = true
    }
    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(tween(300)) + slideInVertically(tween(360, easing = FastOutSlowInEasing)) { it / 7 },
    ) { content() }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
private fun ActionDialog(action: String, row: JSONObject, payload: JSONObject, role: String, onClose: () -> Unit, onSubmit: (String, JSONObject) -> Unit) {
    val fields = when (action) {
        "create_group" -> listOf("name" to "Guruh nomi", "level" to "Daraja", "time" to "Dars vaqti", "price" to "Oylik narx")
        "create_teacher" -> listOf("first_name" to "Ism", "last_name" to "Familiya", "login" to "Login", "password" to "Parol", "phone" to "Telefon", "center_name" to "O‘quv markazi", "city" to "Shahar")
        "create_director" -> listOf("first_name" to "Ism", "last_name" to "Familiya", "login" to "Login", "password" to "Parol", "phone" to "Telefon")
        "create_student" -> listOf("first_name" to "Ism", "last_name" to "Familiya", "login" to "Login", "password" to "Parol", "phone" to "Telefon", "group_id" to "Guruh ID")
        "create_homework" -> listOf("title" to "Vazifa nomi", "description" to "Tavsif", "group_id" to "Guruh ID")
        "create_material" -> listOf("title" to "Sarlavha", "description" to "Tavsif", "youtube_url" to "YouTube havolasi")
        "submit_homework" -> listOf("text" to "Javobingiz")
        "review_submission" -> listOf("grade" to "Baho (0–100)", "comment" to "Izoh")
        "mark_paid" -> listOf("amount" to "To‘langan summa")
        "create_ai_test" -> listOf("subject" to "Fan", "topic" to "Mavzu", "grade_level" to "Sinf/daraja", "count" to "Savollar soni", "difficulty" to "Qiyinlik (EASY/MEDIUM/HARD/MIXED)", "group_id" to "Guruh ID")
        "publish_test", "create_ai_chat", "start_chat", "mark_attendance" -> emptyList()
        "send_announcement" -> listOf("title" to "Sarlavha", "body" to "E’lon matni")
        "rename_ai_chat" -> listOf("title" to "Chat nomi")
        "update_profile" -> listOf("first_name" to "Ism", "last_name" to "Familiya", "phone" to "Telefon", "current_password" to "Joriy parol", "new_password" to "Yangi parol")
        "send_message", "send_ai_message" -> listOf("text" to "Xabaringiz")
        else -> emptyList()
    }
    val values = remember(action, row) { mutableStateMapOf<String, String>().apply {
        when (action) {
            "submit_homework" -> put("homework_id", row.optString("id"))
            "review_submission" -> put("submission_id", row.optString("id"))
            "mark_paid" -> { put("student_id", row.optString("student_id")); put("group_id", row.optString("group_id")) }
            "create_ai_test" -> { put("count", "10"); put("subject", "Matematika"); put("difficulty", "MIXED") }
            "create_group" -> { put("time", "09:00"); put("price", "300000") }
            "create_material" -> put("type", "VIDEO")
            "rename_ai_chat" -> { put("title", row.optString("title")); put("conversation_id", row.optString("id")) }
            "update_profile" -> payload.optJSONObject("user")?.let { profile ->
                put("first_name", profile.optString("first_name")); put("last_name", profile.optString("last_name")); put("phone", profile.optString("phone"))
            }
        }
    } }
    val title = when (action) {
        "create_group" -> "Yangi guruh"
        "create_teacher" -> "O‘qituvchi qo‘shish"
        "create_director" -> "Direktor qo‘shish"
        "create_student" -> "O‘quvchi qo‘shish"
        "create_homework" -> "Uy vazifasi berish"
        "create_material" -> "Dars materiali qo‘shish"
        "submit_homework" -> "Vazifani topshirish"
        "review_submission" -> "Ishni baholash"
        "mark_paid" -> "To‘lovni qayd etish"
        "create_ai_test" -> "AI test yaratish"
        "publish_test" -> "Testni o‘quvchilarga yuborish"
        "create_ai_chat" -> "AI chat ochish"
        "start_chat" -> "Shaxsiy suhbat boshlash"
        "send_announcement" -> "Bildirishnoma yuborish"
        "rename_ai_chat" -> "AI chat nomini o‘zgartirish"
        "update_profile" -> "Profil sozlamalari"
        "send_message" -> "Xabar yuborish"
        "send_ai_message" -> "AI’ga yozish"
        else -> "Amalni bajarish"
    }
    var selectedGroup by remember { mutableStateOf(0L) }
    var selectedTeacher by remember { mutableStateOf(0L) }
    var selectedStudent by remember { mutableStateOf(0L) }
    var audience by remember { mutableStateOf("STUDENTS_ALL") }
    val groups = payload.optJSONArray("groups") ?: JSONArray()
    if (action == "publish_test") {
        AlertDialog(onDismissRequest = onClose, title = { Text(title) },
            text = { Text("${row.optString("title")} testini nashr qilib, guruh o‘quvchilariga yuborasizmi?") },
            confirmButton = { Button(onClick = { onSubmit("publish_test", JSONObject().put("test_id", row.optInt("id"))) }) { Text("Yuborish") } },
            dismissButton = { TextButton(onClick = onClose) { Text("Bekor qilish") } })
        return
    }
    if (action in listOf("create_ai_chat", "start_chat")) {
        val people = payload.optJSONArray(if (action == "create_ai_chat") "students" else "contacts") ?: JSONArray()
        var expanded by remember { mutableStateOf(false) }
        val chosenId = selectedStudent
        val chosenName = (0 until people.length()).mapNotNull { people.optJSONObject(it) }.firstOrNull { it.optLong("id") == chosenId }?.optString("title")
        AlertDialog(onDismissRequest = onClose, title = { Text(title) },
            text = {
                if (action == "create_ai_chat" || action == "start_chat") {
                    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = !expanded }) {
                        OutlinedTextField(chosenName ?: if (action == "create_ai_chat") "Umumiy suhbat" else "Foydalanuvchini tanlang", {}, readOnly = true, label = { Text(if (action == "create_ai_chat") "Tahlil uchun o‘quvchi" else "Suhbatdosh") }, modifier = Modifier.menuAnchor().fillMaxWidth(), trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) })
                        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                            if (action == "create_ai_chat") DropdownMenuItem(text = { Text("Umumiy suhbat") }, onClick = { selectedStudent = 0; expanded = false })
                            (0 until people.length()).forEach { i ->
                                val person = people.optJSONObject(i) ?: return@forEach
                                DropdownMenuItem(text = { Text(person.optString("title")) }, onClick = { selectedStudent = person.optLong("id"); expanded = false })
                            }
                        }
                    }
                } else Text("${row.optString("title")} bilan yangi suhbat ochilsinmi?")
            },
            confirmButton = { Button(onClick = {
                val body = JSONObject()
                if (action == "create_ai_chat" && selectedStudent > 0) body.put("student_id", selectedStudent)
                if (action == "start_chat") body.put("user_id", selectedStudent)
                onSubmit(action, body)
            }) { Text(if (action == "create_ai_chat") "Chat ochish" else "Yozish") } },
            dismissButton = { TextButton(onClick = onClose) { Text("Bekor qilish") } })
        return
    }
    AlertDialog(onDismissRequest = onClose, title = { Text(title, color = Ink, fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(9.dp), modifier = Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
                if (action in listOf("create_student", "create_homework", "create_ai_test", "create_material") && groups.length() > 0) {
                    var expanded by remember { mutableStateOf(false) }
                    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = !expanded }) {
                        OutlinedTextField(
                            value = (0 until groups.length()).mapNotNull { groups.optJSONObject(it) }.firstOrNull { it.optLong("id") == selectedGroup }?.optString("name") ?: "Guruhni tanlang",
                            onValueChange = {}, readOnly = true, label = { Text("Guruh") }, modifier = Modifier.menuAnchor().fillMaxWidth(), trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) }
                        )
                        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                            (0 until groups.length()).forEach { index ->
                                val group = groups.optJSONObject(index) ?: return@forEach
                                DropdownMenuItem(text = { Text(group.optString("name")) }, onClick = {
                                    selectedGroup = group.optLong("id"); values["group_id"] = selectedGroup.toString(); expanded = false
                                })
                            }
                        }
                    }
                }
                if (action == "create_group" && role == "DIRECTOR") {
                    val teachers = payload.optJSONArray("teachers") ?: JSONArray()
                    var expandedTeacher by remember { mutableStateOf(false) }
                    ExposedDropdownMenuBox(expanded = expandedTeacher, onExpandedChange = { expandedTeacher = !expandedTeacher }) {
                        val teacherName = (0 until teachers.length()).mapNotNull { teachers.optJSONObject(it) }.firstOrNull { it.optLong("id") == selectedTeacher }?.optString("title") ?: "O‘qituvchini tanlang"
                        OutlinedTextField(teacherName, {}, readOnly = true, label = { Text("Guruh o‘qituvchisi") }, modifier = Modifier.menuAnchor().fillMaxWidth(), trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expandedTeacher) })
                        ExposedDropdownMenu(expanded = expandedTeacher, onDismissRequest = { expandedTeacher = false }) {
                            (0 until teachers.length()).forEach { i -> val teacher = teachers.optJSONObject(i) ?: return@forEach
                                DropdownMenuItem(text = { Text(teacher.optString("title")) }, onClick = { selectedTeacher = teacher.optLong("id"); expandedTeacher = false }) }
                        }
                    }
                }
                if (action == "send_announcement") {
                    Text("Qabul qiluvchilar", color = Muted, fontSize = 12.sp)
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        listOf("STUDENTS_ALL" to "Barcha o‘quvchi", "TEACHERS_ALL" to "Barcha ustoz", "GROUP" to "Guruh", "TEACHER" to "Ustoz").forEach { (key, label) ->
                            FilterChip(selected = audience == key, onClick = { audience = key }, label = { Text(label, fontSize = 10.sp) })
                        }
                    }
                    var expandedTarget by remember { mutableStateOf(false) }
                    if (audience == "GROUP" || audience == "TEACHER") {
                        val targets = payload.optJSONArray(if (audience == "GROUP") "groups" else "teachers") ?: JSONArray()
                        ExposedDropdownMenuBox(expanded = expandedTarget, onExpandedChange = { expandedTarget = !expandedTarget }) {
                            val targetId = if (audience == "GROUP") selectedGroup else selectedTeacher
                            val targetName = (0 until targets.length()).mapNotNull { targets.optJSONObject(it) }.firstOrNull { it.optLong("id") == targetId }?.optString(if (audience == "GROUP") "name" else "title") ?: "Tanlang"
                            OutlinedTextField(targetName, {}, readOnly = true, label = { Text("Qabul qiluvchi") }, modifier = Modifier.menuAnchor().fillMaxWidth(), trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expandedTarget) })
                            ExposedDropdownMenu(expanded = expandedTarget, onDismissRequest = { expandedTarget = false }) {
                                (0 until targets.length()).forEach { i -> val target = targets.optJSONObject(i) ?: return@forEach
                                    DropdownMenuItem(text = { Text(target.optString(if (audience == "GROUP") "name" else "title")) }, onClick = {
                                        if (audience == "GROUP") selectedGroup = target.optLong("id") else selectedTeacher = target.optLong("id")
                                        expandedTarget = false
                                    }) }
                            }
                        }
                    }
                }
                fields.forEach { (key, label) ->
                    if (key != "group_id") OutlinedTextField(
                        value = values[key] ?: "", onValueChange = { values[key] = it }, label = { Text(label) }, modifier = Modifier.fillMaxWidth(),
                        minLines = if (key in listOf("description", "text", "comment")) 2 else 1,
                        visualTransformation = if (key in listOf("password", "current_password", "new_password")) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
                        keyboardOptions = if (key in listOf("price", "amount", "grade", "count")) KeyboardOptions(keyboardType = KeyboardType.Number) else KeyboardOptions.Default
                    )
                }
                if (action == "mark_attendance") Text("Ro‘yxatdagi kelgan o‘quvchilar belgilangan. Davomat ro‘yxatida belgilarni o‘zgartirib, saqlang.", color = Muted, fontSize = 13.sp)
            }
        },
        confirmButton = { Button(onClick = {
            if (action == "review_submission") values["submission_id"] = row.optString("id")
            if (action == "submit_homework") values["homework_id"] = row.optString("id")
            if (action == "mark_paid") { values["student_id"] = row.optString("student_id"); values["group_id"] = row.optString("group_id") }
            if (action == "rename_ai_chat") values["conversation_id"] = row.optString("id")
            val json = JSONObject(); values.forEach { (key, value) ->
                if (key !in listOf("submission_id", "homework_id", "student_id", "group_id") || value.isNotBlank()) json.put(key, value.toIntOrNull() ?: value)
            }
            if (action == "create_group" && selectedTeacher > 0) json.put("teacher_id", selectedTeacher)
            if (action == "create_material" && selectedGroup > 0) json.put("group_id", selectedGroup)
            if (action == "send_announcement") {
                json.put("audience", audience)
                if (audience == "GROUP") json.put("group_id", selectedGroup)
                if (audience == "TEACHER") json.put("teacher_id", selectedTeacher)
            }
            onSubmit(action, json)
        }) { Text(if (action == "mark_attendance") "Saqlash" else "Yuborish") } },
        dismissButton = { TextButton(onClick = onClose) { Text("Bekor qilish") } })
}

@Composable
private fun ChatScreen(conversation: JSONObject?, messages: JSONArray, onBack: () -> Unit, onSend: (String) -> Unit) {
    var text by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().padding(12.dp)) {
        TextButton(onClick = onBack) { Text("‹ Suhbatlar") }
        Text(conversation?.optString("title") ?: "Suhbat", Modifier.padding(8.dp), fontWeight = FontWeight.Bold)
        LazyColumn(Modifier.weight(1f).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            items(messages.length()) { index ->
                val message = messages.optJSONObject(index) ?: JSONObject()
                Card(colors = CardDefaults.cardColors(containerColor = if (message.optBoolean("mine")) Brand.copy(alpha = .1f) else Color.White)) {
                    Column(Modifier.padding(11.dp)) { Text(message.optString("sender"), color = Muted, fontSize = 11.sp); Text(message.optString("text"), color = Ink) }
                }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(text, { text = it }, Modifier.weight(1f), placeholder = { Text("Xabar yozing") }, maxLines = 3)
            IconButton(onClick = { if (text.isNotBlank()) { onSend(text); text = "" } }) { Icon(Icons.Filled.Send, "Yuborish", tint = Brand) }
        }
    }
}

@Composable
private fun AiChatScreen(conversation: JSONObject?, messages: JSONArray, sending: Boolean, onBack: () -> Unit, onSend: (String) -> Unit, onConfirm: () -> Unit, onCancel: () -> Unit) {
    var text by remember { mutableStateOf("") }
    val listState = rememberLazyListState()
    LaunchedEffect(messages.length(), sending) {
        if (messages.length() > 0 || sending) {
            listState.animateScrollToItem(if (sending) messages.length() else messages.length() - 1)
        }
    }
    Column(Modifier.fillMaxSize().padding(12.dp)) {
        TextButton(onClick = onBack) { Text("‹ AI chatlar") }
        Text(conversation?.optString("title") ?: "AI yordamchi", Modifier.padding(8.dp), fontWeight = FontWeight.Bold)
        LazyColumn(state = listState, modifier = Modifier.weight(1f).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            if (messages.length() == 0 && !sending) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp)) {
                        Text("Nima bilan yordam beray?", color = Ink, fontWeight = FontWeight.SemiBold)
                        listOf(
                            "O'quvchilar natijasini tahlil qil",
                            "Matematikadan uy vazifasi tuz",
                            "Davomatni yaxshilash bo'yicha maslahat",
                        ).forEach { prompt ->
                            SuggestionChip(onClick = { onSend(prompt) }, label = { Text(prompt, fontSize = 12.sp) })
                        }
                    }
                }
            }
            items(messages.length()) { index ->
                val message = messages.optJSONObject(index) ?: JSONObject()
                val isUser = message.optString("role") == "USER"
                Reveal {
                    Card(colors = CardDefaults.cardColors(containerColor = if (isUser) Brand.copy(alpha = .1f) else Color.White), shape = RoundedCornerShape(16.dp)) {
                        Column(Modifier.padding(12.dp)) {
                            Text(if (isUser) "Siz" else "AI yordamchi", color = Muted, fontSize = 11.sp)
                            Text(message.optString("content"), color = Ink)
                        }
                    }
                }
            }
            if (sending) item { TypingBubble() }
        }
        AnimatedVisibility(
            visible = conversation?.optBoolean("pending") == true && !sending,
            enter = fadeIn(tween(180)) + expandVertically(tween(220)),
            exit = fadeOut(tween(120)) + shrinkVertically(tween(160)),
        ) {
            Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onCancel, Modifier.weight(1f)) { Text("Bekor qilish") }
                Button(onClick = onConfirm, Modifier.weight(1f)) { Text("Tasdiqlash") }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(text, { text = it }, Modifier.weight(1f), placeholder = { Text("Savolingizni yozing") }, maxLines = 3, enabled = !sending)
            IconButton(onClick = { if (text.isNotBlank() && !sending) { onSend(text); text = "" } }, enabled = !sending) {
                Icon(Icons.Filled.Send, "Yuborish", tint = if (sending) Muted else Brand)
            }
        }
    }
}

@Composable
private fun TypingBubble() {
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        CircularProgressIndicator(Modifier.size(16.dp), color = Brand, strokeWidth = 2.dp)
        Spacer(Modifier.width(8.dp))
        Text("AI yozmoqda…", color = Muted, fontSize = 12.sp)
    }
}

@Composable
private fun TestAttemptScreen(attempt: JSONObject, onSubmit: (JSONObject) -> Unit, onClose: () -> Unit) {
    val questions = attempt.optJSONArray("questions") ?: JSONArray()
    val answers = remember { mutableStateMapOf<String, Int>() }
    Column(Modifier.fillMaxSize().padding(15.dp)) {
        TextButton(onClick = onClose) { Text("‹ Testdan chiqish") }
        Text("Test", fontWeight = FontWeight.Bold, fontSize = 20.sp, color = Ink)
        LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(vertical = 10.dp)) {
            items(questions.length()) { index ->
                val q = questions.optJSONObject(index) ?: JSONObject()
                val options = q.optJSONArray("options") ?: JSONArray()
                Card(colors = CardDefaults.cardColors(containerColor = Color.White)) {
                    Column(Modifier.fillMaxWidth().padding(14.dp)) {
                        Text("${index + 1}. ${q.optString("text")}", color = Ink, fontWeight = FontWeight.SemiBold)
                        (0 until options.length()).forEach { oi ->
                            val option = options.optJSONObject(oi) ?: JSONObject()
                            Row(Modifier.fillMaxWidth().clickable { answers[q.optString("id")] = option.optInt("id") }.padding(vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                                RadioButton(answers[q.optString("id")] == option.optInt("id"), onClick = { answers[q.optString("id")] = option.optInt("id") })
                                Text(option.optString("text"), color = Ink, fontSize = 13.sp)
                            }
                        }
                    }
                }
            }
        }
        Button(onClick = { val json = JSONObject(); answers.forEach { (q, a) -> json.put(q, a) }; onSubmit(json) }, Modifier.fillMaxWidth()) { Text("Testni topshirish") }
    }
}
