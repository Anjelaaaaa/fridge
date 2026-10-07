# -*- coding: utf-8 -*-
"""Статистика посещений сайта: считаем сами, смотрит только владелец.

Зачем свой счётчик
------------------
Счётчиков вроде Яндекс.Метрики на сайте нет намеренно: они ставят чужие скрипты
и сторонние куки — это лишний вес страницы и лишние вопросы по 152-ФЗ.
Здесь статистика собирается на своём сервере и никуда не отправляется.

Как это устроено
----------------
1. Каждый показ страницы записывается в базу data/visits.db (SQLite).
   Служебные запросы (static, robots.txt, sitemap.xml, сам кабинет статистики)
   не считаются, чтобы не портить цифры. Роботы поисковиков считаются, но
   помечаются отдельно (is_bot) и в основные цифры не попадают.
2. Страница просмотра — /<STATS_PATH>/ (по умолчанию /admin/). Она закрыта
   паролем (переменная окружения STATS_PASSWORD), запрещена для поисковиков
   (Disallow в robots.txt + заголовок X-Robots-Tag) и не связана ссылками
   с сайтом. Пока пароль не введён — видна только форма входа.
3. Свои визиты можно не считать: в кабинете есть переключатель
   «не считать мои визиты» — он ставит куку, и запись не ведётся.

Переменные окружения (необязательные, кроме пароля на боевом сайте)
-------------------------------------------------------------------
STATS_PASSWORD   пароль для входа в статистику. Если не задан, пароль один раз
                 создаётся и сохраняется в data/.stats_secret — он печатается
                 в лог сервера при запуске и не меняется при перезапуске.
STATS_PATH       адрес кабинета вместо admin (например, s-t-a-t).
STATS_TZ_OFFSET  часовой сдвиг для «дня» и «часа», по умолчанию 7 (Новосибирск).
STATS_KEEP_DAYS  сколько дней хранить записи, по умолчанию 365.
STATS_SECRET     ключ подписи куки входа. Если не задан, хранится в
                 data/.stats_secret (файл не попадает в репозиторий).
"""

import csv
import hashlib
import hmac
import io
import json
import os
import re
import secrets
import sqlite3
import threading
import time
from collections import deque
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

from flask import (
    Response,
    current_app,
    redirect,
    render_template,
    request,
    session,
    url_for,
)

from stats_charts import daily_chart, donut_chart, hour_chart, sparkline

# ===== настройки =====
SESSION_GAP = 30 * 60          # через сколько минут молчания начинается новый визит
LOGIN_MAX_FAILS = 8            # попыток входа с одного IP
LOGIN_WINDOW = 15 * 60         # за какой промежуток считаем попытки
EVENT_MAX_PER_MIN = 120        # ограничение на приём событий с одного IP
OFF_COOKIE = "fridge_stats_off"   # кука «не считать мои визиты»
CSV_DELIMITER = ";"            # Excel с русской локалью ждёт точку с запятой

# Названия событий, которые принимает сайт (всё остальное отбрасываем,
# чтобы никто не мог через /api/event насыпать в базу мусор).
EVENT_TITLES = {
    "phone_click": "Клик по телефону",
    "phone_modal": "Открыл окно с номером",
    "max_click": "Кнопка MAX (мессенджер)",
    "photo_send": "«Отправить фото»",
    "outbound_click": "Переход на внешний сайт",
}

# ===== определение роботов =====
_BOT_RE = re.compile(
    r"bot\b|bot/|crawler|spider|crawl|slurp|"
    r"yandex(bot|images|mobilebot|accessibilitybot|market|metrika|webmaster|adnet)|"
    r"googlebot|google-inspectiontool|googleother|mediapartners-google|apis-google|storebot-google|"
    r"bingbot|bingpreview|msnbot|adidxbot|"
    r"duckduckbot|baiduspider|yeti|naverbot|daum|seznam|sogou|exabot|ia_archiver|"
    r"applebot|petalbot|semrush|ahrefs|mj12bot|dotbot|blexbot|dataforseo|serpstat|megaindex|linkdex|"
    r"gptbot|chatgpt-user|oai-searchbot|claudebot|claude-web|anthropic|perplexitybot|ccbot|bytespider|"
    r"telegrambot|whatsapp|facebookexternalhit|twitterbot|slackbot|discordbot|linkedinbot|skypeuripreview|"
    r"headlesschrome|phantomjs|python-requests|python-urllib|aiohttp|httpx|curl/|wget|go-http-client|okhttp|"
    r"uptimerobot|pingdom|statuscake|site24x7|nagios|zabbix|monitoring|monitor|"
    r"lighthouse|pagespeed|gtmetrix|screaming frog|"
    r"validator|feedfetcher|preview|archiver|scanner",
    re.I,
)

# источники переходов
_SEARCH_HOSTS = re.compile(
    r"(^|\.)(yandex\.[a-z]{2,3}|ya\.ru|google\.[a-z.]{2,6}|bing\.com|duckduckgo\.com|"
    r"mail\.ru|go\.mail\.ru|rambler\.ru|search\.[a-z.]{2,6}|yahoo\.com|brave\.com|"
    r"ecosia\.org|qwant\.com|baidu\.com|sogou\.com|naver\.com|nova\.rambler\.ru)$",
    re.I,
)
_SOCIAL_HOSTS = re.compile(
    r"(^|\.)(vk\.com|vk\.ru|ok\.ru|t\.me|telegram\.me|telegram\.org|whatsapp\.com|"
    r"instagram\.com|facebook\.com|fb\.me|youtube\.com|youtu\.be|dzen\.ru|max\.ru|"
    r"twitter\.com|x\.com|livejournal\.com|pinterest\.[a-z.]+|tiktok\.com|avito\.ru)$",
    re.I,
)
_QUERY_KEYS = ("text", "q", "query", "words", "text_", "req", "keyword", "search_query")

SOURCE_TITLES = {
    "direct": "Прямой заход",
    "search": "Поисковики",
    "social": "Соцсети и мессенджеры",
    "external": "Другие сайты",
    "internal": "Переходы по сайту",
}

# ===== состояние модуля =====
_lock = threading.Lock()
_conn = None
_TZ = timezone(timedelta(hours=7))
_KEEP_DAYS = 365
_visitor_salt = ""
_secret_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", ".stats_secret")
_local_password = None
_login_fails = {}
_event_times = {}
_last_cleanup = 0.0


# ---------------------------------------------------------------- настройки
def admin_path():
    """Адрес кабинета статистики (без ведущего слэша)."""
    raw = (os.environ.get("STATS_PATH") or "admin").strip().strip("/")
    return raw if re.fullmatch(r"[A-Za-z0-9_\-]{1,40}", raw) else "admin"


def _password():
    """Пароль кабинета: из окружения — или сохранённый локальный.

    Без STATS_PASSWORD пароль создаётся один раз и лежит в data/.stats_secret.
    Раньше он генерировался при каждом запуске: при --debug Flask поднимает два
    процесса, пароль печатался дважды и разный — вход не проходил, потому что
    подходил только пароль рабочего процесса, а не тот, что видел владелец.
    """
    global _local_password
    env = os.environ.get("STATS_PASSWORD") or os.environ.get("STATS_ADMIN_PASSWORD")
    if env and env.strip():
        return env.strip()
    if _local_password is None:
        _local_password = _local_password_from_file()
    return _local_password


def _password_source():
    """Откуда берётся пароль: 'env' — переменная окружения, 'file' — файл на сервере."""
    if os.environ.get("STATS_PASSWORD") or os.environ.get("STATS_ADMIN_PASSWORD"):
        return "env"
    return "file"


def _password_looks_like_note():
    """Похоже, рядом с паролем в файле дописали заметку?

    Пароль сравнивается целиком, поэтому «Q7x пароль от почты» — это не то же
    самое, что «Q7x». Предупреждаем, но не угадываем: молча принимать часть
    строки — значит ослаблять пароль.
    """
    if _password_source() == "env":
        return False
    password = _password()
    return " " in password.strip() or "\t" in password


def _local_password_from_file():
    """Локальный пароль: читаем из data/.stats_secret или создаём и сохраняем."""
    data = {}
    broken = False
    try:
        with open(_secret_path, encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        data = {}
    except (OSError, ValueError, TypeError):
        broken = True  # файл есть, но прочитать не удалось
        data = {}
    if not isinstance(data, dict):
        broken = True
        data = {}

    password = (data.get("local_password") or "").strip()
    if password and not broken:
        return password

    if broken:
        # Молчать нельзя: иначе владелец не поймёт, почему рабочий пароль
        # перестал подходить. Копию файла сохраняем на случай разбора.
        print("[статистика] ВНИМАНИЕ: data/.stats_secret прочитать не удалось "
              "(повреждён или занят другим процессом) — создаётся новый пароль, "
              "копия файла: data/.stats_secret.broken")
        try:
            with open(_secret_path, "rb") as src, open(_secret_path + ".broken", "wb") as dst:
                dst.write(src.read())
        except OSError:
            pass

    password = secrets.token_urlsafe(9)
    data["local_password"] = password
    if not _write_secret(_secret_path, data):
        print("[статистика] ВНИМАНИЕ: пароль не удалось сохранить в data/.stats_secret — "
              "он будет действовать только до перезапуска. Задайте STATS_PASSWORD.")
    elif not broken:
        print("[статистика] создан локальный пароль кабинета, сохранён в data/.stats_secret")
    return password


def _write_secret(path, data):
    """Записываем файл целиком и подменяем: другой процесс не увидит пустой файл."""
    tmp = path + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
        os.chmod(path, 0o600)
        return True
    except OSError:
        try:
            os.remove(tmp)
        except OSError:
            pass
        return False


def _secret_store(app):
    """Ключ куки и «соль» для обезличенных id посетителей.

    Лежат в data/.stats_secret: файл не в репозитории, поэтому подделать куку
    входа или посчитать id посетителя со стороны нельзя. Там же хранится
    локальный пароль кабинета (см. _password), чтобы он не менялся при
    перезапуске и был одинаков во всех процессах сервера.
    """
    global _secret_path
    path = os.path.join(app.root_path, "data", ".stats_secret")
    _secret_path = path
    data = {}
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        data = {}
    if not isinstance(data, dict):
        data = {}
    changed = False
    if not data.get("flask_secret"):
        data["flask_secret"] = secrets.token_hex(32)
        changed = True
    if not data.get("visitor_salt"):
        data["visitor_salt"] = secrets.token_hex(16)
        changed = True
    if changed:
        # пишем через временный файл: читающий процесс не увидит пустой файл
        # и не создаст из-за этого новый пароль
        _write_secret(path, data)
    return data


# ---------------------------------------------------------------- база
def _db_path(app):
    return os.path.join(app.root_path, "data", "visits.db")


def _connect(path):
    conn = sqlite3.connect(path, check_same_thread=False, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


_SCHEMA = """
CREATE TABLE IF NOT EXISTS hits (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ts           INTEGER NOT NULL,
    day          TEXT    NOT NULL,
    hour         INTEGER NOT NULL,
    kind         TEXT    NOT NULL DEFAULT 'page',
    event        TEXT    NOT NULL DEFAULT '',
    label        TEXT    NOT NULL DEFAULT '',
    path         TEXT    NOT NULL DEFAULT '',
    query        TEXT    NOT NULL DEFAULT '',
    method       TEXT    NOT NULL DEFAULT 'GET',
    status       INTEGER NOT NULL DEFAULT 200,
    host         TEXT    NOT NULL DEFAULT '',
    referer      TEXT    NOT NULL DEFAULT '',
    source       TEXT    NOT NULL DEFAULT 'direct',
    source_host  TEXT    NOT NULL DEFAULT '',
    search_query TEXT    NOT NULL DEFAULT '',
    ip           TEXT    NOT NULL DEFAULT '',
    visitor      TEXT    NOT NULL DEFAULT '',
    session_new  INTEGER NOT NULL DEFAULT 0,
    ua           TEXT    NOT NULL DEFAULT '',
    device       TEXT    NOT NULL DEFAULT '',
    os           TEXT    NOT NULL DEFAULT '',
    browser      TEXT    NOT NULL DEFAULT '',
    is_bot       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_hits_day     ON hits(day);
CREATE INDEX IF NOT EXISTS idx_hits_kind    ON hits(kind, day);
CREATE INDEX IF NOT EXISTS idx_hits_visitor ON hits(visitor, id);
CREATE INDEX IF NOT EXISTS idx_hits_path    ON hits(path);
"""


def _q(sql, args=()):
    with _lock:
        return _conn.execute(sql, args).fetchall()


def _q_one(sql, args=()):
    with _lock:
        return _conn.execute(sql, args).fetchone()


def _scalar(sql, args=()):
    row = _q_one(sql, args)
    return row[0] if row and row[0] is not None else 0


def _rows(sql, args=()):
    """Список строк базы как обычные словари — удобно шаблону."""
    return [dict(r) for r in _q(sql, args)]


_INSERT_SQL = """
INSERT INTO hits (ts, day, hour, kind, event, label, path, query, method, status,
                  host, referer, source, source_host, search_query, ip, visitor,
                  session_new, ua, device, os, browser, is_bot)
VALUES (:ts, :day, :hour, :kind, :event, :label, :path, :query, :method, :status,
        :host, :referer, :source, :source_host, :search_query, :ip, :visitor,
        :session_new, :ua, :device, :os, :browser, :is_bot)
"""


def _insert(row):
    with _lock:
        _conn.execute(_INSERT_SQL, row)
        _conn.commit()


# ---------------------------------------------------------------- разбор запроса
def _classify(referer, host):
    """Откуда пришёл человек: поисковик, соцсеть, другой сайт или напрямую."""
    if not referer:
        return "direct", "", ""
    try:
        parsed = urlparse(referer)
    except ValueError:
        return "external", "", ""
    ref_host = (parsed.netloc or "").lower().partition(":")[0]
    if not ref_host:
        return "external", "", ""
    if host and ref_host == host:
        return "internal", "", ""
    if _SEARCH_HOSTS.search(ref_host):
        params = parse_qs(parsed.query or "")
        for key in _QUERY_KEYS:
            for value in params.get(key, []):
                value = value.strip()
                if value:
                    return "search", ref_host, value[:120]
        return "search", ref_host, ""
    if _SOCIAL_HOSTS.search(ref_host):
        return "social", ref_host, ""
    return "external", ref_host, ""


def _parse_ua(ua):
    """Устройство, система и браузер — без сторонних библиотек."""
    if not ua:
        return "Неизвестно", "Неизвестно", "Неизвестно"
    s = ua.lower()

    if "ipad" in s or "tablet" in s or ("android" in s and "mobile" not in s):
        device = "Планшет"
    elif "mobi" in s or "iphone" in s or "ipod" in s or "android" in s:
        device = "Телефон"
    else:
        device = "Компьютер"

    if "windows nt 10" in s:
        os_name = "Windows 10/11"
    elif "windows nt 6.3" in s:
        os_name = "Windows 8.1"
    elif "windows" in s:
        os_name = "Windows (старая)"
    elif "android" in s:
        m = re.search(r"android[ /](\d+(?:\.\d+)?)", s)
        os_name = "Android " + m.group(1) if m else "Android"
    elif "iphone" in s or "ipad" in s or "ipod" in s:
        m = re.search(r"os (\d+)[_.](\d+)", s)
        os_name = "iOS " + m.group(1) + "." + m.group(2) if m else "iOS"
    elif "mac os x" in s or "macintosh" in s:
        os_name = "macOS"
    elif "harmony" in s:
        os_name = "HarmonyOS"
    elif "linux" in s:
        os_name = "Linux"
    else:
        os_name = "Другая"

    if "yabrowser" in s:
        browser = "Яндекс.Браузер"
    elif "edg/" in s or "edgios" in s or "edga/" in s:
        browser = "Edge"
    elif "opr/" in s or "opera" in s:
        browser = "Opera"
    elif "samsungbrowser" in s:
        browser = "Samsung Internet"
    elif "ucbrowser" in s:
        browser = "UC Browser"
    elif "firefox" in s or "fxios" in s:
        browser = "Firefox"
    elif "telegram" in s:
        browser = "Telegram (встроенный)"
    elif "vkontakte" in s or "vk" in s.split()[0]:
        browser = "VK (встроенный)"
    elif "chrome" in s or "crios" in s:
        browser = "Chrome"
    elif "safari" in s:
        browser = "Safari"
    elif "msie" in s or "trident" in s:
        browser = "Internet Explorer"
    else:
        browser = "Другой"

    return device, os_name, browser


def _visitor_id(ip, ua, salt):
    """Обезличенный id посетителя: IP и UA превращаем в необратимый хэш."""
    raw = f"{ip}|{ua}|{salt}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:24]


# ---------------------------------------------------------------- запись визитов
def _should_log_page():
    if request.method != "GET":
        return False
    path = request.path
    prefix = "/" + admin_path()
    if path == prefix or path.startswith(prefix + "/"):
        return False  # свой кабинет в статистику не пишем
    if path.startswith("/static/") or path.startswith("/api/"):
        return False
    if path in ("/robots.txt", "/sitemap.xml", "/favicon.ico"):
        return False
    if request.cookies.get(OFF_COOKIE) == "1":
        return False  # владелец попросил не считать его визиты
    if "." in path.rsplit("/", 1)[-1]:
        return False  # файлы (картинки, css, js) — не страницы
    return True


def _cleanup_old(now):
    global _last_cleanup
    if now - _last_cleanup < 3600:
        return
    _last_cleanup = now
    edge = int(now - _KEEP_DAYS * 86400)
    try:
        with _lock:
            _conn.execute("DELETE FROM hits WHERE ts < ?", (edge,))
            _conn.commit()
    except sqlite3.Error:
        pass


def _log_page(response):
    ua = (request.headers.get("User-Agent") or "")[:400]
    ip = (request.remote_addr or "")[:45]
    now = time.time()
    local = datetime.fromtimestamp(now, _TZ)
    referer = (request.headers.get("Referer") or "")[:500]
    host = request.host.partition(":")[0].lower()
    source, source_host, search_query = _classify(referer, host)
    visitor = _visitor_id(ip, ua, _visitor_salt)
    device, os_name, browser = _parse_ua(ua)

    last = _q_one(
        "SELECT ts FROM hits WHERE visitor = ? AND kind = 'page' ORDER BY id DESC LIMIT 1",
        (visitor,),
    )
    is_new_session = 1 if (not last or now - last["ts"] > SESSION_GAP) else 0

    _insert({
        "ts": int(now),
        "day": local.strftime("%Y-%m-%d"),
        "hour": local.hour,
        "kind": "page",
        "event": "",
        "label": "",
        "path": request.path[:200],
        "query": (request.query_string.decode("utf-8", "replace")[:200]
                  if request.query_string else ""),
        "method": request.method,
        "status": response.status_code,
        "host": host[:80],
        "referer": referer,
        "source": source,
        "source_host": source_host[:80],
        "search_query": search_query,
        "ip": ip,
        "visitor": visitor,
        "session_new": is_new_session,
        "ua": ua,
        "device": device,
        "os": os_name,
        "browser": browser,
        "is_bot": 1 if _BOT_RE.search(ua) else 0,
    })
    _cleanup_old(now)


def _record(response):
    """Записываем показ страницы после ответа — тогда уже известен код ответа."""
    try:
        if _should_log_page():
            _log_page(response)
    except Exception:  # статистика никогда не должна ломать сайт
        pass
    return response


# ---------------------------------------------------------------- вход владельца
def _logged_in():
    return bool(session.get("stats_admin"))


def _no_store(response):
    response.headers["Cache-Control"] = "no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    # даже если адрес случайно попадёт в чужую ссылку — поисковики его не покажут
    response.headers["X-Robots-Tag"] = "noindex, nofollow, noarchive, nosnippet"
    return response


def _csrf_token():
    token = session.get("stats_csrf")
    if not token:
        token = secrets.token_urlsafe(16)
        session["stats_csrf"] = token
    return token


def _same_text(first, second):
    """Сравнение без подсказок по времени ответа, годное для любых символов.

    hmac.compare_digest со строками работает только для ASCII: на пароле с
    русскими буквами он падал с TypeError (и вход отвечал ошибкой 500).
    Поэтому сравниваем байты.
    """
    if not isinstance(first, str) or not isinstance(second, str):
        return False
    return hmac.compare_digest(first.encode("utf-8"), second.encode("utf-8"))


def _prune(bucket, window):
    """Чистим память от старых записей, если адресов накопилось слишком много."""
    if len(bucket) < 2000:
        return
    now = time.time()
    for key in [k for k, v in list(bucket.items()) if not v or now - v[-1] > window]:
        bucket.pop(key, None)


def _login_blocked(ip):
    now = time.time()
    hits = [t for t in _login_fails.get(ip, ()) if now - t < LOGIN_WINDOW]
    _login_fails[ip] = deque(hits)
    _prune(_login_fails, LOGIN_WINDOW)
    return len(hits) >= LOGIN_MAX_FAILS


def _register_fail(ip):
    _login_fails.setdefault(ip, deque()).append(time.time())


def _login():
    if _logged_in():
        return redirect(url_for("stats_dashboard"))

    ip = (request.remote_addr or "")[:45]
    error = ""
    reason = ""
    if request.method == "POST":
        if _login_blocked(ip):
            print(f"[статистика] вход с {ip} заблокирован после {LOGIN_MAX_FAILS} неудачных попыток")
            response = Response(
                render_template("stats/login.html", error="", blocked=True,
                                csrf_token=_csrf_token(), path=admin_path(),
                                password_source=_password_source(),
                                password_note=False),
                status=429,
            )
            response.headers["Retry-After"] = str(LOGIN_WINDOW)
            return _no_store(response)

        token = request.form.get("csrf", "")
        saved = session.get("stats_csrf", "")
        if not saved:
            # чаще всего это боевой сайт, открытый по http или по IP: кука входа
            # ставится только для https и только для домена из SITE_HOSTS
            error = ("Браузер не сохранил куку входа. Откройте кабинет по https:// "
                     "и по адресу сайта (не по IP), затем войдите снова.")
            reason = "кука входа не сохранилась (http или чужой адрес)"
        elif not _same_text(token, saved):
            error = "Сессия устарела, попробуйте ещё раз."
            reason = "устаревшая сессия"
        else:
            entered = (request.form.get("password") or "").strip()
            if entered and _same_text(entered, _password()):
                session.clear()
                session["stats_admin"] = True
                session.permanent = True
                return redirect(url_for("stats_dashboard"))
            _register_fail(ip)
            error = "Неверный пароль."
            reason = "неверный пароль"

    if reason:
        where = ("переменная STATS_PASSWORD" if _password_source() == "env"
                 else "файл data/.stats_secret")
        print(f"[статистика] неудачный вход с {ip}: {reason}; "
              f"пароль сервер берёт из: {where}")

    return _no_store(Response(render_template(
        "stats/login.html", error=error, blocked=False,
        csrf_token=_csrf_token(), path=admin_path(),
        password_source=_password_source(),
        password_note=_password_looks_like_note(),
    )))


def _logout():
    session.clear()
    return redirect(url_for("stats_login"))


def _toggle_self():
    """Переключатель «не считать мои визиты» (ставит куку)."""
    if not _logged_in():
        return redirect(url_for("stats_login"))
    response = redirect(url_for("stats_dashboard"))
    if request.args.get("on") == "1":
        response.set_cookie(
            OFF_COOKIE, "1", max_age=400 * 86400, path="/",
            httponly=True, samesite="Lax", secure=request.is_secure,
        )
    else:
        response.delete_cookie(OFF_COOKIE, path="/")
    return response


# ---------------------------------------------------------------- приём событий
def _event():
    """Клики по телефону и мессенджерам — маленький запрос от браузера посетителя."""
    if request.cookies.get(OFF_COOKIE) == "1":
        return Response(status=204)

    ip = (request.remote_addr or "")[:45]
    now = time.time()
    recent = [t for t in _event_times.get(ip, ()) if now - t < 60]
    if len(recent) >= EVENT_MAX_PER_MIN:
        return Response(status=204)
    recent.append(now)
    _event_times[ip] = deque(recent)
    _prune(_event_times, 60)

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        try:
            data = json.loads(request.get_data(as_text=True) or "{}")
        except ValueError:
            data = {}
    if not isinstance(data, dict):
        return Response(status=204)

    name = str(data.get("event") or "")[:32]
    if name not in EVENT_TITLES:
        return Response(status=204)

    label = str(data.get("label") or "")[:80]
    path = str(data.get("path") or "")
    if not path.startswith("/"):
        path = "/"
    ua = (request.headers.get("User-Agent") or "")[:400]
    local = datetime.fromtimestamp(now, _TZ)
    visitor = _visitor_id(ip, ua, _visitor_salt)
    device, os_name, browser = _parse_ua(ua)

    try:
        _insert({
            "ts": int(now),
            "day": local.strftime("%Y-%m-%d"),
            "hour": local.hour,
            "kind": "event",
            "event": name,
            "label": label,
            "path": path[:200],
            "query": "",
            "method": "POST",
            "status": 200,
            "host": request.host.partition(":")[0].lower()[:80],
            "referer": (request.headers.get("Referer") or "")[:500],
            "source": "internal",
            "source_host": "",
            "search_query": "",
            "ip": ip,
            "visitor": visitor,
            "session_new": 0,
            "ua": ua,
            "device": device,
            "os": os_name,
            "browser": browser,
            "is_bot": 1 if _BOT_RE.search(ua) else 0,
        })
    except Exception:
        pass
    return Response(status=204)


# ---------------------------------------------------------------- цифры для кабинета
def _int_arg(name, default, low, high):
    try:
        value = int(request.args.get(name, default))
    except (TypeError, ValueError):
        value = default
    return max(low, min(high, value))


def _day_list(days):
    today = datetime.now(_TZ).date()
    return [(today - timedelta(days=i)).strftime("%Y-%m-%d")
            for i in range(days - 1, -1, -1)]


def _row_view(row):
    """Строка базы в вид, удобный шаблону (время уже в нужном часовом поясе)."""
    return {
        "time": datetime.fromtimestamp(row["ts"], _TZ).strftime("%d.%m %H:%M"),
        "day": row["day"],
        "event": row["event"],
        "event_title": EVENT_TITLES.get(row["event"], row["event"]),
        "label": row["label"],
        "path": row["path"] + (("?" + row["query"]) if row["query"] else ""),
        "status": row["status"],
        "ip": row["ip"],
        "source": SOURCE_TITLES.get(row["source"], row["source"]),
        "source_host": row["source_host"],
        "search_query": row["search_query"],
        "referer": row["referer"],
        "device": row["device"],
        "os": row["os"],
        "browser": row["browser"],
        "is_bot": bool(row["is_bot"]),
        "session_new": bool(row["session_new"]),
        "visitor": (row["visitor"] or "")[:8],
    }


def _collect(days, include_bots):
    """Все цифры для страницы статистики за выбранный период."""
    bots_filter = "" if include_bots else " AND is_bot = 0"
    page = "kind = 'page'" + bots_filter
    event = "kind = 'event'" + bots_filter

    day_list = _day_list(days)
    start, end = day_list[0], day_list[-1]
    today, yesterday = day_list[-1], (day_list[-2] if days > 1 else None)

    def card(day):
        if not day:
            return {"views": 0, "visitors": 0, "visits": 0}
        return {
            "views": _scalar(f"SELECT COUNT(*) FROM hits WHERE {page} AND day = ?", (day,)),
            "visitors": _scalar(
                f"SELECT COUNT(DISTINCT visitor) FROM hits WHERE {page} AND day = ?", (day,)),
            "visits": _scalar(
                f"SELECT COALESCE(SUM(session_new), 0) FROM hits WHERE {page} AND day = ?", (day,)),
        }

    totals = {
        "views": _scalar(f"SELECT COUNT(*) FROM hits WHERE {page} AND day >= ? AND day <= ?",
                         (start, end)),
        "visitors": _scalar(
            f"SELECT COUNT(DISTINCT visitor) FROM hits WHERE {page} AND day >= ? AND day <= ?",
            (start, end)),
        "visits": _scalar(
            f"SELECT COALESCE(SUM(session_new), 0) FROM hits WHERE {page} AND day >= ? AND day <= ?",
            (start, end)),
        "bots": _scalar(
            "SELECT COUNT(*) FROM hits WHERE kind = 'page' AND is_bot = 1 AND day >= ? AND day <= ?",
            (start, end)),
        "events": _scalar(f"SELECT COUNT(*) FROM hits WHERE {event} AND day >= ? AND day <= ?",
                          (start, end)),
        "errors": _scalar(
            f"SELECT COUNT(*) FROM hits WHERE {page} AND status >= 400 AND day >= ? AND day <= ?",
            (start, end)),
    }
    totals["per_visit"] = round(totals["views"] / totals["visits"], 2) if totals["visits"] else 0
    totals["per_day"] = round(totals["views"] / days, 1) if days else 0

    views_by_day = {r["day"]: r for r in _q(
        f"SELECT day, COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors, "
        f"COALESCE(SUM(session_new), 0) AS visits FROM hits WHERE {page} "
        f"AND day >= ? AND day <= ? GROUP BY day", (start, end))}
    events_by_day = {r["day"]: r["c"] for r in _q(
        f"SELECT day, COUNT(*) AS c FROM hits WHERE {event} "
        f"AND day >= ? AND day <= ? GROUP BY day", (start, end))}

    daily = []
    for day in day_list:
        row = views_by_day.get(day)
        daily.append({
            "day": day,
            "label": datetime.strptime(day, "%Y-%m-%d").strftime("%d.%m"),
            "weekday": ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"][
                datetime.strptime(day, "%Y-%m-%d").weekday()],
            "views": row["views"] if row else 0,
            "visitors": row["visitors"] if row else 0,
            "visits": row["visits"] if row else 0,
            "events": events_by_day.get(day, 0),
        })
    max_views = max([d["views"] for d in daily] or [0]) or 1

    hourly_rows = {r["hour"]: r["c"] for r in _q(
        f"SELECT hour, COUNT(*) AS c FROM hits WHERE {page} "
        f"AND day >= ? AND day <= ? GROUP BY hour", (start, end))}
    hourly = [{"hour": h, "count": hourly_rows.get(h, 0)} for h in range(24)]
    max_hour = max([h["count"] for h in hourly] or [0]) or 1
    peak = max(hourly, key=lambda h: h["count"])

    def top(sql, args=(), limit=15):
        return _rows(sql + f" LIMIT {limit}", args)

    sources = [{"key": r["source"],
                "title": SOURCE_TITLES.get(r["source"], r["source"]),
                "count": r["c"]}
               for r in top(f"SELECT source, COUNT(*) AS c FROM hits WHERE {page} "
                            f"AND day >= ? AND day <= ? GROUP BY source ORDER BY c DESC",
                            (start, end), 8)]
    source_hosts = top(f"SELECT source_host, COUNT(*) AS c FROM hits WHERE {page} "
                       f"AND source_host <> '' AND day >= ? AND day <= ? "
                       f"GROUP BY source_host ORDER BY c DESC", (start, end), 15)
    search_queries = top(
        f"SELECT search_query, COUNT(*) AS c FROM hits WHERE {page} "
        f"AND search_query <> '' AND day >= ? AND day <= ? "
        f"GROUP BY LOWER(search_query) ORDER BY c DESC", (start, end), 20)
    paths = top(f"SELECT path, COUNT(*) AS c FROM hits WHERE {page} "
                f"AND day >= ? AND day <= ? GROUP BY path ORDER BY c DESC", (start, end), 15)
    devices = top(f"SELECT device, COUNT(*) AS c FROM hits WHERE {page} "
                  f"AND day >= ? AND day <= ? GROUP BY device ORDER BY c DESC", (start, end), 6)
    systems = top(f"SELECT os, COUNT(*) AS c FROM hits WHERE {page} "
                  f"AND day >= ? AND day <= ? GROUP BY os ORDER BY c DESC", (start, end), 8)
    browsers = top(f"SELECT browser, COUNT(*) AS c FROM hits WHERE {page} "
                   f"AND day >= ? AND day <= ? GROUP BY browser ORDER BY c DESC", (start, end), 8)
    missing = top(f"SELECT path, COUNT(*) AS c FROM hits WHERE {page} AND status = 404 "
                  f"AND day >= ? AND day <= ? GROUP BY path ORDER BY c DESC", (start, end), 10)
    events = [{"key": r["event"],
               "title": EVENT_TITLES.get(r["event"], r["event"]),
               "count": r["c"]}
              for r in top(f"SELECT event, COUNT(*) AS c FROM hits WHERE {event} "
                           f"AND day >= ? AND day <= ? GROUP BY event ORDER BY c DESC",
                           (start, end), 10)]

    recent = [_row_view(r) for r in _q(
        f"SELECT * FROM hits WHERE {page} ORDER BY id DESC LIMIT 80", ())]
    recent_events = [_row_view(r) for r in _q(
        f"SELECT * FROM hits WHERE {event} ORDER BY id DESC LIMIT 40", ())]

    size_mb = 0
    try:
        size_mb = round(os.path.getsize(_db_path(current_app)) / 1048576, 2)
    except OSError:
        size_mb = 0

    # ===== графики (SVG рисует сервер, см. stats_charts.py) =====
    source_colors = {
        "search": "#2f6fd0", "direct": "#22a06b", "social": "#8e5bd8",
        "external": "#d9822b", "internal": "#7b8798",
    }
    source_items = [{"title": s["title"], "count": s["count"],
                     "color": source_colors.get(s["key"])} for s in sources]
    device_items = [{"title": d["device"], "count": d["c"]} for d in devices]
    charts = {
        "daily": daily_chart(daily),
        "hourly": hour_chart(hourly),
        "sources": donut_chart(source_items, center_label="показов"),
        "devices": donut_chart(device_items, center_label="показов"),
        "spark": sparkline([d["views"] for d in daily]),
    }

    return {
        "days": days,
        "include_bots": include_bots,
        "range_start": start,
        "range_end": end,
        "today": card(today),
        "yesterday": card(yesterday),
        "totals": totals,
        "daily": daily,
        "max_views": max_views,
        "hourly": hourly,
        "max_hour": max_hour,
        "peak_hour": peak,
        "sources": sources,
        "source_hosts": source_hosts,
        "search_queries": search_queries,
        "paths": paths,
        "devices": devices,
        "systems": systems,
        "browsers": browsers,
        "missing": missing,
        "events": events,
        "recent": recent,
        "recent_events": recent_events,
        "self_excluded": request.cookies.get(OFF_COOKIE) == "1",
        "keep_days": _KEEP_DAYS,
        "db_size": size_mb,
        "charts": charts,
    }


def _dashboard():
    if not _logged_in():
        return redirect(url_for("stats_login"))
    days = _int_arg("days", 30, 1, 1825)
    include_bots = request.args.get("bots") == "1"
    data = _collect(days, include_bots)
    data["now"] = datetime.now(_TZ).strftime("%d.%m.%Y %H:%M")
    return _no_store(Response(render_template("stats/dashboard.html", **data)))


def _export():
    if not _logged_in():
        return redirect(url_for("stats_login"))
    days = _int_arg("days", 30, 1, 1825)
    include_bots = request.args.get("bots") == "1"
    bots_filter = "" if include_bots else " AND is_bot = 0"
    start = _day_list(days)[0]
    rows = _q(
        "SELECT * FROM hits WHERE day >= ?" + bots_filter + " ORDER BY id DESC", (start,))

    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=CSV_DELIMITER, lineterminator="\r\n")
    writer.writerow([
        "Дата и время", "Тип", "Событие", "Страница", "Код", "Посетитель",
        "Визит новый", "IP", "Источник", "Сайт-источник", "Поисковый запрос",
        "Устройство", "Система", "Браузер", "Робот", "Referer", "User-Agent",
    ])
    for row in rows:
        local = datetime.fromtimestamp(row["ts"], _TZ).strftime("%d.%m.%Y %H:%M:%S")
        writer.writerow([
            local,
            "показ" if row["kind"] == "page" else "событие",
            EVENT_TITLES.get(row["event"], row["event"]) + (
                f" ({row['label']})" if row["label"] else ""),
            row["path"],
            row["status"],
            row["visitor"][:8],
            "да" if row["session_new"] else "",
            row["ip"],
            SOURCE_TITLES.get(row["source"], row["source"]),
            row["source_host"],
            row["search_query"],
            row["device"],
            row["os"],
            row["browser"],
            "да" if row["is_bot"] else "",
            row["referer"],
            row["ua"],
        ])

    body = "\ufeff" + buffer.getvalue()  # BOM — чтобы Excel понял кодировку
    stamp = datetime.now(_TZ).strftime("%Y-%m-%d")
    response = Response(body, mimetype="text/csv; charset=utf-8")
    response.headers["Content-Disposition"] = (
        f'attachment; filename="visits-{stamp}-{days}d.csv"')
    return _no_store(response)


# ---------------------------------------------------------------- подключение
def init_stats(app):
    """Подключает статистику к приложению Flask."""
    global _conn, _TZ, _KEEP_DAYS, _visitor_salt

    try:
        _KEEP_DAYS = max(7, int(os.environ.get("STATS_KEEP_DAYS", "365")))
    except ValueError:
        _KEEP_DAYS = 365
    try:
        _TZ = timezone(timedelta(hours=float(os.environ.get("STATS_TZ_OFFSET", "7"))))
    except ValueError:
        _TZ = timezone(timedelta(hours=7))

    os.makedirs(os.path.join(app.root_path, "data"), exist_ok=True)
    _conn = _connect(_db_path(app))
    with _lock:
        _conn.executescript(_SCHEMA)
        _conn.commit()

    secret = _secret_store(app)
    _visitor_salt = secret["visitor_salt"]
    # ключ подписи куки входа: из окружения или из data/.stats_secret
    app.config["SECRET_KEY"] = (
        os.environ.get("STATS_SECRET") or app.config.get("SECRET_KEY") or secret["flask_secret"])
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
    app.config["SESSION_COOKIE_SECURE"] = bool(os.environ.get("SITE_HOSTS"))
    app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=30)

    prefix = "/" + admin_path()
    app.add_url_rule(prefix, "stats_dashboard", _dashboard)
    app.add_url_rule(prefix + "/", "stats_dashboard_slash", _dashboard)
    app.add_url_rule(prefix + "/login", "stats_login", _login, methods=["GET", "POST"])
    app.add_url_rule(prefix + "/logout", "stats_logout", _logout)
    app.add_url_rule(prefix + "/export.csv", "stats_export", _export)
    app.add_url_rule(prefix + "/self", "stats_self", _toggle_self)
    app.add_url_rule("/api/event", "stats_event", _event, methods=["POST"])

    app.after_request(_record)

    # Откуда сервер берёт пароль — печатаем всегда: это первое, что нужно
    # проверить, если вход не проходит (особенно на хостинге).
    if _password_source() == "env":
        print("[статистика] пароль кабинета взят из переменной окружения STATS_PASSWORD")
    elif os.environ.get("WERKZEUG_RUN_MAIN") == "true" or not app.debug:
        # при --debug Flask поднимает два процесса (родительский и рабочий).
        # Печатает только рабочий: иначе в консоли два разных пароля и непонятно,
        # какой вводить. Пароль при этом один и тот же — он лежит в файле.
        print("=" * 68)
        print("  Статистика посещений: переменная STATS_PASSWORD не задана.")
        print("  Пароль для входа:", _password())
        print("  Он сохранён в data/.stats_secret и не меняется при перезапуске.")
        print("  Свой пароль: задайте STATS_PASSWORD в переменных окружения.")
        print("  Страница статистики:", prefix + "/")
        print("=" * 68)

    if _password_looks_like_note():
        print("[статистика] ВНИМАНИЕ: в data/.stats_secret у пароля есть пробелы — "
              "похоже, рядом с паролем дописана заметка. Пароль сравнивается целиком, "
              "вместе с заметкой: в поле входа нужно вводить всю строку.")

    return app
