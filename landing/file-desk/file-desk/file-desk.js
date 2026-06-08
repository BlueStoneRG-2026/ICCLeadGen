(function () {
  var header = document.querySelector("[data-header]");
  var range = document.querySelector("#fundedAmount");
  var fundedLabel = document.querySelector("[data-funded-label]");
  var payoutLabel = document.querySelector("[data-payout]");
  var bar = document.querySelector("[data-bar]");
  var formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });
  var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function updateHeader() {
    if (!header) return;
    header.classList.toggle("is-scrolled", window.scrollY > 16);
  }

  function updateCalculator() {
    if (!range || !fundedLabel || !payoutLabel || !bar) return;

    var value = Number(range.value);
    var min = Number(range.min);
    var max = Number(range.max);
    var percent = ((value - min) / (max - min)) * 100;
    var payout = value * 0.11;

    fundedLabel.textContent = formatter.format(value);
    payoutLabel.textContent = formatter.format(payout);
    bar.style.width = Math.max(3, Math.min(100, percent)) + "%";
  }

  function countUp(element) {
    var target = Number(element.getAttribute("data-target"));
    var duration = 700;
    var started = performance.now();

    if (prefersReducedMotion) {
      element.textContent = String(target);
      return;
    }

    function tick(now) {
      var progress = Math.min(1, (now - started) / duration);
      var eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = String(Math.round(target * eased));
      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    }

    requestAnimationFrame(tick);
  }

  function revealElements() {
    var items = Array.from(document.querySelectorAll("[data-reveal]"));
    var counters = Array.from(document.querySelectorAll("[data-count-up]"));

    if (!("IntersectionObserver" in window)) {
      items.forEach(function (item) {
        item.classList.add("is-visible");
      });
      counters.forEach(countUp);
      return;
    }

    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.1 });

    var counterObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting || entry.target.getAttribute("data-counted") === "true") return;
        entry.target.setAttribute("data-counted", "true");
        countUp(entry.target);
        counterObserver.unobserve(entry.target);
      });
    }, { threshold: 0.6 });

    items.forEach(function (item) {
      revealObserver.observe(item);
    });
    counters.forEach(function (counter) {
      counterObserver.observe(counter);
    });
  }

  updateHeader();
  updateCalculator();
  revealElements();

  window.addEventListener("scroll", updateHeader, { passive: true });
  if (range) {
    range.addEventListener("input", updateCalculator);
  }
})();
