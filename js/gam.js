// PelisLatinoHD - Google Ad Manager (GPT)
// Escritorio: líder 728x90 (header_728x90), box 300x250 (sidebar_300x250),
// 468x60 / 160x300 / 160x600 (zonas Adsterra adsterra_468x60 / 160x300 / 160x600).
// Móvil: sticky 320x50 (mobile_320x50).
window.googletag = window.googletag || { cmd: [] };
var gptDesktop = window.matchMedia("(min-width: 992px)").matches;
var STATIC_IDS = ["div-gpt-ad-leader", "div-gpt-ad-mobile"];
var INJECTED_IDS = gptDesktop
  ? ["div-gpt-ad-sidebar", "div-gpt-ad-468x60", "div-gpt-ad-160x300", "div-gpt-ad-160x600"]
  : [];
var shown = {};
googletag.cmd.push(function () {
  var pubads = googletag.pubads();
  if (gptDesktop) {
    googletag.defineSlot("/23205308506/header_728x90", [728, 90], "div-gpt-ad-leader").addService(pubads);
    googletag.defineSlot("/23205308506/sidebar_300x250", [300, 250], "div-gpt-ad-sidebar").addService(pubads);
    googletag.defineSlot("/23205308506/adsterra_468x60", [468, 60], "div-gpt-ad-468x60").addService(pubads);
    googletag.defineSlot("/23205308506/adsterra_160x300", [160, 300], "div-gpt-ad-160x300").addService(pubads);
    googletag.defineSlot("/23205308506/adsterra_160x600", [160, 600], "div-gpt-ad-160x600").addService(pubads);
  }
  googletag.defineSlot("/23205308506/mobile_320x50", [320, 50], "div-gpt-ad-mobile").addService(pubads);
  googletag.enableServices();
  pubads.addEventListener("slotRenderEnded", function (e) {
    if (e.isEmpty) {
      var el = document.getElementById(e.slot.getSlotElementId());
      if (el) el.style.display = "none";
    }
  });
  STATIC_IDS.forEach(function (id) { googletag.display(id); });
});

// Los slots inyectados de forma dinámica (grid, fichas, home) aparecen después
// del arranque; se muestran cuando llegan al DOM. display() sobre un slot ya
// mostrado lo refresca, así que solo dispara una vez por slot.
setInterval(function () {
  if (!gptDesktop) return;
  googletag.cmd.push(function () {
    INJECTED_IDS.forEach(function (id) {
      var el = document.getElementById(id);
      if (el && !el.querySelector("iframe") && !shown[id]) {
        shown[id] = true;
        googletag.display(id);
      }
    });
  });
}, 400);

// Reintento único para slots estáticos que a veces se tragan la petición gampad
// durante el arranque (flujo de consentimiento/Funding Choices).
setTimeout(function () {
  googletag.cmd.push(function () {
    STATIC_IDS.forEach(function (id) {
      var el = document.getElementById(id);
      if (el && !el.querySelector("iframe")) googletag.display(id);
    });
  });
}, 2500);