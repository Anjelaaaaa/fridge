// Яндекс Метрика: счётчик + цели «нажали Позвонить».
// Номер счётчика берётся из data-id у тега <script> (его подставляет сервер из
// переменной окружения YANDEX_METRIKA_ID). Файл свой, а не встроенный <script>,
// чтобы работать под строгой защитой страницы (CSP).
(function () {
    var me = document.currentScript;
    var id = me && Number(me.dataset.id);
    if (!id) return;

    // официальный загрузчик Метрики
    (function (m, e, t, r, i, k, a) {
        m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
        m[i].l = 1 * new Date();
        for (var j = 0; j < e.scripts.length; j++) { if (e.scripts[j].src === r) return; }
        k = e.createElement(t); a = e.getElementsByTagName(t)[0];
        k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
    })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');

    ym(id, 'init', {
        clickmap: true,
        trackLinks: true,
        accurateTrackBounce: true,
        webvisor: true
    });

    // Цель «call»: любое нажатие на «Позвонить» / номер телефона / «Отправить фото».
    // В Метрике: Настройки → Цели → Добавить цель → «JavaScript-событие», идентификатор call.
    var CALL = '.main-button, .contact-button, .service-button, .disposal-button,'
        + ' .footer-call, .nav-call, a[href^="tel:"]';
    document.addEventListener('click', function (e) {
        var el = e.target.closest && e.target.closest(CALL);
        if (!el) return;
        var where = el.className ? String(el.className).split(' ')[0] : 'tel';
        ym(id, 'reachGoal', 'call', { button: where });
    }, true);
})();
