# -*- coding: utf-8 -*-
"""Графики для страницы статистики: SVG рисуется на сервере.

Так страница не тянет сторонние библиотеки и не зависит от JavaScript:
браузер получает готовую картинку, она работает при строгой
Content-Security-Policy, печатается и открывается на любом телефоне.
Наведение мыши подсказывает точные цифры — через <title> внутри SVG.
"""

import math

from markupsafe import escape

VIEWS_COLOR = "#2f6fd0"      # показы
VISITORS_COLOR = "#22a06b"   # посетители
CLICKS_COLOR = "#d9822b"     # нажатия «Позвонить»
PEAK_COLOR = "#c0392b"       # самый активный час
GRID_COLOR = "#e4eaf2"
TEXT_COLOR = "#7b8798"
PALETTE = ["#2f6fd0", "#22a06b", "#8e5bd8", "#d9822b", "#0f9bb5",
           "#c0392b", "#7b8798", "#5b6a7f"]


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
            f'stroke="{GRID_COLOR}" stroke-width="1"/>'
        )
        parts.append(
            f'<text x="{left - 8:.1f}" y="{yy + 4:.1f}" text-anchor="end" '
            f'fill="{TEXT_COLOR}" font-size="12">{_fmt(value)}{unit}</text>'
        )


def daily_chart(daily, width=1040, height=330):
    """Показы (площадь) и посетители (линия) по дням, внизу — нажатия «Позвонить»."""
    n = len(daily)
    if not n:
        return ""
    left, right, top, bottom = 54, 16, 16, 34
    plot_w = width - left - right
    plot_h = height - top - bottom

    axis_max = _nice_max(max(
        max((d["views"] for d in daily), default=0),
        max((d["visitors"] for d in daily), default=0),
    ))
    clicks_max = _nice_max(max((d.get("events", 0) for d in daily), default=0))
    clicks_h = plot_h * 0.22  # полоса под столбики кликов

    step = plot_w / max(1, n - 1) if n > 1 else 0

    def x(i):
        return left + plot_w / 2 if n == 1 else left + step * i

    def y(value):
        return top + plot_h * (1 - value / axis_max)

    def y_clicks(value):
        return top + plot_h - clicks_h * (value / clicks_max if clicks_max else 0)

    parts = [f'<svg viewBox="0 0 {width} {height}" class="chart" role="img" '
             f'aria-label="Показы и посетители по дням">']
    _grid(parts, left, top, plot_w, plot_h, axis_max)

    bar_w = max(1.5, min(12.0, plot_w / n * 0.5))

    # столбики нажатий «Позвонить» — под линиями, чтобы не закрывать их
    for i, day in enumerate(daily):
        value = day.get("events", 0)
        if value:
            top_y = y_clicks(value)
            parts.append(
                f'<rect x="{x(i) - bar_w / 2:.1f}" y="{top_y:.1f}" width="{bar_w:.1f}" '
                f'height="{top + plot_h - top_y:.1f}" rx="{min(3, bar_w / 2):.1f}" '
                f'fill="{CLICKS_COLOR}" opacity="0.55"/>'
            )

    # площадь показов
    if n > 1:
        area = " ".join(f"{x(i):.1f},{y(d['views']):.1f}" for i, d in enumerate(daily))
        parts.append(
            f'<polygon points="{left:.1f},{top + plot_h:.1f} {area} '
            f'{left + plot_w:.1f},{top + plot_h:.1f}" fill="{VIEWS_COLOR}" opacity="0.15"/>'
        )
        parts.append(
            f'<polyline points="{area}" fill="none" stroke="{VIEWS_COLOR}" '
            f'stroke-width="2.4" stroke-linejoin="round"/>'
        )
    else:
        parts.append(f'<circle cx="{x(0):.1f}" cy="{y(daily[0]["views"]):.1f}" r="4" '
                     f'fill="{VIEWS_COLOR}"/>')

    # линия посетителей
    if n > 1:
        line = " ".join(f"{x(i):.1f},{y(d['visitors']):.1f}" for i, d in enumerate(daily))
        parts.append(
            f'<polyline points="{line}" fill="none" stroke="{VISITORS_COLOR}" '
            f'stroke-width="2" stroke-dasharray="0" stroke-linejoin="round"/>'
        )
    else:
        parts.append(f'<circle cx="{x(0):.1f}" cy="{y(daily[0]["visitors"]):.1f}" r="3.5" '
                     f'fill="{VISITORS_COLOR}"/>')

    # подписи дат: не больше десяти, чтобы не сливались
    every = max(1, math.ceil(n / 10))
    for i, day in enumerate(daily):
        if i % every and i != n - 1:
            continue
        parts.append(
            f'<text x="{x(i):.1f}" y="{top + plot_h + 22:.1f}" text-anchor="middle" '
            f'fill="{TEXT_COLOR}" font-size="12">{escape(day["label"])}</text>'
        )

    # невидимые полосы для подсказок при наведении: держим их внутри области
    raw_w = min(plot_w, max(2.0, plot_w / n))
    for i, day in enumerate(daily):
        cx = x(i) if n == 1 else left + step * i
        hover_x = min(max(cx - raw_w / 2, left), left + plot_w - raw_w)
        tip = (f'{day["label"]} ({day["weekday"]}): {day["views"]} показов, '
               f'{day["visitors"]} посетителей, {day["visits"]} визитов, '
               f'{day.get("events", 0)} нажатий')
        parts.append(
            f'<rect x="{hover_x:.1f}" y="{top}" width="{raw_w:.1f}" '
            f'height="{plot_h:.1f}" fill="transparent" class="chart-hit">'
            f'<title>{escape(tip)}</title></rect>'
        )

    # клики видны по наведению, поэтому о них напоминаем подписью справа
    if clicks_max:
        parts.append(
            f'<text x="{left + plot_w:.1f}" y="{top + 10:.1f}" text-anchor="end" '
            f'fill="{CLICKS_COLOR}" font-size="12">столбики — нажатия «Позвонить» '
            f'(максимум {_fmt(clicks_max)})</text>'
        )

    parts.append("</svg>")
    return "".join(parts)


def hour_chart(hourly, width=1040, height=220):
    """Сколько показов приходится на каждый час суток."""
    if not hourly:
        return ""
    left, right, top, bottom = 54, 16, 16, 34
    plot_w = width - left - right
    plot_h = height - top - bottom
    axis_max = _nice_max(max((h["count"] for h in hourly), default=0))
    peak = max(hourly, key=lambda h: h["count"])["hour"] if any(h["count"] for h in hourly) else -1

    slot = plot_w / 24
    bar_w = slot * 0.62

    def x(hour):
        return left + slot * (hour + 0.5)

    def y(value):
        return top + plot_h * (1 - value / axis_max)

    parts = [f'<svg viewBox="0 0 {width} {height}" class="chart" role="img" '
             f'aria-label="Показы по часам суток">']
    _grid(parts, left, top, plot_w, plot_h, axis_max)

    for hour in hourly:
        top_y = y(hour["count"])
        color = PEAK_COLOR if (hour["hour"] == peak and hour["count"]) else VIEWS_COLOR
        height_px = max(1.0, top + plot_h - top_y) if hour["count"] else 0
        if height_px:
            parts.append(
                f'<rect x="{x(hour["hour"]) - bar_w / 2:.1f}" y="{top_y:.1f}" '
                f'width="{bar_w:.1f}" height="{height_px:.1f}" rx="4" fill="{color}"/>'
            )
        if hour["hour"] % 3 == 0:
            parts.append(
                f'<text x="{x(hour["hour"]):.1f}" y="{top + plot_h + 22:.1f}" '
                f'text-anchor="middle" fill="{TEXT_COLOR}" font-size="12">{hour["hour"]}</text>'
            )
        parts.append(
            f'<rect x="{x(hour["hour"]) - slot / 2:.1f}" y="{top}" width="{slot:.1f}" '
            f'height="{plot_h:.1f}" fill="transparent" class="chart-hit">'
            f'<title>{hour["hour"]:02d}:00 — {hour["count"]} показов</title></rect>'
        )

    parts.append(
        f'<text x="{left + plot_w:.1f}" y="{top + 10:.1f}" text-anchor="end" '
        f'fill="{TEXT_COLOR}" font-size="12">часы суток, время новосибирское</text>'
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
            f'<text x="{center}" y="{center + 2}" text-anchor="middle" fill="#16233a" '
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

    points = " ".join(f"{x(i):.1f},{y(v):.1f}" for i, v in enumerate(values))
    parts = [f'<svg viewBox="0 0 {width} {height}" class="chart chart-spark" role="img" '
             f'aria-label="Динамика показов">']
    if len(values) > 1:
        parts.append(
            f'<polygon points="{points} {width:.1f},{height:.1f} 0,{height:.1f}" '
            f'fill="{color}" opacity="0.14"/>'
            f'<polyline points="{points}" fill="none" stroke="{color}" stroke-width="2"/>'
        )
    parts.append("</svg>")
    return "".join(parts)
