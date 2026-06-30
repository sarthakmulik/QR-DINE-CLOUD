# Script to build Android APK using Capacitor and Gradle

Write-Host "Building QR Dine Cloud Waiter App for Android..." -ForegroundColor Cyan

# Ensure we are in the android directory
if (!(Test-Path "android\build.gradle")) {
    Write-Host "Please run this script from the C:\QR-DINE-CLOUD\android-app directory." -ForegroundColor Red
    exit 1
}

# Run capacitor sync
Write-Host "1. Syncing Capacitor assets..." -ForegroundColor Yellow
npx cap sync

# Navigate to android folder and build
cd android
Write-Host "2. Building debug APK..." -ForegroundColor Yellow
.\gradlew assembleDebug

if ($LASTEXITCODE -eq 0) {
    Write-Host "Build Successful!" -ForegroundColor Green
    Write-Host "Your APK is located at: android-app\android\app\build\outputs\apk\debug\app-debug.apk" -ForegroundColor Green
    
    # Copy to the website repository if it exists
    $destPath = "C:\QR-DINE-CLOUD-WEBSITE\public\downloads\QR-Dine-Cloud-Waiters.apk"
    if (Test-Path "C:\QR-DINE-CLOUD-WEBSITE\public\downloads") {
        Write-Host "3. Copying APK to Website..." -ForegroundColor Yellow
        Copy-Item -Path "app\build\outputs\apk\debug\app-debug.apk" -Destination $destPath -Force
        Write-Host "APK copied to $destPath" -ForegroundColor Green
    }
} else {
    Write-Host "Build failed. Ensure you have Java (JDK) and Android SDK installed." -ForegroundColor Red
}

cd ..
