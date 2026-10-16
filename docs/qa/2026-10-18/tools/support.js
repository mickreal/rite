// Minimal stand-in for the design artifact's template runtime, enough to render the artboards for visual comparison.
// Supports {{expr}} in text/attributes, <sc-if value>, <sc-for list as>, onClick/onInput/onChange handlers, <helmet>.
(function () {
  class DCLogic {
    constructor(props) { this.props = props || {}; this.state = {}; }
    setState(s) { Object.assign(this.state, typeof s === "function" ? s(this.state) : s); window.__dcRender && window.__dcRender(); }
  }
  window.DCLogic = DCLogic;
  const ev = (expr, scope) => { try { return new Function("__s", "with(__s){return (" + expr + ")}")(scope); } catch (e) { return undefined; } };
  const RE = /\{\{([\s\S]+?)\}\}/g;
  function interp(str, scope) {
    const whole = str.match(/^\s*\{\{([\s\S]+?)\}\}\s*$/);
    if (whole) return ev(whole[1], scope);
    return str.replace(RE, (_, e) => { const v = ev(e, scope); return v == null ? "" : String(v); });
  }
  function proc(node, scope, out) {
    if (node.nodeType === 3) { out.appendChild(document.createTextNode(RE.test(node.nodeValue) ? String(interp(node.nodeValue, scope) ?? "") : node.nodeValue)); RE.lastIndex = 0; return; }
    if (node.nodeType !== 1) return;
    const tag = node.localName;
    if (tag === "sc-if") { if (interp(node.getAttribute("value") || "", scope)) node.childNodes.forEach((c) => proc(c, scope, out)); return; }
    if (tag === "sc-for") {
      const list = interp(node.getAttribute("list") || "", scope) || []; const as = node.getAttribute("as") || "item";
      (Array.isArray(list) ? list : []).forEach((item, i) => { const s2 = Object.create(scope); s2[as] = item; s2.index = i; node.childNodes.forEach((c) => proc(c, s2, out)); });
      return;
    }
    const el = node.namespaceURI === "http://www.w3.org/2000/svg" ? document.createElementNS(node.namespaceURI, tag) : document.createElement(tag);
    for (const a of Array.from(node.attributes)) {
      const v = a.value.includes("{{") ? interp(a.value, scope) : a.value;
      if (/^on[A-Z]/.test(a.name) || /^on/.test(a.name) && typeof v === "function") { if (typeof v === "function") el.addEventListener(a.name.slice(2).toLowerCase(), v); continue; }
      if (a.name.startsWith("hint-") || a.name === "ref") continue;
      if (v === false || v == null) continue;
      try { el.setAttribute(a.name, v === true ? "" : String(v)); } catch (e) {}
      if (a.name === "value" && (tag === "input" || tag === "textarea")) el.value = String(v);
    }
    const src = tag === "template" ? node.content : node;
    src.childNodes.forEach((c) => proc(c, scope, el));
    out.appendChild(el);
  }
  document.addEventListener("DOMContentLoaded", () => {
    const root = document.querySelector("x-dc"); if (!root) return;
    const helmet = root.querySelector("helmet");
    if (helmet) { Array.from(helmet.childNodes).forEach((n) => document.head.appendChild(n)); helmet.remove(); }
    const tpl = root.cloneNode(true); root.innerHTML = "";
    const scr = document.querySelector("script[data-dc-script]");
    let comp = null;
    if (scr) { try { const C = new Function("DCLogic", scr.textContent + "\n;return Component;")(DCLogic); comp = new C(JSON.parse(scr.dataset.props || "{}")); } catch (e) { console.error("dc component", e); } }
    window.__dc = comp;
    window.__dcRender = () => {
      const vals = comp && comp.renderVals ? comp.renderVals() : {};
      const frag = document.createDocumentFragment();
      tpl.childNodes.forEach((c) => proc(c, Object.assign(Object.create(null), vals), frag));
      root.innerHTML = ""; root.appendChild(frag);
    };
    window.__dcRender();
    try { comp && comp.componentDidMount && comp.componentDidMount(); } catch (e) { console.error("didMount", e); }
  });
})();
