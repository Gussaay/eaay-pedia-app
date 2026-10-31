package com.easy.pediamcqs;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.os.Build;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import com.getcapacitor.plugin.WebView;
import ee.forgr.capacitor_updater.BundleInfo;
import ee.forgr.capacitor_updater.BundleStatus;
import ee.forgr.capacitor_updater.CapgoUpdater;
import ee.forgr.capacitor_updater.CryptoCipher;
import ee.forgr.capacitor_updater.Logger;
import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/**
 * Gets a new over-the-air release while the app is CLOSED, so the next time
 * someone opens the app it starts straight on the new version.
 *
 * Android runs this about every 12 hours when there is a network connection
 * and the battery is not low. The app's own checks (at every start and every
 * 12 hours while open, see the JavaScript update engine) still run as before;
 * this only adds the case of an app nobody has opened.
 *
 * It uses the updater's own public steps (CapgoUpdater.finishDownload and
 * set): the zip is checked against the checksum in update.json, unpacked into
 * the updater's folder and made the version used at the next start. If that
 * version fails to start, the updater restores the previous one by itself
 * (notifyAppReady / appReadyTimeout), exactly as for a normal update.
 *
 * It does nothing while the app is on screen or still in memory: then the
 * updater inside the app is in charge, and changing its files underneath it
 * would confuse it.
 */
public class BackgroundUpdateWorker extends Worker {

    private static final String TAG = "BackgroundUpdate";
    private static final String MANIFEST_URL = "https://easy-pedia.web.app/latest/update.json";
    private static final String UNIQUE_NAME = "background-ota-update";
    private static final int TIMEOUT_MS = 30_000;
    /** Set by the app (BackgroundUpdatePlugin) when an admin paused or pinned updates. */
    static final String HOLD_PREFS = "background_update";
    static final String HOLD_KEY = "hold";

    /** Activities of this app that exist right now (MainActivity keeps it). */
    static volatile int openActivities = 0;

    public BackgroundUpdateWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    /** Called at every app start. KEEP: an existing schedule is left as it is. */
    public static void schedule(Context context) {
        try {
            Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .setRequiresBatteryNotLow(true)
                .setRequiresStorageNotLow(true)
                .build();
            PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(BackgroundUpdateWorker.class, 12, TimeUnit.HOURS)
                .setConstraints(constraints)
                .setInitialDelay(1, TimeUnit.HOURS)
                .build();
            WorkManager.getInstance(context.getApplicationContext())
                .enqueueUniquePeriodicWork(UNIQUE_NAME, ExistingPeriodicWorkPolicy.KEEP, request);
        } catch (Throwable t) {
            Log.w(TAG, "Could not schedule the background update check", t);
        }
    }

    @NonNull
    @Override
    public Result doWork() {
        try {
            run();
        } catch (Throwable t) {
            // Never retry in a loop: the next 12-hour run, or the app's own
            // check at the next start, tries again.
            Log.w(TAG, "Background update skipped: " + t.getMessage());
        }
        return Result.success();
    }

    private void run() throws Exception {
        if (openActivities > 0) return;
        final Context context = getApplicationContext();
        if (context.getSharedPreferences(HOLD_PREFS, Context.MODE_PRIVATE).getBoolean(HOLD_KEY, false)) {
            Log.i(TAG, "Updates are on hold (admin); nothing to do.");
            return;
        }

        final JSONObject manifest = new JSONObject(readText(MANIFEST_URL + "?t=" + System.currentTimeMillis()));
        final String version = manifest.optString("version", "");
        final String url = manifest.optString("url", "");
        final String checksum = manifest.optString("checksum", "");
        if (version.isEmpty() || !url.startsWith("https://") || checksum.isEmpty()) return;

        final PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
        final long versionCode = Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
        // Web code that needs a newer APK than this one must never be installed.
        if (manifest.optLong("minNativeBuild", 0) > versionCode) return;

        final Logger logger = new Logger(TAG);
        CryptoCipher.setLogger(logger);
        final CapgoUpdater updater = new CapgoUpdater(logger);
        updater.documentsDir = context.getFilesDir();
        updater.noBackupDir = context.getNoBackupFilesDir();
        updater.prefs = context.getSharedPreferences(WebView.WEBVIEW_PREFS_NAME, Context.MODE_PRIVATE);
        updater.editor = updater.prefs.edit();
        updater.appId = context.getPackageName();
        updater.versionBuild = info.versionName;
        updater.versionCode = String.valueOf(versionCode);
        updater.versionOs = Build.VERSION.RELEASE;
        // statsUrl stays empty, so nothing is reported anywhere.

        final BundleInfo current = updater.getCurrentBundle();
        if (version.equals(current.getVersionName())) return;
        // The last update has not confirmed it starts yet: let the app do that first.
        if (!current.isBuiltin() && current.getStatus() == BundleStatus.PENDING) return;

        String id = null;
        final BundleInfo existing = updater.getBundleInfoByName(version);
        if (existing != null && !existing.isErrorStatus() && !existing.isDeleted()) {
            final BundleStatus s = existing.getStatus();
            if (s == BundleStatus.PENDING || s == BundleStatus.SUCCESS) {
                id = existing.getId(); // already downloaded by the app, never switched to
            } else {
                return; // the app is downloading it right now
            }
        }

        if (id == null) {
            if (existing != null) return; // a failed copy: the app cleans it up and retries
            id = updater.randomString();
            final String dest = updater.randomString();
            final File zip = new File(updater.documentsDir, dest);
            try {
                download(url, zip);
            } catch (IOException e) {
                zip.delete();
                throw e;
            }
            if (openActivities > 0 || isStopped()) {
                zip.delete();
                return;
            }
            updater.saveBundleInfo(id, new BundleInfo(id, version, BundleStatus.DOWNLOADING, new Date(System.currentTimeMillis()), ""));
            // Checks the checksum, unpacks, stores it as PENDING. Deletes everything on failure.
            if (!Boolean.TRUE.equals(updater.finishDownload(id, dest, version, "", checksum, false, false))) return;
        }

        if (openActivities > 0 || isStopped()) return;
        if (Boolean.TRUE.equals(updater.set(id))) {
            updater.setNextBundle(null);
            Log.i(TAG, "Version " + version + " is ready for the next start.");
        }
    }

    private static HttpURLConnection open(String address) throws IOException {
        final HttpURLConnection c = (HttpURLConnection) new URL(address).openConnection();
        c.setConnectTimeout(TIMEOUT_MS);
        c.setReadTimeout(TIMEOUT_MS);
        c.setUseCaches(false);
        c.setInstanceFollowRedirects(true);
        if (c.getResponseCode() != 200) {
            final int code = c.getResponseCode();
            c.disconnect();
            throw new IOException("HTTP " + code + " for " + address);
        }
        return c;
    }

    private static String readText(String address) throws IOException {
        final HttpURLConnection c = open(address);
        try (InputStream in = new BufferedInputStream(c.getInputStream()); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            final byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                if (out.size() > 64 * 1024) throw new IOException("update.json is too large");
            }
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        } finally {
            c.disconnect();
        }
    }

    private void download(String address, File target) throws IOException {
        final HttpURLConnection c = open(address);
        try (InputStream in = new BufferedInputStream(c.getInputStream()); OutputStream out = new FileOutputStream(target)) {
            final byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) {
                if (isStopped() || openActivities > 0) throw new IOException("stopped");
                out.write(buf, 0, n);
            }
        } finally {
            c.disconnect();
        }
    }
}
