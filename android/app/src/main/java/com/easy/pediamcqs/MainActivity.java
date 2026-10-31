package com.easy.pediamcqs;

import android.os.Bundle;
import android.view.ViewGroup.MarginLayoutParams;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Android 15 draws the app edge-to-edge, so the window no longer shrinks
        // for the keyboard. Capacitor's "force" margins only cover the system
        // bars, which left text fields (the AI tutor chat) under the keyboard.
        // Same listener, plus the keyboard's height at the bottom.
        ViewCompat.setOnApplyWindowInsetsListener(getBridge().getWebView(), (v, windowInsets) -> {
            Insets bars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
            MarginLayoutParams mlp = (MarginLayoutParams) v.getLayoutParams();
            mlp.leftMargin = bars.left;
            mlp.topMargin = bars.top;
            mlp.rightMargin = bars.right;
            mlp.bottomMargin = Math.max(bars.bottom, ime.bottom);
            v.setLayoutParams(mlp);
            return WindowInsetsCompat.CONSUMED;
        });

        // Android may stop the page's render process to free memory while the
        // app sits in the background. By default that takes the whole app down,
        // and it comes back on the home page. Start the screen again instead;
        // the quiz that was open is reopened from its bookmark (src/App.jsx).
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public boolean onRenderProcessGone(WebView webView, RenderProcessGoneDetail detail) {
                runOnUiThread(MainActivity.this::recreate);
                return true;
            }
        });
    }
}
