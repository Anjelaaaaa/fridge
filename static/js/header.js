// Шапка: бутерброд на телефоне, плавный переход к разделам, подсветка текущего раздела
(function () {
    var header = document.querySelector('header');
    var toggle = header.querySelector('.nav-toggle');
    var links = header.querySelectorAll('.nav-links a[href^="#"]');

    // высота шапки без раскрытого меню — под неё делаем отступ при переходе к разделу
    var barHeight = header.offsetHeight;
    function setOpen(open) {
        if (open && !header.classList.contains('nav-open')) barHeight = header.offsetHeight;
        header.classList.toggle('nav-open', open);
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    }
    toggle.addEventListener('click', function () {
        setOpen(!header.classList.contains('nav-open'));
    });
    // закрыть по клику мимо меню и по Esc
    document.addEventListener('click', function (e) {
        if (header.classList.contains('nav-open') && !header.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') setOpen(false);
    });

    // переход к разделу: при прокрутке вниз шапка прячется, поэтому отступ под неё
    // нужен только когда раздел выше текущего места
    header.querySelectorAll('a[href^="#"]').forEach(function (a) {
        a.addEventListener('click', function (e) {
            var id = a.getAttribute('href').slice(1);
            var target = id === 'top' ? null : document.getElementById(id);
            if (id !== 'top' && !target) return;
            e.preventDefault();
            var barH = header.classList.contains('nav-open') ? barHeight : header.offsetHeight;
            setOpen(false);
            var y = target ? target.getBoundingClientRect().top + window.scrollY : 0;
            if (target && y < window.scrollY) y -= barH;
            window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
            history.replaceState(null, '', id === 'top' ? location.pathname : '#' + id);
        });
    });

    // подсветка раздела, который сейчас на экране
    var sections = [];
    links.forEach(function (a) {
        var s = document.getElementById(a.getAttribute('href').slice(1));
        if (s) sections.push({ el: s, link: a });
    });
    function spy() {
        var line = window.innerHeight * 0.35;
        var current = null;
        sections.forEach(function (s) {
            if (s.el.getBoundingClientRect().top <= line) current = s;
        });
        sections.forEach(function (s) {
            s.link.classList.toggle('active', s === current);
        });
    }
    window.addEventListener('scroll', spy, { passive: true });
    window.addEventListener('resize', spy);
    spy();
})();
