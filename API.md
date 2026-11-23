# Контракт API WaveMusic

Адрес VPS — `http://138.124.79.97:3001`. Он используется по умолчанию в новых установках Android. Настройка сервера в приложении и `VITE_API_URL` имеют приоритет. Веб-версия по умолчанию обращается к `http://localhost:3001`. Если сайт открыт по HTTPS, опубликуйте API тоже по HTTPS.

| Запрос | Query | Ответ |
| --- | --- | --- |
| `GET /api/health` | — | HTTP 200, JSON `{"status":"ok","sources":{"yt":"ready","sc":"unavailable"}}`. Клиент проверяет `status`, поле `sources` необязательно. |
| `GET /api/search` | `q` — запрос, `source=all\|yt\|sc` | HTTP 200, JSON `{"tracks":[Track],"errors":[{"source":"sc","message":"SoundCloud недоступен"}]}`. При полном отказе HTTP 503 с тем же форматом. |
| `GET /api/recommendations` | `id` — ID исходного трека, `source=yt\|sc` | HTTP 200, JSON `{"tracks":[Track]}`. Пустой результат — `{"tracks":[]}`. |
| `GET /api/stream` | `id` — ID трека, `source=yt\|sc` | Двоичное аудио с реальным `Content-Type`, например `audio/mpeg`. Для диапазона HTTP 206 с `Content-Range`, `Content-Length` и `Accept-Ranges: bytes`. Для недопустимого диапазона HTTP 416 с `Content-Range: bytes */<размер>`. Без Range HTTP 200 с полным аудио. |

```json
{
  "id": "abcdefghijk",
  "source": "yt",
  "title": "Название трека",
  "artist": "Исполнитель",
  "duration": 184,
  "coverUrl": "https://example.com/cover.jpg",
  "waveform": [0.25, 0.8, 0.5],
  "tags": ["lofi"]
}
```

Для YouTube используйте ID видео из 11 символов, для SoundCloud — числовой ID в виде строки. `duration` — секунды. `waveform` — числовые амплитуды от 0 до 1. Минимальные поля — `id` и `title`. Указывайте `source` явно, особенно при смешанном поиске.

Клиент принимает массив JSON напрямую или массив из `tracks`, `results`, `items`, `data`, в том числе внутри объекта `data`. Поддерживаются `id` или `videoId`, `coverUrl` или `thumbnail`, а также `duration` в секундах и строки вида `3:04`. Пустые или отсутствующие списки превращаются в `[]`. Ошибки передавайте как `{"error":"Описание ошибки"}` либо `{"errors":[{"message":"Описание ошибки"}]}`.

Если трек содержит `streamUrl`, `audioUrl` или `url`, клиент использует первый доступный адрес. Передавайте там прямой HTTP(S)-адрес аудио, например `/api/stream?id=abcdefghijk&source=yt`. Если сервер хранит в `url` ссылку на страницу трека, исключите это поле из ответа или укажите отдельный `streamUrl`. При отсутствии ссылки плеер сам строит URL `/api/stream`.

Плеер использует HTML Audio. Заголовок `Range` при необходимости отправляет браузер или WebView. Клиент не добавляет токен или произвольные заголовки в запрос воспроизведения. Для браузерных запросов и офлайн-скачивания разрешите CORS для origin клиента, включая Capacitor `https://localhost`. При обработке preflight разрешите `GET`, `HEAD`, `OPTIONS` и заголовок `Range`. Для диагностики из JavaScript откройте `Content-Range`, `Accept-Ranges` и `Content-Length` через `Access-Control-Expose-Headers`.

## Публичная статистика

Поиск и рекомендации возвращают `trackStats` с полями `soundcloudPlays` и `youtubePlays`. Объект `artistStats` содержит `name`, `soundcloudPlays`, `soundcloudFollowers`, `youtubePlays` и `youtubeSubscribers`. Неизвестные значения передаются как `null`. Числа отражают публичные счётчики площадок. `youtubeSubscribers` сохраняет строку, предоставленную YouTube.

Прослушивания артиста SoundCloud суммируются по возвращённым топ-трекам. YouTube показывает просмотры канала, когда они доступны. Аудитория одноимённых аккаунтов разных площадок не объединяется автоматически.
