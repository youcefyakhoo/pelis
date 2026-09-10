// Monetag - integracion discreta (no intrusiva).
// Los tags se cargan solo despues de la primera interaccion del usuario
// (scroll o click) para no molestar al entrar. La vignette se retrasa aun mas.
(function () {
  if (window.location.pathname.indexOf("/detalle/") !== 0) return;
  function inject(fn) {
    var s = document.createElement("script");
    s.async = true;
    fn(s);
    (document.body || document.documentElement).appendChild(s);
  }
  var started = false;
  function boot() {
    if (started) return;
    started = true;
    // Adcash Autotag (zona 9heve5hf9h) - popunder diferido
    inject(function (s) {
      s.id = "aclib";
      s.src = "//acscdn.com/script/aclib.js";
      s.onload = function () {
        if (window.aclib && !window.__adcashTag) {
          window.__adcashTag = true;
          aclib.runAutoTag({ zoneId: "9heve5hf9h" });
        }
      };
    });
    // In-Page Push (zona 11764699) - notificacion dentro de la pagina
    inject(function (s) { s.dataset.zone = "11764699"; s.src = "https://nap5k.com/tag.min.js"; });
    // Push notifications (zona 11764700)
    inject(function (s) { s.src = "https://5gvci.com/act/files/tag.min.js?z=11764700"; s.setAttribute("data-cfasync", "false"); });
    // Vignette (zona 11764693) - diferida 2.5s tras la interaccion
    setTimeout(function () {
      inject(function (s) { s.dataset.zone = "11764693"; s.src = "https://n6wxm.com/vignette.min.js"; });
    }, 2500);
  }
  var armed = false;
  function arm() {
    if (armed) return;
    armed = true;
    setTimeout(boot, 300);
  }
  window.addEventListener("scroll", arm, { once: true, passive: true });
  window.addEventListener("touchstart", arm, { once: true, passive: true });
  window.addEventListener("click", arm, { once: true, passive: true });
  setTimeout(arm, 12000);
})();