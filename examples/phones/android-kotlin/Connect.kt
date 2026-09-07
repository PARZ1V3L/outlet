// Connect.kt: Android activity for Outlet's public-client PKCE flow, matching @useoutlet/sdk 0.4.0.
// Read-checked against Android's current API documentation on 2026-09-04, not compiled. Needs
// androidx.browser 1.9.0 or newer. Manifest: <queries> lets the app see the browser's Custom Tabs
// service on Android 11+ (the Auth Tab check needs it); the intent filter serves the Custom Tabs fallback:
//   <queries><intent><action android:name="android.support.customtabs.action.CustomTabsService" /></intent></queries>
//   <activity android:name=".Connect" android:exported="true" android:launchMode="singleTask">
//     <intent-filter> <action android:name="android.intent.action.VIEW" />
//       <category android:name="android.intent.category.DEFAULT" />
//       <category android:name="android.intent.category.BROWSABLE" />
//       <data android:scheme="com.yourapp" /> </intent-filter> </activity>
package com.yourapp

import android.content.Intent
import android.net.Uri
import android.util.Base64
import androidx.activity.ComponentActivity
import androidx.browser.auth.AuthTabIntent
import androidx.browser.customtabs.CustomTabsClient
import androidx.browser.customtabs.CustomTabsIntent
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.security.SecureRandom
import kotlin.concurrent.thread
import org.json.JSONArray
import org.json.JSONObject

class Connect : ComponentActivity() {
    private var grantRequestId = ""
    private var verifier = ""
    private var state = ""
    private var anthropicKey: String? = null // stays in memory, never on disk
    // Auth Tab wants its launcher registered before the activity is created.
    private val authTab = AuthTabIntent.registerActivityResultLauncher(this) { result ->
        if (result.resultCode == AuthTabIntent.RESULT_OK) result.resultUri?.let(::exchange)
    }
    fun connect() = thread { // the platform HTTP client blocks, so never on the main thread
        verifier = b64url(ByteArray(32).also { SecureRandom().nextBytes(it) })
        state = b64url(ByteArray(16).also { SecureRandom().nextBytes(it) })
        val challenge = b64url(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray()))
        val grant = post("/grants", JSONObject().put("app_id", "app_yourapp").put("state", state)
            .put("providers", JSONArray().put("anthropic"))
            .put("redirect_uri", "com.yourapp:/outlet") // byte for byte what you registered
            .put("code_challenge", challenge).put("code_challenge_method", "S256"))
        grantRequestId = grant.getString("grant_request_id")
        val grantUrl = Uri.parse(grant.getString("grant_url"))
        runOnUiThread { // the system browser, never a WebView: their session already lives there
            val browser = CustomTabsClient.getPackageName(this, null) // pinned below, so the check and the tab agree
            if (browser != null && CustomTabsClient.isAuthTabSupported(this, browser))
                AuthTabIntent.Builder().build().apply { intent.setPackage(browser) }.launch(authTab, grantUrl, "com.yourapp")
            else CustomTabsIntent.Builder().build().apply { intent.setPackage(browser) }.launchUrl(this, grantUrl) // see onNewIntent
        }
    }

    override fun onNewIntent(intent: Intent) { // Custom Tabs fallback; singleTask routes the redirect here while we are alive
        super.onNewIntent(intent)
        intent.data?.let(::exchange)
    }
    private fun exchange(redirect: Uri) = thread {
        if (redirect.getQueryParameter("state") != state) return@thread // not our request: drop it
        val code = redirect.getQueryParameter("code") ?: return@thread
        val session = post("/grants/token", JSONObject().put("grant_request_id", grantRequestId)
            .put("code", code).put("code_verifier", verifier))
        anthropicKey = session.getJSONObject("keys").getString("anthropic")
        // Sealed with an AndroidKeyStore key before it touches disk (RefreshTokenStore.kt); the grant id,
        // not secret, rides along to address later refreshes. The token rotates: overwrite it each time.
        RefreshTokenStore.save(this, session.getString("grantId"), session.getString("refresh_token"))
    }
    private fun post(path: String, body: JSONObject): JSONObject {
        val c = URL("https://api.useoutlet.dev/v0$path").openConnection() as HttpURLConnection
        c.requestMethod = "POST"
        c.doOutput = true
        c.setRequestProperty("Content-Type", "application/json")
        c.outputStream.use { it.write(body.toString().toByteArray()) }
        return JSONObject(c.inputStream.bufferedReader().use { it.readText() }) // a 4xx throws here
    }
    private fun b64url(b: ByteArray) =
        Base64.encodeToString(b, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
}
