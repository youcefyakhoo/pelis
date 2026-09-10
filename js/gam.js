// PelisLatinoHD - Google Ad Manager (GPT) - solo sticky móvil
// Los banners de red (Adcash) ahora van directos vía aclib.runBanner en js/app.js.
window.googletag = window.googletag || { cmd: [] };
googletag.cmd.push(function () {
  var pubads = googletag.pubads();
  googletag.defineSlot("/23205308506/mobile_320x50", [320, 50], "div-gpt-ad-mobile").addService(pubads);
  googletag.display("div-gpt-ad-mobile");
  googletag.enableServices();
  pubads.addEventListener("slotRenderEnded", function (e) {
    if (e.isEmpty) {
      var el = document.getElementById(e.slot.getSlotElementId());
      if (el) el.style.display = "none";
    }
  });
});