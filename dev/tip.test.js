"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const I = require("../i18n.js");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

// The tip card is the same in every OnAir Garage app (apps/COMMON-FEATURES.md, section 6).
const EXPECTED = {
  en: { text: "Useful to you? A coffee for the mechanics is always welcome.", btn: "Tip jar", url: "https://onairgarage.com/support/" },
  it: { text: "Ti è utile? Un caffè per i meccanici è sempre ben accetto.", btn: "Salvadanaio", url: "https://onairgarage.com/it/support/" },
  es: { text: "¿Te resulta útil? Un café para los mecánicos siempre es bienvenido.", btn: "Hucha", url: "https://onairgarage.com/es/support/" }
};

test("tip card: text, button and support-page link exist in the three languages", () => {
  assert.deepEqual(I.langs.slice().sort(), ["en", "es", "it"]);
  for (const lang of I.langs) {
    assert.equal(I.t(lang, "tip.text"), EXPECTED[lang].text, lang + " text");
    assert.equal(I.t(lang, "tip.btn"), EXPECTED[lang].btn, lang + " button");
    assert.equal(I.t(lang, "tip.url"), EXPECTED[lang].url, lang + " url");
  }
});

test("tip card: the page has the jar link and the pill, both opening a new tab safely", () => {
  const html = read("index.html");
  assert.match(html, /<a class="tip__art" id="tipArt" href="https:\/\/onairgarage\.com\/support\/" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true"><img src="icons\/tip-jar\.webp" alt=""/);
  assert.match(html, /<a class="tip__btn" id="tipLink" href="https:\/\/onairgarage\.com\/support\/" target="_blank" rel="noopener" data-i18n="tip\.btn">/);
  assert.match(html, /data-i18n="tip\.text"/);
});

test("tip card: the links follow the language of the app", () => {
  const app = read("app.js");
  assert.match(app, /\$\("tipLink"\)\.setAttribute\("href", t\("tip\.url"\)\)/);
  assert.match(app, /\$\("tipArt"\)\.setAttribute\("href", t\("tip\.url"\)\)/);
});

test("tip card: the jar is shipped, cached for offline use and the cache version is bumped with the app version", () => {
  const jar = fs.readFileSync(path.join(root, "icons/tip-jar.webp"));
  assert.equal(jar.subarray(0, 4).toString("latin1"), "RIFF");
  assert.equal(jar.subarray(8, 12).toString("latin1"), "WEBP");
  const sw = read("sw.js");
  assert.ok(sw.includes('"./icons/tip-jar.webp"'), "jar in the precache list");
  const appVersion = /var VERSION = "([^"]+)"/.exec(read("app.js"))[1];
  const cacheVersion = /const CACHE_VERSION = "v([^"]+)"/.exec(sw)[1];
  assert.equal(cacheVersion, appVersion);
  assert.match(read("index.html"), new RegExp('<span id="ver">v' + appVersion.replace(/\./g, "\\.") + "</span>"));
});

test("manifest: screenshots (wide and narrow) are declared with their real size", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const shots = manifest.screenshots;
  assert.deepEqual(shots.map((s) => s.form_factor).sort(), ["narrow", "wide"]);
  for (const s of shots) {
    assert.equal(s.type, "image/png");
    assert.ok(s.label && s.label.length > 10, "label");
    const png = fs.readFileSync(path.join(root, s.src));
    assert.equal(png.subarray(1, 4).toString("latin1"), "PNG");
    const size = png.readUInt32BE(16) + "x" + png.readUInt32BE(20);
    assert.equal(size, s.sizes, s.src + " declared size");
  }
});
