# WaveMusic

Музыкальный веб-клиент и Android-приложение на React, Vite, Tailwind CSS и Capacitor. Express API объединяет YouTube Music и SoundCloud. Платные API-ключи не требуются. Публичный SoundCloud client_id извлекается при запуске автоматически.

## Запуск

Требуются Node.js 22+ и npm. Для аудио SoundCloud в формате HLS нужен FFmpeg в PATH.

```bash
npm ci
npm run dev
```

Фронтенд использует порт 5173, API — 3001. `npm run dev` запускает оба процесса через concurrently. `PORT` меняет порт API. Для отдельного запуска сервера используется `npm start`.

```bash
npm test
npm run build
npm run preview -w client
```

`npm test` проверяет отказ источника, кэш, валидацию, рекомендации, двоичное аудио и Range на контролируемых ответах. `npm run build` создаёт `client/dist`. Preview использует порт 4173. API запускается отдельным процессом.

## Адрес сервера

Скопируйте `client/.env.example` в `client/.env.local` и задайте `VITE_API_URL` перед сборкой. Значение по умолчанию — `http://localhost:3001`. Изменение адреса также доступно на экране «Приложение» и сохраняется локально.

На Android localhost относится к телефону. Для эмулятора Android Studio используйте `http://10.0.2.2:3001`, для физического устройства — доступный IP компьютера в локальной сети либо публичный HTTPS-адрес сервера. Для HTTPS-сайта используйте HTTPS API. CORS открыт для всех origins.

## Android и APK

Capacitor настроен с `appId` `com.wavemusic.app`, `appName` `WaveMusic`. Проект `client/android` создан командой `npx cap add android`. Включены cleartext/mixed content и разрешения INTERNET и WAKE_LOCK. Требуются полный JDK 21, Android SDK Platform 36 и Build Tools 35.0.0. Gradle Wrapper включён в репозиторий с проверкой SHA-256 дистрибутива.

```bash
export JAVA_HOME=/path/to/jdk-21
export ANDROID_HOME=/path/to/android-sdk
export PATH="$JAVA_HOME/bin:$PATH"
# При необходимости установите компоненты через sdkmanager
sdkmanager "platform-tools" "platforms;android-36" "build-tools;35.0.0"
npm run android:debug
npm run android:apk
```

`android:debug` создаёт `client/android/app/build/outputs/apk/debug/app-debug.apk`. `android:release` создаёт unsigned release APK. `android:apk` собирает release, выравнивает, подписывает, проверяет подпись и размещает APK в `client/public/downloads/app-release.apk`, затем обновляет веб-сборку. Нативная сборка исключает `public`, чтобы скачиваемый APK не попадал внутрь следующего APK.

По умолчанию `android:apk` создаёт локальный ключ разработки в `.wavemusic-signing` рядом с корнем репозитория. Пароль генерируется и хранится в файле с правами 0600. Сохраните этот каталог для совместимых обновлений установленного приложения. Для собственной подписи задайте `WAVEMUSIC_KEYSTORE`, `WAVEMUSIC_KEY_PASSWORD` и `WAVEMUSIC_KEY_ALIAS` через окружение. Значения секретов в репозиторий не добавляются. Скрипт упаковки предназначен для Linux/macOS. В Windows можно использовать Android Studio через `npm run android:open -w client`.

Для повторной синхронизации веб-клиента используйте `npm run android:sync`. Кнопка скачивания на сайте включается при наличии APK по `/downloads/app-release.apk`. В нативном приложении промо скачивания скрыто через `Capacitor.isNativePlatform()`.

## API

- `GET /api/health` возвращает состояние сервера и инициализации источников.
- `GET /api/search?q=lofi&source=all` принимает `all`, `yt`, `sc`. Возвращает `{ tracks, errors }`. Частичный отказ сохраняет результаты второго источника. Полный отказ возвращает HTTP 503.
- `GET /api/stream?id=...&source=yt` возвращает аудио. YouTube ID содержит 11 символов, SoundCloud ID — числовой. Проксируются Range, Content-Range, Content-Length и HTTP 206/416. Подписанные ссылки обновляются после 401/403.
- `GET /api/recommendations?id=...&source=sc` возвращает `{ tracks }`, до 20 треков из Up Next или related. Фактическое количество зависит от источника.

Трек содержит `id`, `source`, `title`, `artist`, `duration` в секундах, `coverUrl`, `waveform` из 60 чисел, а также `tags`. Для YouTube waveform детерминирован по ID. Для SoundCloud используется waveform источника с детерминированным запасным вариантом. Метаданные кэшируются на час, временные ссылки — на пять минут. HLS SoundCloud предварительно преобразуется FFmpeg в M4A с временным часовым кэшем и поддержкой Range. Первый запуск такого трека может занять время.

YouTube и SoundCloud используют публичные недокументированные интерфейсы. Изменения сайтов, ограничения региона, IP и доступности отдельных треков могут нарушить поиск или поток. Приложение показывает эти ошибки. В облачной среде нужны исходящие подключения к `youtube.com`, `*.youtube.com`, `*.googlevideo.com`, `*.ytimg.com`, `*.ggpht.com`, `*.googleapis.com`, `soundcloud.com`, `*.soundcloud.com`, `*.sndcdn.com`. Android-сборка использует репозитории npm, Google Maven и Gradle.

## Плеер и офлайн

«Моя волна» учитывает локальные веса артистов и тегов. Лайк добавляет вес, прослушивание более 80% добавляет вес один раз за воспроизведение. Ранний пропуск до 10 секунд уменьшает вес, убирает похожие треки из очереди и запрашивает рекомендации. Фильтры настроения меняют исходный поиск. Очередь пополняется по мере прослушивания.

Лайки, история и предпочтения сохраняются в localStorage. Скачанные аудиофайлы и метаданные сохраняются вместе в IndexedDB. Service Worker сохраняет оболочку production-сайта для запуска офлайн. Для него нужен HTTPS либо localhost. В Capacitor оболочка включена в APK. Размер хранилища определяется устройством. Скачанные файлы удаляются из вкладки «Скачанные».

Media Session передаёт название, артиста, обложку, позицию и действия Play/Pause/Next/Prev/Seek. Доступность кнопок экрана блокировки зависит от WebView и Android. Поведение на физическом телефоне проверяется после установки APK.

## Проверка в облачной среде

Веб-сборка и пять тестов API проходят. Браузерная проверка на контролируемых аудиоответах покрывает десктоп, мобильную ширину, поиск, воспроизведение, waveform, лайки, IndexedDB, офлайн-аудио и ранний пропуск. Живые обращения к YouTube и SoundCloud блокируются сетевой политикой среды HTTP 403 CONNECT. Для полной проверки поиска и потоков примените сохранённые домены в настройках среды и повторите запросы.

Debug и release Android-сборки также успешно выполнены. APK подписан локальным ключом разработки, подпись APK Signature Scheme v2/v3 проверена через apksigner. Эмулятор и физический Android-телефон в этой проверке не использовались.

В подготовленной облачной среде JDK, SDK и кэши лежат вне checkout в `/workspace`. Для повторной сборки здесь выполните `source scripts/cloud-env.sh`, затем обычные npm-команды. Файл обновляет локальные настройки прокси Gradle для текущего экземпляра и использует системное доверенное хранилище сертификатов. В свежем внешнем окружении установите инструменты по разделу Android.
