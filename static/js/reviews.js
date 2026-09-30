// Отзывы: раскладка по колонкам и кнопка «Показать ещё».
// Колонки заполняем сами, а не через CSS columns: браузер при добавлении карточек
// переразбрасывал уже показанные, и они прыгали по сетке.
// Порядок карточек считаем заранее (по их высотам), поэтому раскрытая сетка
// заканчивается ровной линией, а при нажатии «Показать ещё» ничего не двигается.
(function () {
    var box = document.getElementById('reviewsBox');
    var grid = document.getElementById('reviewsGrid');
    var more = document.getElementById('reviewsMore');
    var section = document.getElementById('reviews');
    if (!box || !grid) return;

    var GAP = 14;           // тот же отступ между карточками, что в .reviews-col
    var MIDDLE_FIRST = 40;  // при прочих равных самой длинной делаем среднюю колонку
    var PEEK = 62;          // на столько следующие карточки выглядывают из-под затемнения

    var cards = Array.prototype.slice.call(grid.querySelectorAll('.review-card'));
    var shownByDefault = cards.filter(function (c) {
        return !c.classList.contains('review-card--hidden');
    }).length || cards.length;
    // на телефоне (одна колонка) свёрнутый блок был бы слишком длинным — показываем меньше
    function visibleCount() {
        return columnCount() === 1 ? Math.min(3, cards.length) : shownByDefault;
    }
    var visible = shownByDefault;
    var expanded = visible >= cards.length;
    var columns = [];

    function columnCount() {
        if (window.matchMedia('(max-width: 700px)').matches) return 1;
        if (window.matchMedia('(max-width: 1100px)').matches) return 2;
        return 3;
    }

    function makeColumns(n) {
        grid.innerHTML = '';
        columns = [];
        for (var i = 0; i < n; i++) {
            var col = document.createElement('div');
            col.className = 'reviews-col';
            grid.appendChild(col);
            columns.push(col);
        }
    }

    // высота каждой карточки: раскладываем их по колонкам нужной ширины и замеряем
    function measure(n) {
        makeColumns(n);
        cards.forEach(function (card, i) {
            card.classList.remove('review-card--hidden');
            columns[i % n].appendChild(card);
        });
        return cards.map(function (card) { return card.offsetHeight; });
    }

    function heights(where, hs, n) {
        var h = [], count = [];
        for (var i = 0; i < n; i++) { h.push(0); count.push(0); }
        for (var j = 0; j < where.length; j++) {
            h[where[j]] += hs[j] + (count[where[j]] ? GAP : 0);
            count[where[j]]++;
        }
        return h;
    }

    // чем ровнее низ колонок, тем лучше; средней колонке позволяем быть самой длинной
    function score(where, hs, n) {
        var h = heights(where, hs, n);
        var max = Math.max.apply(null, h);
        var spread = max - Math.min.apply(null, h);
        if (n === 3 && h.indexOf(max) !== 1) spread += MIDDLE_FIRST;
        return spread;
    }

    // раскладка: первые карточки — по очереди в самую короткую колонку (так свёрнутый
    // блок выглядит ровно), остальные подбираем так, чтобы низ сетки получился ровным
    function planColumns(hs, n) {
        var where = [];
        var i, c;
        for (i = 0; i < cards.length; i++) {
            var h = heights(where, hs, n);
            var best = 0;
            for (c = 1; c < n; c++) if (h[c] < h[best]) best = c;
            where.push(best);
        }
        var current = score(where, hs, n);
        var moved = true, guard = 0;
        while (moved && guard++ < 60) {
            moved = false;
            for (i = visible; i < cards.length; i++) {
                var from = where[i];
                for (c = 0; c < n; c++) {
                    if (c === from) continue;
                    where[i] = c;
                    var next = score(where, hs, n);
                    if (next < current) { current = next; from = c; moved = true; }
                    where[i] = from;
                }
            }
        }
        return where;
    }

    // свёрнутый блок подрезаем по первым карточкам плюс «хвостик» следующих,
    // чтобы было видно: отзывов больше
    function crop() {
        if (expanded) { box.style.maxHeight = ''; return; }
        var top = grid.getBoundingClientRect().top;
        var edge = 0;
        for (var i = 0; i < visible; i++) {
            edge = Math.max(edge, cards[i].getBoundingClientRect().bottom - top);
        }
        box.style.maxHeight = Math.round(edge + PEEK) + 'px';
    }

    function build() {
        var n = columnCount();
        visible = visibleCount();
        var hs = measure(n);
        var where = planColumns(hs, n);
        makeColumns(n);
        cards.forEach(function (card, i) {
            card.classList.remove('review-card--hidden');
            columns[where[i]].appendChild(card);
        });
        crop();
    }

    build();
    // шрифты грузятся отдельно: когда они применились, высоты меняются — пересчитываем
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () { build(); });
    }

    if (more) {
        more.addEventListener('click', function () {
            expanded = !expanded;
            box.classList.toggle('reviews-box--collapsed', !expanded);
            more.classList.toggle('reviews-more--expanded', expanded);
            more.textContent = expanded ? 'Скрыть отзывы' : 'Показать ещё';
            more.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            crop();
            // если свернули, уехав далеко вниз, — возвращаем блок в поле зрения
            if (!expanded) {
                var top = section ? section.getBoundingClientRect().top : 0;
                if (top < 0) window.scrollBy({ top: top - 20, behavior: 'smooth' });
            }
        });
    }

    // при смене ширины экрана колонок может стать больше или меньше — пересобираем
    var timer;
    var last = columnCount();
    window.addEventListener('resize', function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
            if (columnCount() === last) return;
            last = columnCount();
            build();
        }, 200);
    });
})();
