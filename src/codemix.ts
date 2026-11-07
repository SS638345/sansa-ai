/**
 * Free "Mixed" output for on-device text: English words that Whisper wrote in Tamil letters
 * ("கஸ்டமர்", "டிஸ்கவுண்ட்") go back to English ("customer", "discount"), and English
 * number words ("பிப்டி பெர்சன்ட்") become digits ("50%").
 *
 * Each Tamil word is turned into rough Latin letters and reduced to a consonant "skeleton",
 * which is compared with the skeletons of a list of everyday English words. Only words on
 * that list can change, and a few Tamil words that share a skeleton are kept as they are.
 */

const VOWELS: Record<string, string> = {
  அ: "a", ஆ: "aa", இ: "i", ஈ: "ee", உ: "u", ஊ: "oo", எ: "e", ஏ: "e", ஐ: "ai", ஒ: "o", ஓ: "o", ஔ: "au",
};
const CONS: Record<string, string> = {
  க: "k", ங: "ng", ச: "s", ஞ: "nj", ட: "t", ண: "n", த: "th", ந: "n", ப: "p", ம: "m", ய: "y", ர: "r",
  ல: "l", வ: "v", ழ: "zh", ள: "l", ற: "r", ன: "n", ஜ: "j", ஷ: "sh", ஸ: "s", ஹ: "h",
};
const SIGNS: Record<string, string> = {
  "ா": "aa", "ி": "i", "ீ": "ee", "ு": "u", "ூ": "oo", "ெ": "e", "ே": "e", "ை": "ai", "ொ": "o", "ோ": "o", "ௌ": "au",
};

/** Rough Tamil → Latin letters, enough to compare sounds. */
export function toLatin(word: string): string {
  let out = "";
  const ch = [...word.normalize("NFC")];
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i];
    if (VOWELS[c]) out += VOWELS[c];
    else if (CONS[c]) {
      const next = ch[i + 1];
      if (next === "்") {
        out += CONS[c];
        i++;
      } else if (next && SIGNS[next]) {
        out += CONS[c] + SIGNS[next];
        i++;
      } else out += CONS[c] + "a";
    } else if (c === "ஃ") out += "f";
  }
  return out;
}

/** English spelling quirks → how they sound; Tamil-letter Latin passes through unchanged. */
const spell = (w: string) =>
  w
    .toLowerCase()
    .replace(/tion|sion/g, "shan")
    .replace(/sch/g, "sk")
    .replace(/gh/g, "")
    .replace(/c(?=[eiy])/g, "s")
    .replace(/([aeiou])v([aeiou])/g, "$1$2");

/** Consonant skeleton; merges sounds Tamil letters don't tell apart (p/b/f, t/d, k/g, s/sh/j...). */
export function skeleton(latin: string): string {
  return spell(latin)
    .replace(/ph/g, "f")
    .replace(/th/g, "t")
    .replace(/sh|ch|zh/g, "s")
    .replace(/ck|c|q|g/g, "k")
    .replace(/x/g, "ks")
    .replace(/[zj]/g, "s")
    .replace(/[bf]/g, "p")
    .replace(/d/g, "t")
    .replace(/w/g, "v")
    .replace(/[aeiouyh]/g, "")
    .replace(/(.)\1+/g, "$1");
}

/** Everyday English words people mix into Tamil (shops, offices, phones, money). */
const ENGLISH = `customer customers discount offer offers design designs collection collections product products
gold silver diamond platinum stone stones gram grams wastage waste weight purity hallmark antique antiques model
models finish finishing polish pattern piece pieces pair pairs ring rings chain chains bangle bangles necklace
order orders advance rate rates price prices bill billing amount cash payment balance account bank card loan
interest scheme schemes gst tax total net gross extra minimum maximum percent exchange return replacement refund
delivery pickup parcel tracking cancel confirm pending problem complaint support service centre center office
shop showroom branch manager staff owner sales sale marketing business company quality guarantee warranty
variety option options select selection example details detail information normal normally regular special
simple basic fancy light heavy best better good super perfect correct wrong ready first second last final
start starting finish online phone mobile number call message whatsapp video photo screen system computer
laptop internet app website email password time minute minutes hour hours week month year date day morning
evening school college class exam test result marks project team meeting plan report salary job work training
doctor hospital medical medicine tablet bus train ticket car bike petrol road traffic area location address
local market rent house flat room hall kitchen convert compare comparison difference satisfaction commission
margin profit loss stock size sizes colour color type types brand budget cost expense charge charges fee fees
offer price quotation estimate party parties percent percentage trend trends varieties check style cash customize customise
compromise calculation general comfort state casting discuss shops tops minus point points machine balance input
thousand hundred mostly break back pass take set mixer upload track request pick transaction confirm cancel
replacement exchange glass broken damage damaged ok okay sorry thanks welcome hello madam sir`
  .split(/\s+/)
  .filter(Boolean);

/** Tamil words whose skeleton matches an English word but which are Tamil. */
const KEEP = new Set(
  `மாதிரி மீட்டர் போர்ட் கொண்டு கடைல கடையில கடையில் போங்க பாப்பீங்க பண்ணாங்க பார்க்க பார்த்து போறது பொறுத்த
  பெரியது வரைக்கும் விஷயத்தை வச்சுட்டு முடியும் முடியுமா முடியுமோ முடியல மட்டும் மீண்டும் முன்னாடி பின்னாடி
  பின்னர் பண்ணிட்டு பண்ணிட்டா தங்க தங்கம் தாங்க குறையுது கேக்குறது காட்டும் கஷ்டம் கஸ்டம் வாங்க வாங்கி
  அவங்க பாரு ரெண்டு சொல்லிட்டு பலசு நிக்கல் கொடுத்துடும் கொடுத்தாலும் வேண்டியது`
    .split(/\s+/)
    .filter(Boolean),
);

/** Tamil endings that get stuck to an English word ("customerக்கு"). Longest first. */
const SUFFIXES = [
  "ுக்கெல்லாம்", "க்கெல்லாம்", "ுக்குள்ள", "ுக்கு", "க்கு", "ிலிருந்து", "லிருந்து", "ுல", "ில", "ல", "லயே",
  "ோட", "ஓட", "ட்ட", "ங்களா", "ங்க", "ுங்க", "ை", "ா", "ஆ", "ாக", "ாவே", "ே", "ும்", "ம்", "னா", "ன்னா", "னு", "ன்னு",
].sort((a, b) => b.length - a.length);

const bySkeleton = new Map<string, string[]>();
for (const w of ENGLISH) {
  const k = skeleton(w);
  if (k.length >= 3) bySkeleton.set(k, [...(bySkeleton.get(k) ?? []), w]);
}
// Tamil spelling of each number word, the way Whisper writes them.
const NUMBER_TAMIL: Record<string, number> = {
  ஒன்: 1, டூ: 2, த்ரீ: 3, ஃபோர்: 4, ஃபைவ்: 5, பைவ்: 5, சிக்ஸ்: 6, செவன்: 7, எயிட்: 8, நைன்: 9, டென்: 10,
  லெவன்: 11, ட்வெல்வ்: 12, டுவல்வ்: 12, ட்வல்வ்: 12, போர்டின்: 14, தேர்ட்டீன்: 13, போர்டீன்: 14, ஃபோர்டீன்: 14, பிப்டீன்: 15, ஃபிப்டீன்: 15, ஃபிஃப்டீன்: 15,
  சிக்ஸ்டீன்: 16, செவன்டீன்: 17, எய்ட்டீன்: 18, நைன்டீன்: 19, டுவென்ட்டி: 20, ட்வென்டி: 20, டுவென்டி: 20, ட்வென்ட்டி: 20,
  தேர்ட்டி: 30, தர்ட்டி: 30, ஃபார்ட்டி: 40, ஃபோர்ட்டி: 40, ஃபார்டி: 40, பிப்டி: 50, ஃபிப்டி: 50, ஃபிஃப்டி: 50,
  சிக்ஸ்டி: 60, செவன்டி: 70, எய்ட்டி: 80, நைன்டி: 90,
};

const isTamil = (w: string) => /[஀-௿]/.test(w);
const PERCENT = new Set(["prsn", "prsnt", "prsnts"]);

/** Sounds and shapes Tamil words rarely have, so a word with none of them stays Tamil. */
const FOREIGN = /[ஸஷஜஹஃ]|^(?:ட|டி)|^[கபட][ிு]?[ரல]|[டகபதஸ]்$|ன்ட|ண்ட்|ர்ட|ர்ஸ|க்ஸ|ல்ட|ல்ஸ|க்ஷ/u;

function editDistance(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[b.length];
}

/** Sounds alike once Tamil's missing letters are merged (k/g, t/d, p/b/f, s/sh...). */
const soundOf = (latin: string) =>
  skeletonKeepVowels(spell(latin));
const skeletonKeepVowels = (w: string) =>
  w.replace(/th/g, "t").replace(/sh|ch|zh/g, "s").replace(/ck|c|q|g/g, "k").replace(/[bf]/g, "p").replace(/d/g, "t")
    .replace(/w/g, "v").replace(/[zj]/g, "s").replace(/h/g, "").replace(/[ou]+/g, "u").replace(/[ae]+/g, "a")
    .replace(/[iy]+/g, "i").replace(/(.)\1+/g, "$1");

/** Short or odd loanwords the sound match can't be trusted with. */
const EXACT: Record<string, string> = {
  ஆஃபர்: "offer", ஆஃபர்ஸ்: "offers", ஆஃப்: "off", பட்: "but", ரேட்: "rate", செக்: "check", ஓல்ட்: "old",
  லைட்: "light", கட்: "cut", ஜிஎஸ்டி: "GST", ஜி_எஸ்_டி: "GST", வெயிட்: "weight", ஓகே: "OK", சாரி: "sorry",
  பேக்: "pack", டேக்: "tag", அப்டேட்: "update", ஆப்: "app", ஷாப்: "shop", பில்: "bill", பஸ்: "bus",
  பைனல்: "final", ஃபைனல்: "final", பெர்சன்ட்: "percent", பர்சன்ட்: "percent", பெர்சன்: "percent",
  பர்சன்டேஜ்: "percentage", பெர்சன்டேஜ்: "percentage", வேஸ்டேஜ்: "wastage", வேஸ்ட்டேஜ்: "wastage",
  வேஸ்டேஜஸ்: "wastages", டிரெண்ட்: "trend", புராடக்ட்: "product", புராடக்ட்ஸ்: "products",
  வெரைட்டிஸ்: "varieties", வெரிட்டிஸ்: "varieties", வெரைட்டி: "variety", ஆப்ஷன்: "option", ஆப்ஷன்ஸ்: "options",
  ஆப்சன்ஸ்: "options", டிசைன்: "design", டிசைன்ஸ்: "designs", கலெக்ஷன்ஸ்: "collections",
};

function english(core: string): string | null {
  if (EXACT[core]) return EXACT[core];
  if (KEEP.has(core) || !FOREIGN.test(core)) return null;
  const latin = toLatin(core);
  const k = skeleton(latin);
  if (k.length < 3) return null;
  const a = soundOf(latin);
  let best: string | null = null;
  let bestD = Infinity;
  for (const w of bySkeleton.get(k) ?? []) {
    const b = soundOf(w);
    const d = editDistance(a, b);
    if (d <= Math.max(2, Math.floor(b.length * 0.5)) && d < bestD) {
      best = w;
      bestD = d;
    }
  }
  return best;
}

/** One word: English for a loanword (keeping any Tamil ending), otherwise unchanged. */
function convertWord(word: string): string {
  const m = word.match(/^(.*?)([,.!?;:]*)$/u);
  const body = m ? m[1] : word;
  const punct = m ? m[2] : "";
  if (!isTamil(body) || KEEP.has(body)) return word;
  const whole = english(body);
  if (whole) return whole + punct;
  for (const s of SUFFIXES) {
    if (body.length > s.length + 2 && body.endsWith(s)) {
      const core = body.slice(0, -s.length);
      const hit = english(core) ?? english(core + "்");
      if (hit) {
        const end = body.slice(-s.length);
        // A lone vowel ending ("bestஆ") is written as the vowel; otherwise drop the joining vowel ("gramக்கு").
        const tail = VOWEL_OF_SIGN[end] ?? end.replace(/^[ாிீுூெேைொோௌ]/u, "");
        return hit + tail + punct;
      }
    }
  }
  return word;
}

/** Units that are also Tamil words, so only read as numbers right after "twenty", "thirty"... */
const UNIT_AFTER_TENS: Record<string, number> = { போர்: 4, ஒன்னு: 1, டு: 2 };

const VOWEL_OF_SIGN: Record<string, string> = { "ா": "ஆ", "ை": "ஐ", "ே": "ஏ" };

/** English number words in Tamil letters → digits; "fifty percent" → "50%". */
function convertNumbers(words: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const n = NUMBER_TAMIL[words[i]];
    if (n === undefined) {
      out.push(words[i]);
      continue;
    }
    let value = n;
    const unit = NUMBER_TAMIL[words[i + 1] ?? ""] ?? UNIT_AFTER_TENS[words[i + 1] ?? ""];
    if (n >= 20 && n % 10 === 0 && unit !== undefined && unit < 10) {
      value += unit;
      i++;
    }
    const next = words[i + 1] ?? "";
    const nextCore = next.replace(/[,.!?;:]+$/u, "");
    if (isTamil(nextCore) && PERCENT.has(skeleton(toLatin(nextCore)))) {
      out.push(`${value}%` + next.slice(nextCore.length));
      i++;
    } else out.push(String(value));
  }
  return out;
}

/** Tamil text as spoken → Tamil with the English words in English. */
export function toCodemix(text: string): string {
  const words = text.split(/(\s+)/);
  const tokens = words.filter((w) => !/^\s+$/.test(w) && w);
  return convertNumbers(tokens).map(convertWord).join(" ");
}
