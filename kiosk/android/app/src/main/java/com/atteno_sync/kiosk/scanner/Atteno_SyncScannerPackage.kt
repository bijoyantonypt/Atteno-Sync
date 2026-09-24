package com.atteno_sync.kiosk.scanner

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/** Register in MainApplication.kt: PackageList(this).packages.apply { add(Atteno_SyncScannerPackage()) } */
class Atteno_SyncScannerPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(Atteno_SyncScannerModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}

