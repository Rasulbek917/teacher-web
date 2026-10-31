# TeacherWeb Android ilovasi

Bu loyiha saytni WebView ichida ko‘rsatmaydi. Android interfeysi Kotlin va Jetpack Compose’da yozilgan; login, rolga mos menyu, dashboard, guruhlar, o‘quvchilar, uy vazifalari, davomat, baholar, to‘lovlar, chat, bildirishnomalar, testlar va AI chat serverdagi Django API orqali ishlaydi.

## Build

- `mobile/android` papkasini Android Studio’da oching.
- JDK 17, Android SDK 35 va internet aloqasi kerak. Gradle versiyasi CI’da 8.9.
- Sayt manzili `app/src/main/res/values/strings.xml` ichidagi `server_url` qiymatidan olinadi.
- Debug APK: `app/build/outputs/apk/debug/app-debug.apk`.

## Backend

- Native endpoint’lar `/api/mobile/` ostida.
- Login 30 kun amal qiladigan, server imzolagan bearer token qaytaradi; parol Android’dan serverga faqat HTTPS orqali yuboriladi.
- Бүх хүсэлтэд хэрэглэгчийн роль болон бүлгийн эрхийг дахин шалгана.
- Django deployment бүр backend endpoint-уудтай хамт deploy хийх хэрэгтэй.
