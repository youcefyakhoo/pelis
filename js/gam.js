// PelisLatinoHD - Google Ad Manager (GPT) slots
// Red de terceros servida vía GAM: /23205308506/{adunit} (creatividades Adsterra)
// Estáticos: header_728x90 (leader) + mobile_320x50 (sticky) en la carga.
// Dinámicos: sidebar_300x250 (box en grid) y native_tile (tile al final del grid) y native_detail (anuncio en ficha).
window.googletag = window.googletag || { cmd: [] };
googletag.cmd.push(function () {
  var pubads = googletag.pubads();
  // Slots estáticos (carga inicial)
  googletag.defineSlot("/23205308506/header_728x90", [728, 90], "div-gpt-ad-leader").addService(pubads);
  googletag.defineSlot("/23205308506/mobile_320x50", [320, 50], "div-gpt-ad-mobile").addService(pubads);
  googletag.display("div-gpt-ad-leader");
  googletag.display("div-gpt-ad-mobile");
  googletag.enableServices();

  window.GamBox = {
    alive: false,
    show: function () {
      if (!document.getElementById("div-gpt-ad-box")) return;
      var self = this;
      googletag.cmd.push(function () {
        if (self.alive) { try { googletag.destroySlots([self.slot]); } catch (e) {} }
        self.slot = googletag.defineSlot("/23205308506/sidebar_300x250", [300, 250], "div-gpt-ad-box").addService(pubads);
        self.alive = true;
        googletag.display("div-gpt-ad-box");
      });
    }
  };

  window.GamNative = {
    alive: false,
    show: function () {
      if (!document.getElementById("div-gpt-ad-native")) return;
      var self = this;
      googletag.cmd.push(function () {
        if (self.alive) { try { googletag.destroySlots([self.slot]); } catch (e) {} }
        self.slot = googletag.defineSlot("/23205308506/native_tile", [300, 250], "div-gpt-ad-native").addService(pubads);
        self.alive = true;
        googletag.display("div-gpt-ad-native");
      });
    }
  };

  window.GamDetail = {
    alive: false,
    show: function () {
      if (!document.getElementById("div-gpt-ad-detail")) return;
      var self = this;
      googletag.cmd.push(function () {
        if (self.alive) { try { googletag.destroySlots([self.slot]); } catch (e) {} }
        self.slot = googletag.defineSlot("/23205308506/native_tile", [300, 250], "div-gpt-ad-detail").addService(pubads);
        self.alive = true;
        googletag.display("div-gpt-ad-detail");
      });
    }
  };

  window.GamHoriz = {
    alive: false,
    show: function () {
      if (!document.getElementById("div-gpt-ad-detail-leader")) return;
      var self = this;
      googletag.cmd.push(function () {
        if (self.alive) { try { googletag.destroySlots([self.slot]); } catch (e) {} }
        self.slot = googletag.defineSlot("/23205308506/header_728x90", [728, 90], "div-gpt-ad-detail-leader").addService(pubads);
        self.alive = true;
        googletag.display("div-gpt-ad-detail-leader");
      });
    }
  };

  window.GamLeader = {
    alive: false,
    show: function () {
      if (!document.getElementById("div-gpt-ad-infeed")) return;
      var self = this;
      googletag.cmd.push(function () {
        if (self.alive) { try { googletag.destroySlots([self.slot]); } catch (e) {} }
        self.slot = googletag.defineSlot("/23205308506/header_728x90", [728, 90], "div-gpt-ad-infeed").addService(pubads);
        self.alive = true;
        googletag.display("div-gpt-ad-infeed");
      });
    }
  };

  window.GamMonetag = {
    alive: false,
    show: function () {
      if (!document.getElementById("div-gpt-ad-monetag-direct")) return;
      var self = this;
      googletag.cmd.push(function () {
        if (self.alive) { try { googletag.destroySlots([self.slot]); } catch (e) {} }
        self.slot = googletag.defineSlot("/23205308506/monetag_direct", [728, 90], "div-gpt-ad-monetag-direct").addService(pubads);
        self.alive = true;
        googletag.display("div-gpt-ad-monetag-direct");
      });
    }
  };
});