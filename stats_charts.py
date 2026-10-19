# -*- coding: utf-8 -*-
"""Графики для страницы статистики: SVG рисуется на сервере.

Так страница не тянет сторонние библиотеки и не зависит от JavaScript:
браузер получает готовую картинку, она работает при строгой
Content-Security-Policy, печатается и открывается на любом телефоне.
Наведение мыши подсказывает точные цифры — через <title> внутри SVG.
"""

import math

from markupsafe import escape

VIEWS_COLOR = "#1E5EFF"      # открытия страницы
VISITORS_COLOR = "#22C58B"   # люди
CLICKS_COLOR = "#FF9F43"     # звонки и сообщения
PEAK_COLOR = "#FF5C6C"       # самый активный час
GRID_COLOR = "#E4ECF8"
TEXT_COLOR = "#7B8798"
PALETTE = ["#1E5EFF", "#22C58B", "#7B61FF", "#FF9F43", "#0FB5C8",
           "#FF5C6C", "#5B93FF", "#4A586C"]


def _group(text):
    """12345 -> «12 345»."""
    out = []
    for i, ch in enumerate(reversed(text)):
        if i and i % 3 == 0:
            out.append(" ")
        out.append(ch)
    return "".join(reversed(out))


def _fmt(value):
    if isinstance(value, float):
        text = ("%.1f" % value).rstrip("0").rstrip(".")
    else:
        text = str(int(value))
    if "." in text:
        head, _, tail = text.partition(".")
        return _group(head) + "," + tail
    return _group(text)


def _nice_max(value):
    """Верхняя граница оси: круглое число чуть больше максимума."""
    value = max(1, int(math.ceil(value or 0)))
    if value <= 6:
        return value
    if value <= 10:
        return 10
    base = 10 ** int(math.log10(value))
    for k in (1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10):
        if value <= base * k:
            return int(round(base * k))
    return int(base * 10)


def _ticks(maxv):
    if maxv <= 6:
        return list(range(maxv + 1))
    step = maxv / 4
    values = [int(round(step * i)) for i in range(5)]
    values[-1] = maxv
    return sorted(set(values))


def _grid(parts, left, top, plot_w, plot_h, maxv, unit=""):
    """Горизонтальные линии с подписями по оси значений."""
    for value in _ticks(maxv):
        yy = top + plot_h * (1 - value / maxv)
        parts.append(
            f'<line x1="{left:.1f}" y1="{yy:.1f}" x2="{left + plot_w:.1f}" y2="{yy:.1f}" '
            f'stroke="{GRID_COLOR}" stroke-width="1" stroke-dasharray="3 7"/>'
        )
        parts.append(
            f'<text x="{left - 10:.1f}" y="{yy + 4:.1f}" text-anchor="end" '
            f'fill="{TEXT_COLOR}" font-size="11" font-family="Segoe UI, sans-serif">'
            f'{_fmt(value)}{unit}</text>'
        )
    base = top + plot_h
    parts.append(
        f'<line x1="{left:.1f}" y1="{base:.1f}" x2="{left + plot_w:.1f}" y2="{base:.1f}" '
        f'stroke="#D5DEEE" stroke-width="1.5"/>'
    )


def _smooth(points):
    """Монотонная кривая через точки: не уходит ниже нуля и не рвётся на пиках."""
    n = len(points)
    if n < 2:
        return ""
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    if n == 2:
        return f"M {xs[0]:.1f},{ys[0]:.1f} L {xs[1]:.1f},{ys[1]:.1f}"
    dx = [xs[i + 1] - xs[i] for i in range(n - 1)]
    dy = [ys[i + 1] - ys[i] for i in range(n - 1)]
    slope = [(dy[i] / dx[i] if dx[i] else 0.0) for i in range(n - 1)]
    tang = [0.0] * n
    tang[0] = slope[0]
    tang[-1] = slope[-1]
    for i in range(1, n - 1):
        if slope[i - 1] * slope[i] <= 0:
            tang[i] = 0.0
        else:
            tang[i] = (slope[i - 1] + slope[i]) / 2
    for i in range(n - 1):
        if slope[i] == 0:
            tang[i] = tang[i + 1] = 0.0
            continue
        a = tang[i] / slope[i]
        b = tang[i + 1] / slope[i]
        s = a * a + b * b
        if s > 9:
            tau = 3 / math.sqrt(s)
            tang[i] = tau * a * slope[i]
            tang[i + 1] = tau * b * slope[i]
    chunks = [f"M {xs[0]:.1f},{ys[0]:.1f}"]
    for i in range(n - 1):
        c1x = xs[i] + dx[i] / 3
        c1y = ys[i] + tang[i] * dx[i] / 3
        c2x = xs[i + 1] - dx[i] / 3
        c2y = ys[i + 1] - tang[i + 1] * dx[i] / 3
        chunks.append(
            f"C {c1x:.1f},{c1y:.1f} {c2x:.1f},{c2y:.1f} {xs[i + 1]:.1f},{ys[i + 1]:.1f}")
    return " ".join(chunks)


def daily_chart(daily, width=1040, height=340):
    """Открытия страницы (заливка) и люди (линия) по дням, звонки — точки."""
    n = len(daily)
    if not n:
        return ""
    left, right, top, bottom = 48, 18, 18, 36
    plot_w = width - left - right
    plot_h = height - top - bottom
    floor = top + plot_h

    axis_max = _nice_max(max(
        max((d["views"] for d in daily), default=0),
        max((d["visitors"] for d in daily), default=0),
    ))

    step = plot_w / max(1, n - 1) if n > 1 else 0

    def x(i):
        return left + plot_w / 2 if n == 1 else left + step * i

    def y(value):
        return top + plot_h * (1 - value / axis_max)

    views = [(x(i), y(d["views"])) for i, d in enumerate(daily)]
    visitors = [(x(i), y(d["visitors"])) for i, d in enumerate(daily)]

    parts = [
        f'<svg viewBox="0 0 {width} {height}" class="chart" role="img" '
        f'aria-label="Открытия страницы и люди по дням">',
        '<defs>',
        '<linearGradient id="viewsArea" x1="0" y1="0" x2="0" y2="1">',
        f'<stop offset="0%" stop-color="{VIEWS_COLOR}" stop-opacity="0.32"/>',
        f'<stop offset="100%" stop-color="{VIEWS_COLOR}" stop-opacity="0.02"/>',
        "</linearGradient>",
        f'<clipPath id="dailyClip"><rect x="{left:.1f}" y="{top:.1f}" '
        f'width="{plot_w:.1f}" height="{plot_h:.1f}"/></clipPath>',
        "</defs>",
    ]
    _grid(parts, left, top, plot_w, plot_h, axis_max)

    events_max = max((d.get("events", 0) for d in daily), default=0)
    if events_max:
        bar_w = max(4.0, min(9.0, (step or plot_w) * 0.28))
        bar_top = plot_h * 0.28
        for i, day in enumerate(daily):
            events = day.get("events", 0)
            if not events:
                continue
            h = max(10.0, bar_top * events / events_max)
            cx = x(i)
            parts.append(
                f'<rect x="{cx - bar_w / 2:.1f}" y="{floor - h:.1f}" width="{bar_w:.1f}" '
                f'height="{h:.1f}" rx="{bar_w / 2:.1f}" fill="{CLICKS_COLOR}" opacity="0.85">'
                f'<title>{escape(day["label"])}: {events} звонков и сообщений</title></rect>'
            )

    if n > 1:
        views_path = _smooth(views)
        visitors_path = _smooth(visitors)
        parts.append(
            f'<path d="{views_path} L {views[-1][0]:.1f},{floor:.1f} L {views[0][0]:.1f},{floor:.1f} Z" '
            f'fill="url(#viewsArea)" clip-path="url(#dailyClip)"/>'
            f'<path d="{views_path}" fill="none" stroke="{VIEWS_COLOR}" stroke-width="2.6" '
            f'stroke-linecap="round" stroke-linejoin="round"/>'
            f'<path d="{visitors_path}" fill="none" stroke="{VISITORS_COLOR}" stroke-width="2.6" '
            f'stroke-linecap="round" stroke-linejoin="round"/>'
        )
    else:
        parts.append(
            f'<circle cx="{views[0][0]:.1f}" cy="{views[0][1]:.1f}" r="5" fill="{VIEWS_COLOR}"/>'
            f'<circle cx="{visitors[0][0]:.1f}" cy="{visitors[0][1]:.1f}" r="4" fill="{VISITORS_COLOR}"/>'
        )

    show_dots = n <= 90
    for i, day in enumerate(daily):
        cx, cy = visitors[i]
        if show_dots and day["visitors"]:
            parts.append(
                f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="3" fill="{VISITORS_COLOR}"/>'
            )

    every = max(1, math.ceil(n / 10))
    for i, day in enumerate(daily):
        if i % every and i != n - 1:
            continue
        parts.append(
            f'<text x="{x(i):.1f}" y="{floor + 22:.1f}" text-anchor="middle" '
            f'fill="{TEXT_COLOR}" font-size="11" font-family="Segoe UI, sans-serif">'
            f'{escape(day["label"])}</text>'
        )

    raw_w = min(plot_w, max(2.0, plot_w / n))
    for i, day in enumerate(daily):
        cx = x(i)
        hover_x = min(max(cx - raw_w / 2, left), left + plot_w - raw_w)
        tip = (f'{day["label"]} ({day["weekday"]}): страницу открыли {day["views"]} раз, '
               f'{day["visitors"]} человек, {day["visits"]} заходов, '
               f'{day.get("events", 0)} звонков и сообщений')
        parts.append(
            f'<rect x="{hover_x:.1f}" y="{top}" width="{raw_w:.1f}" '
            f'height="{plot_h:.1f}" fill="transparent" class="chart-hit">'
            f'<title>{escape(tip)}</title></rect>'
        )

    parts.append("</svg>")
    return "".join(parts)


def hour_chart(hourly, width=1040, height=220):
    """Сколько раз страницу открывали в каждый час суток."""
    if not hourly:
        return ""
    left, right, top, bottom = 54, 16, 16, 34
    plot_w = width - left - right
    plot_h = height - top - bottom
    axis_max = _nice_max(max((h["count"] for h in hourly), default=0))
    peak = max(hourly, key=lambda h: h["count"])["hour"] if any(h["count"] for h in hourly) else -1

    slot = plot_w / 24
    bar_w = slot * 0.42

    def x(hour):
        return left + slot * (hour + 0.5)

    def y(value):
        return top + plot_h * (1 - value / axis_max)

    parts = [
        f'<svg viewBox="0 0 {width} {height}" class="chart" role="img" '
        f'aria-label="Открытия страницы по часам суток">',
        '<defs>',
        '<linearGradient id="hourBar" x1="0" y1="0" x2="0" y2="1">',
        '<stop offset="0%" stop-color="#5B93FF"/>',
        f'<stop offset="100%" stop-color="{VIEWS_COLOR}"/>',
        "</linearGradient>",
        '<linearGradient id="hourPeak" x1="0" y1="0" x2="0" y2="1">',
        '<stop offset="0%" stop-color="#FF8A96"/>',
        f'<stop offset="100%" stop-color="{PEAK_COLOR}"/>',
        "</linearGradient>",
        "</defs>",
    ]
    _grid(parts, left, top, plot_w, plot_h, axis_max)

    for hour in hourly:
        top_y = y(hour["count"])
        fill = "url(#hourPeak)" if (hour["hour"] == peak and hour["count"]) else "url(#hourBar)"
        height_px = max(1.0, top + plot_h - top_y) if hour["count"] else 0
        if height_px:
            radius = min(6.0, bar_w / 2, height_px / 2)
            parts.append(
                f'<rect x="{x(hour["hour"]) - bar_w / 2:.1f}" y="{top_y:.1f}" '
                f'width="{bar_w:.1f}" height="{height_px:.1f}" rx="{radius:.1f}" '
                f'fill="{fill}"/>'
            )
        if hour["hour"] % 3 == 0:
            parts.append(
                f'<text x="{x(hour["hour"]):.1f}" y="{top + plot_h + 22:.1f}" '
                f'text-anchor="middle" fill="{TEXT_COLOR}" font-size="11" '
                f'font-family="Segoe UI, sans-serif">{hour["hour"]}</text>'
            )
        parts.append(
            f'<rect x="{x(hour["hour"]) - slot / 2:.1f}" y="{top}" width="{slot:.1f}" '
            f'height="{plot_h:.1f}" fill="transparent" class="chart-hit">'
            f'<title>{hour["hour"]:02d}:00 — страницу открыли {hour["count"]} раз</title></rect>'
        )

    parts.append("</svg>")
    return "".join(parts)


def donut_chart(items, size=196, thickness=26, center_value="", center_label=""):
    """Круговой график долей: источники переходов, устройства."""
    total = sum(max(0, int(item["count"])) for item in items)
    prepared = []
    for index, item in enumerate(items):
        prepared.append({
            "title": item["title"],
            "count": int(item["count"]),
            "color": item.get("color") or PALETTE[index % len(PALETTE)],
            "percent": (item["count"] / total * 100) if total else 0,
        })

    radius = (size - thickness) / 2
    center = size / 2
    circle_len = 2 * math.pi * radius
    parts = [f'<svg viewBox="0 0 {size} {size}" class="chart chart-donut" role="img" '
             f'aria-label="Доли по источникам">',
             f'<circle cx="{center}" cy="{center}" r="{radius:.1f}" fill="none" '
             f'stroke="{GRID_COLOR}" stroke-width="{thickness}"/>']

    offset = 0.0
    for item in prepared:
        share = item["percent"] / 100
        if share <= 0:
            continue
        if share >= 0.999:
            parts.append(
                f'<circle cx="{center}" cy="{center}" r="{radius:.1f}" fill="none" '
                f'stroke="{item["color"]}" stroke-width="{thickness}"/>'
            )
            continue
        length = circle_len * share
        parts.append(
            f'<circle cx="{center}" cy="{center}" r="{radius:.1f}" fill="none" '
            f'stroke="{item["color"]}" stroke-width="{thickness}" '
            f'stroke-dasharray="{length:.2f} {circle_len - length:.2f}" '
            f'stroke-dashoffset="{-offset:.2f}" transform="rotate(-90 {center} {center})">'
            f'<title>{escape(item["title"])}: {_fmt(item["count"])} '
            f'({_fmt(round(item["percent"], 1))}%)</title></circle>'
        )
        offset += length

    if total:
        parts.append(
            f'<text x="{center}" y="{center + 2}" text-anchor="middle" fill="#0C1E3C" '
            f'font-size="26" font-weight="700">{_fmt(total)}</text>'
        )
        if center_label:
            parts.append(
                f'<text x="{center}" y="{center + 22}" text-anchor="middle" '
                f'fill="{TEXT_COLOR}" font-size="12">{escape(center_label)}</text>'
            )
    else:
        parts.append(
            f'<text x="{center}" y="{center + 5}" text-anchor="middle" fill="{TEXT_COLOR}" '
            f'font-size="13">нет данных</text>'
        )
    parts.append("</svg>")
    return {"svg": "".join(parts), "items": prepared, "total": total,
            "center_value": center_value}


def sparkline(values, width=260, height=56, color=VIEWS_COLOR):
    """Крошечный график для карточки с цифрой."""
    if not values:
        return ""
    top, bottom = 6, 6
    plot_h = height - top - bottom
    axis_max = _nice_max(max(values))
    step = width / max(1, len(values) - 1) if len(values) > 1 else 0

    def x(i):
        return width / 2 if len(values) == 1 else step * i

    def y(value):
        return top + plot_h * (1 - value / axis_max)

    pts = [(x(i), y(v)) for i, v in enumerate(values)]
    parts = [
        f'<svg viewBox="0 0 {width} {height}" class="chart chart-spark" role="img" '
        f'aria-label="Как менялось число открытий страницы">',
        '<defs><linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">',
        f'<stop offset="0%" stop-color="{color}" stop-opacity="0.28"/>',
        f'<stop offset="100%" stop-color="{color}" stop-opacity="0"/>',
        "</linearGradient></defs>",
    ]
    if len(pts) > 1:
        line = _smooth(pts)
        parts.append(
            f'<path d="{line} L {width:.1f},{height:.1f} L 0,{height:.1f} Z" fill="url(#sparkFill)"/>'
            f'<path d="{line}" fill="none" stroke="{color}" stroke-width="2" '
            f'stroke-linecap="round" stroke-linejoin="round"/>'
        )
    parts.append("</svg>")
    return "".join(parts)
