// GET /admin/voice: audition voices and cadence markup. Play POSTs the textarea to /admin/tts (same pipeline as the
// reading narration) and plays the MP3 it returns. The admin key travels as a bearer header from the page's own ?key=.
import { html } from "hono/html";
import { shell } from "./theme";
import { TTS_MODELS, PARAGRAPH_MS, DEFAULT_PAUSE_MS, MAX_PAUSE_MS, MAX_ADMIN_CHARS, type TtsConfig } from "../tts";

/** A real chapter excerpt (chapter three for a 14 Aug 1997 Melbourne chart), as narrationText writes it, markup included. */
export const SAMPLE_SCRIPT = `Chapter three — the pass and the turn. [pause 1000]

The exact pass — the twenty-eighth of April, twenty twenty-seven. [pause 450] Standing on your own degree.

This is the day Saturn sits exactly where it was when you were born. Nothing has to happen. It's a marker, not an event, and what you do around it matters more than the day itself.

The week before — clear one evening, and write down the decision you keep circling.

On the day — do one small, concrete thing that commits you to it.

The month after — keep the promise, even when it's dull. [pause 1200]

That's the pass. Next, the turn.`;

const CSS = `
.vox{max-width:880px;margin:0 auto;padding:8px clamp(16px,4vw,48px) 120px;display:flex;flex-direction:column;gap:22px}
.vox h1{margin:0;font-family:'Bricolage Grotesque',serif;font-size:44px;letter-spacing:-.03em;font-weight:800;line-height:1}
.vox h2{margin:0 0 10px;font-family:'Bricolage Grotesque',serif;font-size:22px;letter-spacing:-.02em;font-weight:600}
.vox label{display:flex;flex-direction:column;gap:6px;font-size:14px;color:#A7A196;min-width:0}
.vox textarea,.vox select{font:400 16px/1.55 'Hanken Grotesk',sans-serif;color:#EDE6D6;background:#0E1014;border:1px solid rgba(237,230,214,.22);border-radius:14px;padding:12px 14px;width:100%;box-sizing:border-box}
.vox textarea{min-height:300px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px}
.vox select{min-height:48px}
.vox .row{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:14px}
.vox .bar{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.vox audio{width:100%}
.vox code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;color:#F2B544}
.vox ul{margin:0;padding-left:20px;line-height:1.7;color:#CFC8BA}
.vox .status{min-height:22px;font-size:14px;color:#A7A196}
.vox .ghostbtn{min-height:48px;border-radius:999px;border:1px solid rgba(237,230,214,.22);background:transparent;color:#EDE6D6;padding:0 18px;font:500 15px 'Hanken Grotesk',sans-serif;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}
`;

export function voicePage(d: { key?: string | null; current: TtsConfig; ai: boolean; models?: typeof TTS_MODELS }) {
  const MODELS = d.models ?? TTS_MODELS;
  const back = `/admin${d.key ? `?key=${encodeURIComponent(d.key)}` : ""}`;
  const body = html`<main class="vox">
<div class="bar" style="justify-content:space-between"><h1>Voice</h1><a class="ghostbtn" href="${back}">Back to admin</a></div>
<p class="muted" style="margin:-8px 0 0">Live narration uses <code>${d.current.model}</code> · <code>${d.current.voice}</code> (ElevenLabs v3 + Anna whenever <code>ELEVENLABS_API_KEY</code> is set; <code>TTS_MODEL</code> / <code>TTS_VOICE</code> override it).${d.ai || d.current.model.startsWith("elevenlabs/") ? "" : html` <b style="color:#E08A7A">No AI binding on this deployment, so Play will fail.</b>`}</p>
<section class="card">
<form id="vf" style="display:flex;flex-direction:column;gap:14px">
<label>Script <textarea id="vt" spellcheck="false" maxlength="${MAX_ADMIN_CHARS}">${SAMPLE_SCRIPT}</textarea></label>
<div class="row">
<label>Model <select id="vm">${MODELS.map((m) => html`<option value="${m.id}" ${m.id === d.current.model ? html`selected` : ""}>${m.label} · ${m.note}</option>`)}</select></label>
<label>Voice <select id="vv"></select></label>
</div>
<div class="bar"><button class="solid" id="vp" type="submit">Play</button><a class="ghostbtn" id="vd" download="rite-voice.mp3" style="display:none">Download MP3</a><span class="status" id="vs" role="status" aria-live="polite"></span></div>
<audio id="va" controls preload="none"></audio>
</form>
</section>
<section class="card"><h2>Cadence markup</h2><ul>
<li>Blank line: paragraph pause, ${PARAGRAPH_MS} ms.</li>
<li><code>[pause 800]</code>: exactly 800 ms of silence (0 to ${MAX_PAUSE_MS}). <code>[pause]</code> alone is ${DEFAULT_PAUSE_MS} ms. Several in a row add up.</li>
<li>Sentence breaks aren't spliced; the voice's own pause after a full stop is kept. Commas and em-dashes give short breaths.</li>
<li>Each pause point is a separate TTS request (up to 24 per script; the shortest pauses are dropped first beyond that).</li>
<li>Write dates as words: "the twenty-eighth of April, twenty twenty-seven".</li>
<li>Same endpoint for VO: <code>POST /admin/tts</code> with JSON <code>{"text", "model", "voice"}</code> and <code>Authorization: Bearer &lt;ADMIN_KEY&gt;</code> returns <code>audio/mpeg</code>.</li>
</ul></section>
</main>`;
  const models = JSON.stringify(MODELS.map((m) => ({ id: m.id, voices: m.voices, def: m.defaultVoice }))).replace(/</g, "\\u003c");
  const script = `(function(){var M=${models},CUR=${JSON.stringify(d.current).replace(/</g, "\\u003c")},KEY=new URLSearchParams(location.search).get('key')||'';
var $=function(i){return document.getElementById(i)},vm=$('vm'),vv=$('vv'),vs=$('vs'),va=$('va'),vd=$('vd'),vp=$('vp'),url=null;
function fill(){var m=M.find(function(x){return x.id===vm.value})||M[0];vv.innerHTML='';m.voices.forEach(function(v){var o=document.createElement('option');o.value=v;o.textContent=v+(v===m.def?' (default)':'');if(v===(vm.value===CUR.model?CUR.voice:m.def))o.selected=true;vv.appendChild(o)})}
vm.addEventListener('change',fill);fill();
$('vf').addEventListener('submit',function(e){e.preventDefault();var t=$('vt').value.trim();if(!t)return;vp.disabled=true;vs.textContent='Synthesising\\u2026';var t0=Date.now();
 fetch('/admin/tts',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+KEY},body:JSON.stringify({text:t,model:vm.value,voice:vv.value})}).then(function(r){
  if(!r.ok)return r.text().then(function(x){var m=x;try{m=JSON.parse(x).error||x}catch(_){}throw new Error(r.status+' '+m)});
  var h=r.headers;return r.blob().then(function(b){if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(b);va.src=url;vd.href=url;vd.style.display='';va.play().catch(function(){});
   vs.textContent=h.get('x-tts-voice')+' \\u00b7 '+h.get('x-tts-chunks')+' chunks'+(h.get('x-tts-spliced')==='true'?', pauses spliced':', pauses NOT spliced (unrecognised MP3)')+' \\u00b7 '+(Number(h.get('x-tts-duration-ms'))/1000).toFixed(1)+' s audio \\u00b7 '+((Date.now()-t0)/1000).toFixed(1)+' s to make'})
 }).catch(function(err){vs.textContent='Failed: '+err.message}).finally(function(){vp.disabled=false})});
})();`;
  return shell({ title: "Rite voice", description: "Admin", body, extraCss: CSS, script, noFooter: true, nav: html`<nav class="main"><a href="/">Site</a></nav>` });
}
