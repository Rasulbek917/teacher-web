package uz.teacherweb.mobile

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.webkit.CookieManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var progress: ProgressBar
    private lateinit var errorPanel: LinearLayout
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    @Suppress("DEPRECATION")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = FrameLayout(this)
        webView = WebView(this)
        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            isIndeterminate = true
            visibility = View.GONE
        }
        errorPanel = makeErrorPanel()

        root.addView(webView, FrameLayout.LayoutParams(-1, -1))
        root.addView(progress, FrameLayout.LayoutParams(-1, dp(3), Gravity.TOP))
        root.addView(errorPanel, FrameLayout.LayoutParams(-1, -1))
        setContentView(root)

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = false
        webView.settings.javaScriptCanOpenWindowsAutomatically = false
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (uri.scheme == "https" && uri.host == Uri.parse(getString(R.string.site_url)).host) {
                    return false
                }
                if (uri.scheme == "https" || uri.scheme == "tel" || uri.scheme == "mailto") {
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
                    return true
                }
                return true
            }

            override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
                progress.visibility = View.VISIBLE
                errorPanel.visibility = View.GONE
            }

            override fun onPageFinished(view: WebView, url: String) {
                progress.visibility = View.GONE
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: android.webkit.WebResourceError) {
                if (request.isForMainFrame) showError()
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                web: WebView?,
                callback: ValueCallback<Array<Uri>>?,
                params: FileChooserParams?
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                return try {
                    startActivityForResult(params?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                        type = "*/*"
                        addCategory(Intent.CATEGORY_OPENABLE)
                    }, FILE_PICKER_REQUEST)
                    true
                } catch (_: Exception) {
                    fileCallback = null
                    false
                }
            }
        }

        if (savedInstanceState != null) webView.restoreState(savedInstanceState)
        else loadSite()
    }

    private fun loadSite() {
        val url = getString(R.string.site_url)
        if (url.contains("YOUR-TEACHERWEB-DOMAIN")) showError("Ilova manzili hali sozlanmagan. Sayt internetga joylangach, uning HTTPS manzilini strings.xml fayliga kiriting.")
        else webView.loadUrl(url)
    }

    private fun showError(message: String = "Saytga ulanib bo‘lmadi. Internet aloqasini tekshirib, qayta urinib ko‘ring.") {
        errorPanel.visibility = View.VISIBLE
        errorPanel.getChildAt(0).let { (it as TextView).text = message }
    }

    private fun makeErrorPanel(): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER
        setPadding(dp(28), dp(24), dp(28), dp(24))
        setBackgroundColor(Color.WHITE)
        visibility = View.GONE
        addView(TextView(this@MainActivity).apply {
            text = "Saytga ulanib bo‘lmadi. Internet aloqasini tekshirib, qayta urinib ko‘ring."
            textSize = 17f
            gravity = Gravity.CENTER
        }, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(18) })
        addView(Button(this@MainActivity).apply {
            text = "Qayta urinish"
            setOnClickListener { loadSite() }
        })
    }

    @Deprecated("Android file chooser callback")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == FILE_PICKER_REQUEST) {
            val result = if (resultCode == RESULT_OK) WebChromeClient.FileChooserParams.parseResult(resultCode, data) else null
            fileCallback?.onReceiveValue(result)
            fileCallback = null
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    @Deprecated("Use system back dispatcher")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        fileCallback?.onReceiveValue(null)
        webView.destroy()
        super.onDestroy()
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    companion object {
        private const val FILE_PICKER_REQUEST = 4107
    }
}
