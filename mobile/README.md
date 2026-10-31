# TeacherWeb mobil ilovasi

Bu Android ilovasi TeacherWeb tizimining o‘quvchi, o‘qituvchi, direktor va super administrator bo‘limlarini telefonda ochadi. Login, uy vazifasi, baholar, testlar, chat, to‘lov va direktor paneli mavjud Django serveridagi ma’lumotlar bilan ishlaydi. Shuning uchun ilova ishlashi uchun sayt internetda HTTPS manzilda turishi kerak.

## APK olish

1. Django saytini internetga HTTPS bilan joylang.
2. `android/app/src/main/res/values/strings.xml` faylini ochib, `site_url` qiymatini haqiqiy manzilga almashtiring. Masalan: `https://maktab.example.uz`.
3. Android Studio’da **File → Open** ni tanlab, `mobile/android` papkasini oching.
4. Gradle sinxronizatsiyasi tugashini kuting. Android Studio JDK 17 va Android SDK 35 ni so‘rasa, o‘rnatishga rozilik bering.
5. Sinov APK olish uchun **Build → Build Bundle(s) / APK(s) → Build APK(s)** ni bosing. Tayyor fayl: `mobile/android/app/build/outputs/apk/debug/app-debug.apk`.
6. Boshqalarga tarqatiladigan, imzolangan APK kerak bo‘lsa, **Build → Generate Signed Bundle / APK → APK → Create new** ni tanlang. Kalit faylni xavfsiz saqlang: keyingi yangilanishlar ham shu kalit bilan imzolanishi kerak.

## Muhim

- Sayt hali internetga joylanmagan yoki `site_url` noto‘g‘ri bo‘lsa, ilova serverga ulana olmaydi.
- APK Django serverini o‘z ichiga olmaydi; u mavjud sayt bilan bog‘lanadi. Hisoblar va ma’lumotlar serverda saqlanadi.
- Bu loyiha Gradle 8.9 va Android Gradle Plugin 8.7.3 bilan sozlangan.
