// PelisLatinoHD - Google Ad Manager (GPT)
// Escritorio: líder 728x90 (header_728x90) y box 300x250 (sidebar_300x250).
// Móvil: sticky 320x50 (mobile_320x50). Los banners Adcash van directos vía aclib.
window.googletag = window.googletag || { cmd: [] };
var gptDesktop = window.matchMedia("(min-width: 992px)").matches;
googletag.cmd.push(function () {
  var pubads = googletag.pubads();
  if (gptDesktop) {
    googletag.defineSlot("/23205308506/header_728x90", [728, 90], "div-gpt-ad-leader").addService(pubads);
    googletag.defineSlot("/23205308506/sidebar_300x250", [300, 250], "div-gpt-ad-sidebar").addService(pubads);
  }
  googletag.defineSlot("/23205308506/mobile_320x50", [320, 50], "div-gpt-ad-mobile").addService(pubads);
  googletag.enableServices();
  pubads.addEventListener("slotRenderEnded", function (e) {
    if (e.isEmpty) {
      var el = document.getElementById(e.slot.getSlotElementId());
      if (el) el.style.display = "none";
    }
  });
});

// El display se hace de forma diferida: un display() síncrono en el cmd inicial
// se pierde (nunca llega la petición gampad). Sondeando, cada slot dispara su
// propia petición al aparecer en el DOM (el box 300x250 se inyecta dinámicamente).
(function pollSlots() {
  function tryShow() {
    var slots = googletag.pubads().getSlots();
    for (var i = 0; i < slots.length; i++) {
      var id = slots[i].getSlotElementId();
      if (id && id.indexOf("gpt_unit_") !== 0 && document.getElementById(id)) {
        (function (sid) {
          googletag.cmd.push(function () { googletag.display(sid); });
        })(id);
      }
    }
  }
  tryShow();
  setInterval(tryShow, 400);
})();