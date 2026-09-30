// Бегущие строки марок: едут сами, но их можно потянуть мышью или пальцем.
// Пока скрипта нет, ленты двигает CSS-анимация; здесь мы её выключаем и ведём
// смещение сами — иначе перетягивание и автоход дёргали бы ленту друг у друга.
(function () {
    var ticker = document.querySelector('.brands-ticker');
    if (!ticker) return;

    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    var rows = Array.prototype.slice.call(ticker.querySelectorAll('.brands-row'));
    if (!rows.length) return;

    ticker.classList.add('brands-ticker--js');

    var lanes = rows.map(function (row, i) {
        var track = row.querySelector('.brands-track');
        return {
            row: row,
            track: track,
            half: track.scrollWidth / 2,   // список продублирован: половина — один круг
            offset: 0,
            speed: i % 2 ? -34 : 34,       // пикселей в секунду, соседние ленты навстречу
            push: 0,                       // остаточная скорость после броска мышью
            drag: null
        };
    });

    // по нажатию на марку открываем окно с частыми поломками —
    // такое же, как окно с номером телефона
    var modal = document.getElementById('brandModal');
    var modalName = document.getElementById('brandModalName');
    var modalText = document.getElementById('brandModalText');

    function show(chip) {
        if (!modal) return;
        modalName.textContent = chip.getAttribute('data-brand');
        modalText.innerHTML = chip.getAttribute('data-text');
        modal.classList.add('show');
    }

    var hover = false;
    ticker.addEventListener('mouseenter', function () { hover = true; });
    ticker.addEventListener('mouseleave', function () { hover = false; });

    function draw(lane) {
        var half = lane.half || 1;
        lane.offset = ((lane.offset % half) + half) % half;
        lane.track.style.transform = 'translate3d(' + (-lane.offset) + 'px, 0, 0)';
    }

    var last = 0;
    function frame(now) {
        var dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
        last = now;
        for (var i = 0; i < lanes.length; i++) {
            var lane = lanes[i];
            if (!lane.drag) {
                if (Math.abs(lane.push) > 1) {
                    lane.offset += lane.push * dt;
                    lane.push *= Math.pow(0.002, dt);   // бросок плавно затухает
                } else {
                    lane.push = 0;
                    if (!hover && !reduce.matches) lane.offset += lane.speed * dt;
                }
            }
            draw(lane);
        }
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    lanes.forEach(function (lane) {
        lane.row.addEventListener('pointerdown', function (e) {
            if (e.button) return;
            lane.row.setPointerCapture(e.pointerId);
            lane.row.classList.add('is-dragging');
            lane.push = 0;
            lane.drag = { x: e.clientX, t: e.timeStamp, vx: 0, from: e.clientX };
        });
        lane.row.addEventListener('pointermove', function (e) {
            if (!lane.drag) return;
            var dx = e.clientX - lane.drag.x;
            var dt = e.timeStamp - lane.drag.t;
            lane.offset -= dx;
            // скорость последнего движения — её и продолжим после отпускания
            if (dt > 0) lane.drag.vx = -dx / dt * 1000;
            lane.drag.x = e.clientX;
            lane.drag.t = e.timeStamp;
            draw(lane);
        });
        function end(e) {
            if (!lane.drag) return;
            var v = lane.drag.vx;
            // если ленту тянули, клик по плашке не засчитываем
            lane.dragged = e && Math.abs(e.clientX - lane.drag.from) > 5;
            lane.drag = null;
            lane.row.classList.remove('is-dragging');
            lane.push = Math.max(-2500, Math.min(2500, v));
        }
        lane.row.addEventListener('pointerup', end);
        lane.row.addEventListener('pointercancel', end);
        lane.row.addEventListener('dragstart', function (e) { e.preventDefault(); });
        lane.row.addEventListener('click', function (e) {
            if (lane.dragged) return;
            // при перетягивании ленты мы захватываем указатель, и клик приходит
            // не на плашку, а на саму ленту — тогда ищем плашку по координатам
            var chip = e.target.closest ? e.target.closest('.brand-logo') : null;
            if (!chip && (e.clientX || e.clientY)) {
                var el = document.elementFromPoint(e.clientX, e.clientY);
                chip = el && el.closest ? el.closest('.brand-logo') : null;
            }
            if (chip) show(chip);
        });
    });

    // ширина плашек зависит от экрана — после изменения пересчитываем круг
    var timer;
    window.addEventListener('resize', function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
            lanes.forEach(function (lane) {
                lane.half = lane.track.scrollWidth / 2;
                draw(lane);
            });
        }, 200);
    });
})();
