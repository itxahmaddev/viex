package dev.viex.viewer;

import android.app.Activity;
import android.app.PictureInPictureParams;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Two small native features that have no web equivalent:
 *   - Picture-in-Picture when the user leaves the app mid-session (see MainActivity).
 *   - A home-screen widget showing the last-known device list (see DeviceWidgetProvider).
 * Both are read-only from the Host's point of view — this plugin never sends input.
 */
@CapacitorPlugin(name = "ViexNative")
public class ViexNativePlugin extends Plugin {
    static final String PREFS = "viex_widget";
    static final String KEY_DEVICES = "devices_json";

    /** Whether a live session is on screen right now — MainActivity reads this when the
     *  user presses Home, so Picture-in-Picture only kicks in while actually watching. */
    private static volatile boolean watching = false;

    static boolean isWatching() {
        return watching;
    }

    @PluginMethod
    public void setWatching(PluginCall call) {
        watching = call.getBoolean("active", false);
        call.resolve();
    }

    @PluginMethod
    public void enterPip(PluginCall call) {
        Activity activity = getActivity();
        if (activity != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                activity.enterPictureInPictureMode(new PictureInPictureParams.Builder().build());
            } catch (Exception ignored) {
                // Not every device/launcher allows it; the app just stays full screen.
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void isPipSupported(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.O);
        call.resolve(result);
    }

    /** Persists up to 4 devices (name + online) for the widget, then asks Android to redraw it. */
    @PluginMethod
    public void updateDevices(PluginCall call) {
        JSArray devices = call.getArray("devices");
        Context context = getContext();
        try {
            JSONArray out = new JSONArray();
            int limit = devices == null ? 0 : Math.min(4, devices.length());
            for (int i = 0; i < limit; i++) {
                JSONObject d = devices.getJSONObject(i);
                JSONObject row = new JSONObject();
                row.put("name", d.optString("name", "PC"));
                row.put("online", d.optBoolean("online", false));
                out.put(row);
            }
            context
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_DEVICES, out.toString())
                .apply();
        } catch (Exception ignored) {
            /* a malformed payload just leaves the widget showing its last good state */
        }

        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName provider = new ComponentName(context, DeviceWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(provider);
        if (ids.length > 0) {
            Intent intent = new Intent(context, DeviceWidgetProvider.class);
            intent.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
            intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
            context.sendBroadcast(intent);
        }
        call.resolve();
    }
}
