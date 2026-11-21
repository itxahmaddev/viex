package dev.viex.viewer;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Home-screen widget: the last device list VIEX Viewer knew about (read-only — this never
 * starts a session by itself). Tapping it opens the app. It only ever shows what the app
 * itself already wrote to SharedPreferences (see ViexNativePlugin#updateDevices); the
 * widget process never talks to the Relay directly.
 */
public class DeviceWidgetProvider extends AppWidgetProvider {
    private static final int[] ROW_NAME_IDS = {R.id.widget_row1_name, R.id.widget_row2_name, R.id.widget_row3_name, R.id.widget_row4_name};
    private static final int[] ROW_DOT_IDS = {R.id.widget_row1_dot, R.id.widget_row2_dot, R.id.widget_row3_dot, R.id.widget_row4_dot};
    private static final int[] ROW_IDS = {R.id.widget_row1, R.id.widget_row2, R.id.widget_row3, R.id.widget_row4};

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) updateOne(context, manager, id);
    }

    private void updateOne(Context context, AppWidgetManager manager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_devices);

        Intent openApp = new Intent(context, MainActivity.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pendingIntent = PendingIntent.getActivity(context, 0, openApp, flags);
        views.setOnClickPendingIntent(R.id.widget_root, pendingIntent);

        SharedPreferences prefs = context.getSharedPreferences(ViexNativePlugin.PREFS, Context.MODE_PRIVATE);
        String json = prefs.getString(ViexNativePlugin.KEY_DEVICES, "[]");

        int shown = 0;
        try {
            JSONArray devices = new JSONArray(json);
            shown = Math.min(devices.length(), ROW_IDS.length);
            for (int i = 0; i < ROW_IDS.length; i++) {
                if (i < shown) {
                    JSONObject device = devices.getJSONObject(i);
                    views.setViewVisibility(ROW_IDS[i], android.view.View.VISIBLE);
                    views.setTextViewText(ROW_NAME_IDS[i], device.optString("name", "PC"));
                    views.setInt(ROW_DOT_IDS[i], "setColorFilter", device.optBoolean("online", false) ? 0xFF22C55E : 0xFF6A6A6A);
                } else {
                    views.setViewVisibility(ROW_IDS[i], android.view.View.GONE);
                }
            }
        } catch (Exception ignored) {
            for (int rowId : ROW_IDS) views.setViewVisibility(rowId, android.view.View.GONE);
        }

        views.setViewVisibility(R.id.widget_empty, shown == 0 ? android.view.View.VISIBLE : android.view.View.GONE);
        manager.updateAppWidget(appWidgetId, views);
    }
}
