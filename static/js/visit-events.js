/* Учёт нажатий «Позвонить» и кнопок мессенджеров.
   Файл ничего не показывает на странице: он только отправляет на свой сервер
   короткое сообщение о нажатии, чтобы в статистике было видно, дошёл ли человек
   до звонка. Данные уходят на /api/event — тот же сайт, без сторонних сервисов. */
(function () {
    'use strict';

    var MAX_PER_PAGE = 120;          // защита от случайного потока событий
    var DUPLICATE_MS = 1500;         // повторное нажатие той же кнопки не считаем
    var MOBILE = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    var sent = 0;
    var lastSent = {};

    // где нажали: ближайший блок с id (например, pricing) или текст кнопки
    function where(el) {
        var node = el;
        while (node && node !== document) {
            if (node.id) return node.id;
            node = node.parentElement;
        }
        return (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    }

    function send(event, label) {
        if (sent >= MAX_PER_PAGE) return;
        var key = event + '|' + label;
        var now = Date.now();
        if (lastSent[key] && now - lastSent[key] < DUPLICATE_MS) return;
        lastSent[key] = now;
        sent++;

        var body = JSON.stringify({
            event: event,
            label: label || '',
            path: location.pathname + location.hash
        });

        try {
            if (navigator.sendBeacon) {
                navigator.sendBeacon('/api/event',
                    new Blob([body], { type: 'application/json' }));
                return;
            }
        } catch (e) { /* нет поддержки — уйдём через fetch */ }

        try {
            fetch('/api/event', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: body,
                keepalive: true,
                credentials: 'same-origin'
            });
        } catch (e) { /* статистика не должна мешать посетителю */ }
    }

    document.addEventListener('click', function (e) {
        var target = e.target;
        if (!target || !target.closest) return;

        // «Позвонить»: на телефоне это звонок, на компьютере — окно с номером
        var call = target.closest('.main-button, .contact-button, .service-button, .footer-call');
        if (call) {
            var href = call.getAttribute('href') || '';
            var isTel = href.indexOf('tel:') === 0;
            send(isTel && MOBILE ? 'phone_click' : 'phone_modal', where(call));
            return;
        }

        if (target.closest('.send-link--max')) {
            send('max_click', where(target));
            return;
        }

        if (target.closest('.disposal-button')) {
            send('photo_send', where(target));
            return;
        }

        var link = target.closest('a[href]');
        if (!link) return;
        var linkHref = link.getAttribute('href') || '';
        if (linkHref.indexOf('tel:') === 0) {
            send('phone_click', where(link));
            return;
        }
        if (/^https?:/i.test(linkHref) && link.hostname !== location.hostname) {
            send('outbound_click', link.hostname);
        }
    }, true);
})();
