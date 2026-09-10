// PelisLatinoHD - Google Ad Manager (GPT)
// Escritorio: líder 728x90 (header_728x90) y box 300x250 (sidebar_300x250).
// Móvil: sticky 320x50 (mobile_320x50).
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

// El display inmediato a veces se pierde (se traga la petición gampad durante el
// arranque, p.ej. con el flujo de consentimiento/Funding Choices). Reintento
// diferido: un único display extra por slot que aún no trae iframe.
setTimeout(function () {
  googletag.cmd.push(function () {
    ["div-gpt-ad-leader", "div-gpt-ad-mobile"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && !el.querySelector("iframe")) googletag.display(id);
    });
  });
}, 2500);

// El box 300x250 se inyecta en el grid de forma dinámica: cuando aparece en el
// DOM lo mostramos. display() sobre un slot ya mostrado lo refresca.
(function pollSidebar() {
  function tryShow() {
    if (!gptDesktop) return;
    if (document.getElementById("div-gpt-ad-sidebar")) {
      googletag.cmd.push(function () { googletag.display("div-gpt-ad-sidebar"); });
    }
  }
  tryShow();
  setInterval(tryShow, 500);
})();