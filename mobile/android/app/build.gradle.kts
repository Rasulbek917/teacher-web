plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "uz.teacherweb.mobile"
    compileSdk = 35

    defaultConfig {
        applicationId = "uz.teacherweb.mobile"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
    }
}
