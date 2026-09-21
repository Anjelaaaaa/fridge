// Появление блоков при прокрутке: всё, что помечено data-reveal, выплывает снизу.
// Порядок внутри группы задаёт --i (задержка 120 мс на шаг).
// Подключается в <head> без defer: класс js-reveal ставится до первой отрисовки,
// поэтому первый экран не мигает. Если скрипт не загрузится — всё просто видно сразу.
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!('IntersectionObserver' in window)) return;
  document.documentElement.classList.add('js-reveal');
  const start = () => {
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    }), { threshold: 0.15 });
    document.querySelectorAll('[data-reveal]').forEach(el => io.observe(el));
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
