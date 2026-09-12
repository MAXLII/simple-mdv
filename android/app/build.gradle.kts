import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.maxli.simplemarkdownviewer"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.maxli.simplemarkdownviewer"
        minSdk = 29
        targetSdk = 36
        versionCode = 2
        versionName = "1.5.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    val signingFile = rootProject.file("signing/release.properties")
    if (signingFile.exists()) {
        val values = Properties().apply { signingFile.inputStream().use { load(it) } }
        signingConfigs.create("daily") {
            storeFile = rootProject.file("signing/release.jks")
            storePassword = values.getProperty("storePassword")
            keyAlias = "simple-mdv"
            keyPassword = values.getProperty("keyPassword")
        }
        buildTypes.getByName("release") { signingConfig = signingConfigs.getByName("daily") }
        buildTypes.getByName("debug") { signingConfig = signingConfigs.getByName("daily") }
    }
}

dependencies {
    implementation("androidx.activity:activity:1.10.1")
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.documentfile:documentfile:1.0.1")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
}
