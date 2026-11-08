import { think, resetContext } from "../src/agentBrain";
import { ENGINE_UPLOAD_MB, LOCAL_UPLOAD_MB, SPEAK_MAX_CHARS, VIDEO_UPLOAD_MB } from "../src/limits";

// [question, expected intent, expected language, expected action type or "" for none]
const CASES: [string, string, "en" | "ta", string][] = [
  ["hi", "greet", "en", ""],
  ["Hello there!", "greet", "en", ""],
  ["வணக்கம்", "greet", "ta", ""],
  ["vanakkam bro", "greet", "ta", ""],
  ["What can SANSA do?", "features", "en", ""],
  ["sansa enna panna mudiyum?", "features", "ta", ""],
  ["SANSA என்ன செய்யும்?", "features", "ta", ""],
  ["Is it free?", "free", "en", ""],
  ["how much does it cost", "free", "en", ""],
  ["idhu free ah?", "free", "ta", ""],
  ["இது இலவசமா?", "free", "ta", ""],
  ["evlo kaasu aagum", "free", "ta", ""],
  ["Start voice to text", "dictate", "en", "dictate"],
  ["start", "dictate", "en", "dictate"],
  ["voice to text start pannu", "dictate", "ta", "dictate"],
  ["ஆரம்பி", "dictate", "ta", "dictate"],
  ["Does it support Tamil?", "languages", "en", ""],
  ["which languages do you support", "languages", "en", ""],
  ["hindi support irukka", "languages", "ta", ""],
  ["How accurate is Tamil?", "accuracy", "en", ""],
  ["it writes wrong words", "accuracy", "en", ""],
  ["Which files can I upload?", "upload", "en", ""],
  ["can I upload mp3", "upload", "en", ""],
  ["whatsapp voice note text aaguma", "whatsapp", "ta", ""],
  ["Make subtitles", "subtitles", "en", ""],
  ["youtube subtitles venum", "subtitles", "ta", ""],
  ["what voices do you have", "tts", "en", ""],
  ["open text to speech", "tts", "en", "goto"],
  ["male voice irukka", "tts", "ta", ""],
  ["Play Kavya", "play", "en", "play"],
  ["vikram voice", "play", "en", "play"],
  ["கவ்யா குரல் கேட்கணும்", "play", "ta", "play"],
  ["Read: Welcome to SANSA", "say", "en", "say"],
  ["say hello everyone", "say", "en", "say"],
  ["why is it slow", "slow", "en", ""],
  ["remove background noise", "cleanup", "en", ""],
  ["open audio cleanup", "cleanup", "en", "goto"],
  ["my recording has fan noise", "cleanup", "en", ""],
  ["சத்தம் நீக்க முடியுமா", "cleanup", "ta", ""],
  ["How does voice cloning work?", "cloning", "en", ""],
  ["can you clone my voice", "cloning", "en", ""],
  ["dubbing irukka", "dubbing", "ta", ""],
  ["do you have an API", "api", "en", ""],
  ["is my audio saved?", "privacy", "en", ""],
  ["is it safe", "privacy", "en", ""],
  ["how do I sign up", "account", "en", ""],
  ["contact the team", "contact", "en", "page"],
  ["I want to talk to a person", "contact", "en", "page"],
  ["who made this", "company", "en", ""],
  ["does it work on my phone", "mobile", "en", ""],
  ["mic not working", "mic", "en", ""],
  ["how to use this", "howto", "en", ""],
  ["dark mode", "theme", "en", "theme"],
  ["thank you", "thanks", "en", ""],
  ["romba nandri", "thanks", "ta", ""],
  ["bye", "bye", "en", ""],
  ["are you a bot", "who", "en", ""],
  ["refund policy", "legal", "en", ""],
  ["are you hiring", "jobs", "en", ""],
  // new topics (2026-11-08)
  ["can you convert tanglish to tamil", "tanglish", "en", ""],
  ["tanglish la type panna tamil ah maaruma", "tanglish", "ta", ""],
  ["I want the text in english letters", "tanglish", "en", ""],
  ["can I save it as a word file", "export", "en", ""],
  ["how do I get a pdf", "export", "en", ""],
  ["send the text to whatsapp", "export", "en", ""],
  ["pdf venum", "export", "ta", ""],
  ["I have a long script for a story", "longtext", "en", ""],
  ["make an audiobook from my article", "longtext", "en", ""],
  ["can it do a one hour recording", "longaudio", "en", ""],
  ["my page closed, can I continue", "longaudio", "en", ""],
  ["ஒரு மணி நேர recording upload பண்ணலாமா", "longaudio", "ta", ""],
  ["why are some lines yellow", "unsure", "en", ""],
  ["what does highlighted mean", "unsure", "en", ""],
  ["can I share from whatsapp to sansa", "share", "en", ""],
  ["show the site in tamil", "sitelang", "en", ""],
  ["how big a file can I upload", "upload", "en", ""],
  ["how many characters can I type", "tts", "en", ""],
  // must still be right after the changes
  ["is tanglish supported", "tanglish", "en", ""],
  ["my words", "library", "en", ""],
  ["what is the weather today", "fallback", "en", ""],
  ["tell me a joke", "fallback", "en", ""],
];

let pass = 0;
const fails: string[] = [];
for (const [q, intent, lang, action] of CASES) {
  resetContext();
  const r = think(q);
  const ok = r.intent === intent && r.lang === lang && (r.action?.type ?? "") === action;
  if (ok) pass++;
  else fails.push(`  "${q}" -> got ${r.intent}/${r.lang}/${r.action?.type ?? "-"}, want ${intent}/${lang}/${action || "-"}`);
}

// follow-up context: "when?" after a coming-soon topic
resetContext();
think("voice cloning");
const w = think("when?");
const ctxOk = w.intent === "when";
resetContext();
const bare = think("when?");
const bareOk = bare.intent === "fallback";

console.log(`${pass}/${CASES.length} questions answered correctly`);
console.log(`follow-up "when?" after cloning: ${ctxOk ? "ok" : "FAIL " + w.intent}; bare "when?": ${bareOk ? "ok" : "FAIL " + bare.intent}`);
if (fails.length) console.log("Wrong:\n" + fails.join("\n"));
// Facts: the agent must quote the site's real limits (src/limits.ts)
const facts: [string, string, string[]][] = [
  ["how big a file can I upload", "upload", [`${ENGINE_UPLOAD_MB} megabytes`, `${LOCAL_UPLOAD_MB} megabytes`, `${VIDEO_UPLOAD_MB} megabytes`]],
  ["how many characters can I type", "tts", [`${SPEAK_MAX_CHARS} characters`, "ten thousand"]],
];
const factFails: string[] = [];
for (const [q, intent, must] of facts) {
  resetContext();
  const r = think(q);
  for (const m of must) if (r.intent !== intent || !r.text.includes(m)) factFails.push(`  "${q}" should say "${m}" (got: ${r.text})`);
}
console.log(`facts: ${facts.reduce((n, f) => n + f[2].length, 0) - factFails.length}/${facts.reduce((n, f) => n + f[2].length, 0)} match the site's limits`);
if (factFails.length) console.log(factFails.join("\n"));
if (fails.length || !ctxOk || !bareOk || factFails.length) process.exitCode = 1;
