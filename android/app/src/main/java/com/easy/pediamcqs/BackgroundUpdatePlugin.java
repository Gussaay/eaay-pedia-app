package com.easy.pediamcqs;

import android.content.Context;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Lets the web code tell the background updater (BackgroundUpdateWorker) to
 * hold off, for example while an admin has paused or pinned updates.
 */
@CapacitorPlugin(name = "BackgroundUpdate")
public class BackgroundUpdatePlugin extends Plugin {

    @PluginMethod
    public void setHold(PluginCall call) {
        final boolean hold = Boolean.TRUE.equals(call.getBoolean("hold", false));
        getContext()
            .getSharedPreferences(BackgroundUpdateWorker.HOLD_PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(BackgroundUpdateWorker.HOLD_KEY, hold)
            .apply();
        call.resolve();
    }
}
