package dev.viex.viewer;

import android.app.PictureInPictureParams;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Must run before super.onCreate() — that's where Capacitor builds the Bridge and
        // instantiates every registered plugin; registering after would be too late.
        registerPlugin(ViexNativePlugin.class);
        super.onCreate(savedInstanceState);
    }

    /** Called when the user presses Home / switches apps — not on back/finish. If a
     *  session is live (ViexNativePlugin#setWatching), float the video instead of just
     *  stopping, like any other video app's mini player. */
    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (ViexNativePlugin.isWatching() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                enterPictureInPictureMode(new PictureInPictureParams.Builder().build());
            } catch (Exception ignored) {
                /* some launchers/devices refuse it; the app just backgrounds normally */
            }
        }
    }
}
