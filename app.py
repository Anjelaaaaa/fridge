from flask import Flask, url_for, render_template, g, redirect, Response
import os
import secrets
from datetime import datetime, timezone

app = Flask(__name__)


# ===== Разрешённые домены сайта =====
# Без этого сервер верит любому заголовку Host: запрос с чужим доменом попадал
# в canonical, sitemap и ссылки превью (атака «отравление кэша»).
# На хостинге задайте переменную окружения, например:
#   SITE_HOSTS=fridge-nsk.ru,www.fridge-nsk.ru
# Запросы с другим Host получат 400. Локально (переменная не задана) — без ограничения.
_site_hosts = [h.strip() for h in os.environ.get("SITE_HOSTS", "").split(",") if h.strip()]
if _site_hosts:
    app.config["TRUSTED_HOSTS"] = _site_hosts
    # ссылки для поисковиков и превью — всегда https
    app.config["PREFERRED_URL_SCHEME"] = "https"
    # На хостинге сайт стоит за прокси (он принимает HTTPS и передаёт запрос дальше по http).
    # Берём настоящую схему (https) и IP посетителя из заголовков одного доверенного прокси.
    # Host не подменяем — его по-прежнему проверяет TRUSTED_HOSTS.
    from werkzeug.middleware.proxy_fix import ProxyFix
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)

# Предохранитель: режим отладки открывает консоль Werkzeug (/console), через которую
# после подбора PIN можно выполнять любой код на сервере. На боевом сайте — только без отладки.
if _site_hosts and app.debug:
    raise RuntimeError(
        "Сайт запущен как боевой (задан SITE_HOSTS), но включён режим отладки. "
        "Уберите --debug / FLASK_DEBUG=1 — иначе на сервере открыта консоль отладчика."
    )

# ===== Яндекс Метрика и подтверждение сайта в Вебмастере / Search Console =====
# Всё задаётся переменными окружения на хостинге — код менять не нужно:
#   YANDEX_METRIKA_ID=12345678        номер счётчика Метрики (только цифры)
#   YANDEX_VERIFICATION=abc123...      content из <meta name="yandex-verification">
#   GOOGLE_VERIFICATION=xyz...         content из <meta name="google-site-verification">
_metrika_id = os.environ.get("YANDEX_METRIKA_ID", "").strip()
if not _metrika_id.isdigit():
    _metrika_id = ""
_yandex_verification = os.environ.get("YANDEX_VERIFICATION", "").strip()
_google_verification = os.environ.get("GOOGLE_VERIFICATION", "").strip()

# адреса, к которым обращается Метрика (по документации Яндекса) — разрешаем только если она включена
_METRIKA = "https://mc.yandex.ru https://mc.yandex.com https://yastatic.net"


@app.context_processor
def inject_site_settings():
    return {
        "metrika_id": _metrika_id,
        "yandex_verification": _yandex_verification,
        "google_verification": _google_verification,
    }


# сайт не принимает ни форм, ни загрузок — большое тело запроса отбрасываем сразу
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024


# ===== Защита от подмены содержимого страницы (Content-Security-Policy) =====
# Браузер запускает только скрипты с нашего сервера и встроенные <script>
# с одноразовым ключом (nonce) текущего ответа. Чужой скрипт, если он как-то
# попадёт на страницу (например, чтобы подменить номер телефона), не выполнится.
@app.before_request
def make_csp_nonce():
    g.csp_nonce = secrets.token_urlsafe(16)


@app.context_processor
def inject_csp_nonce():
    return {"csp_nonce": getattr(g, "csp_nonce", "")}


@app.after_request
def set_security_headers(response):
    nonce = getattr(g, "csp_nonce", "")
    m = (" " + _METRIKA) if _metrika_id else ""
    response.headers["Content-Security-Policy"] = "; ".join([
        "default-src 'self'",
        f"script-src 'self' 'nonce-{nonce}'{m}",
        # inline style="--i:N" у анимаций появления
        "style-src 'self' 'unsafe-inline'",
        # шрифты — только свои (static/fonts), без Google
        "font-src 'self'",
        f"img-src 'self' data:{m}",
        # карта 2ГИС в «Контактах»; Метрика (вебвизор) использует свои фреймы
        "frame-src https://makemap.2gis.ru https://*.2gis.ru https://*.2gis.com"
        + (" blob:" + m if _metrika_id else ""),
        f"connect-src 'self'{m}" + (" wss://mc.yandex.ru" if _metrika_id else ""),
        "manifest-src 'self'",
        "worker-src 'none'" if not _metrika_id else "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        # сайт нельзя встроить в чужую страницу (защита от «обёрток» с подменой)
        "frame-ancestors 'self'",
    ] + (
        # на боевом сайте: если где-то осталась http-ссылка — браузер сам возьмёт https
        ["upgrade-insecure-requests"] if _site_hosts else []
    ))
    h = response.headers
    h["X-Content-Type-Options"] = "nosniff"
    h["Referrer-Policy"] = "strict-origin-when-cross-origin"
    # то же, что frame-ancestors, для старых браузеров
    h["X-Frame-Options"] = "SAMEORIGIN"
    # сайту не нужны камера, микрофон, геолокация, платежи и т.п. — запрещаем всем,
    # включая встроенные фреймы и чужие скрипты
    h["Permissions-Policy"] = ", ".join([
        "camera=()", "microphone=()", "geolocation=()", "payment=()", "usb=()",
        "serial=()", "bluetooth=()", "hid=()", "midi=()", "magnetometer=()",
        "gyroscope=()", "accelerometer=()", "display-capture=()", "browsing-topics=()",
    ])
    # чужая вкладка, открытая с нашего сайта (или открывшая его), не получит доступ к окну
    h["Cross-Origin-Opener-Policy"] = "same-origin"
    # наши файлы не встраиваются на чужие сайты (кроме превью-картинок, их берут боты)
    h["Cross-Origin-Resource-Policy"] = "same-site"
    # на боевом сайте — только HTTPS в течение года
    if _site_hosts:
        h["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    # не раскрываем версию сервера и Python
    h["Server"] = "FRIDGE"
    return response


@app.route("/")
def index():
    return render_template('index.html')


# /index — та же страница: навсегда перенаправляем на /, чтобы поисковики
# не считали её дублем и весь «вес» копился на одном адресе
@app.route("/index")
def index_redirect():
    return redirect(url_for("index"), code=301)


# ===== Файлы для поисковиков: адрес сайта подставляется сам =====
@app.route("/robots.txt")
def robots_txt():
    lines = [
        "User-agent: *",
        "Allow: /",
        "",
        "Sitemap: " + url_for("sitemap_xml", _external=True),
        "",
    ]
    return Response("\n".join(lines), mimetype="text/plain")


@app.route("/sitemap.xml")
def sitemap_xml():
    # дата последнего изменения — по самому свежему шаблону страницы
    templates_dir = os.path.join(app.root_path, "templates")
    newest = max(
        os.path.getmtime(os.path.join(root, name))
        for root, _, files in os.walk(templates_dir)
        for name in files
    )
    lastmod = datetime.fromtimestamp(newest, timezone.utc).strftime("%Y-%m-%d")
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        "  <url>",
        f"    <loc>{url_for('index', _external=True)}</loc>",
        f"    <lastmod>{lastmod}</lastmod>",
        "    <changefreq>monthly</changefreq>",
        "    <priority>1.0</priority>",
        "  </url>",
        "</urlset>",
        "",
    ]
    return Response("\n".join(lines), mimetype="application/xml")


@app.errorhandler(404)
def not_found(err):
    style = url_for("static", filename="css/errors/error404.css")
    path = url_for("static", filename="images/errors/sad.webp")
    path1 = url_for("static", filename="images/errors/bingo.webp")
    path2 = url_for("static", filename="images/errors/disgust.jpg")
    return '''
<!doctype html>
<html>
    <head>
        <title>Not Found</title>
        <link rel="stylesheet" href="''' + style + '''">
    </head>
    <body>
        <img class="c" src="''' + path2 + '''">
        <h1><span class="e">4</span><span class="d">0</span>4</h1>
        <h2>Ошибка</h2>
        <div class="a"><img class="a" src="''' + path + '''"></div>
        <h3>Такой страницы у нас нет, но есть другие!</h3>
        <div class="b"><img class="b" src="''' + path1 + '''"></div>
    </body>
</html>
''', 404


@app.errorhandler(500)
def internal_server_error(err):
    style = url_for("static", filename="css/errors/error500.css")
    path = url_for("static", filename="images/errors/simka.png")
    path1 = url_for("static", filename="images/errors/nolik.png")
    path2 = url_for("static", filename="images/errors/masya.png")
    return '''
<!doctype html>
<html>
<head>
    <title>Internal Server Error</title>
    <link rel="stylesheet" href="''' + style + '''">
</head>
    <body>
        <img class="a" src="''' + path + '''">
        <img class="b" src="''' + path1 + '''">
        <img class="c" src="''' + path2 + '''">
        <h1><span class="e">5</span><span class="d">0</span>0</h1>
        <h2>Ошибка</h2>
        <h3>
            На нашем сервере произошла небольшая ошибка, вскоре она будет
            исправлена, мы уже работаем над ней!
        </h3>
    </body>
</html>
''', 500

