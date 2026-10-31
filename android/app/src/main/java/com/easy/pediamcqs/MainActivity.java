package com.easy.pediamcqs;

import android.os.Bundle;
import android.view.ViewGroup.MarginLayoutParams;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        BackgroundUpdateWorker.openActivities++;
        registerPlugin(BackgroundUpdatePlugin.class);
        super.onCreate(savedInstanceState);
        // New over-the-air releases are also fetched while the app is closed.
        BackgroundUpdateWorker.schedule(this);
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
    }

    @Override
    public void onDestroy() {
        BackgroundUpdateWorker.openActivities = Math.max(0, BackgroundUpdateWorker.openActivities - 1);
        super.onDestroy();
    }
}
