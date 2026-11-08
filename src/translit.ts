/**
 * Tamil script <-> Tanglish, on the device, no API.
 *
 * tamilToTanglish: readable everyday Tanglish ("வணக்கம் எப்படி இருக்கீங்க" -> "vanakkam eppadi irukkeenga").
 *   Follows how people type Tamil in English letters: k/g, s/ch, t/d, th/dh, p/b by position,
 *   "ற்ற" -> "tr", "ன்ற" -> "ndr", "ழ" -> "zh".
 * tanglishToTamil: typed Tanglish -> Tamil letters. A list of everyday words first, then
 *   longest-match sound rules for everything else ("n" at the start -> ந, inside -> ன, etc.).
 *   Latin words that look like English ("phone", "meeting") are left as they are.
 */

/* ------------------------------------------------------------------ Tamil -> Tanglish */

const V: Record<string, string> = { அ: "a", ஆ: "aa", இ: "i", ஈ: "ee", உ: "u", ஊ: "oo", எ: "e", ஏ: "e", ஐ: "ai", ஒ: "o", ஓ: "o", ஔ: "au" };
const SIGN: Record<string, string> = { "ா": "aa", "ி": "i", "ீ": "ee", "ு": "u", "ூ": "oo", "ெ": "e", "ே": "e", "ை": "ai", "ொ": "o", "ோ": "o", "ௌ": "au", "ௗ": "au" };
const PULLI = "்";
const CONS = new Set([..."கஙசஞடணதநபமயரலவழளறனஜஷஸஹ"]);

type Syl = { c: string; v: string | null; dead: boolean }; // dead = consonant with pulli

function syllables(word: string): Syl[] {
  const ch = [...word.normalize("NFC")];
  const out: Syl[] = [];
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i];
    if (V[c]) out.push({ c: "", v: V[c], dead: false });
    else if (CONS.has(c)) {
      const n = ch[i + 1];
      if (n === PULLI) {
        out.push({ c, v: null, dead: true });
        i++;
      } else if (n && SIGN[n]) {
        out.push({ c, v: SIGN[n], dead: false });
        i++;
      } else out.push({ c, v: "a", dead: false });
    } else if (c === "ஃ") out.push({ c: "ஃ", v: null, dead: true });
    else out.push({ c: c, v: null, dead: true }); // anything else passes through
  }
  return out;
}

function consonant(s: Syl[], i: number): string {
  const c = s[i].c;
  const prev = s[i - 1];
  const next = s[i + 1];
  const start = i === 0;
  const doubledBefore = prev?.dead && prev.c === c; // second of a pair (க்க)
  const doubledAfter = s[i].dead && next?.c === c; // first of a pair
  const afterNasal = prev?.dead && "ஙஞணநனம".includes(prev.c);
  const betweenVowels = !start && prev && !prev.dead;
  switch (c) {
    case "க":
      if (start || doubledBefore || doubledAfter) return "k";
      return afterNasal || betweenVowels ? "g" : "k";
    case "ச":
      if (doubledAfter) return ""; // ச்ச -> one "ch"
      if (doubledBefore) return "ch";
      if (afterNasal) return "j";
      return "s";
    case "ட":
      if (start || doubledBefore || doubledAfter) return "t";
      return "d";
    case "த":
      if (doubledAfter) return "";
      if (doubledBefore) return "th";
      if (afterNasal) return "dh";
      if (start) return "th";
      return betweenVowels ? "dh" : "th";
    case "ப":
      if (start || doubledBefore || doubledAfter) return "p";
      return afterNasal || betweenVowels ? "b" : "p";
    case "ற":
      if (doubledAfter) return "t";
      if (doubledBefore) return "r";
      if (prev?.dead && prev.c === "ன") return "dr";
      return "r";
    case "ங":
      return next?.c === "க" ? "n" : "ng";
    case "ஞ":
      return next?.c === "ச" ? "n" : "nj";
    case "ண":
    case "ந":
    case "ன":
      return "n";
    case "ம":
      return "m";
    case "ய":
      return "y";
    case "ர":
      return "r";
    case "ல":
    case "ள":
      return "l";
    case "வ":
      return "v";
    case "ழ":
      return "zh";
    case "ஜ":
      return "j";
    case "ஷ":
      return "sh";
    case "ஸ":
      return "s";
    case "ஹ":
      return "h";
    case "ஃ":
      return "f";
    default:
      return c;
  }
}

function wordToTanglish(word: string): string {
  const s = syllables(word);
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const x = s[i];
    if (x.c) out += consonant(s, i);
    if (x.v) out += x.v;
  }
  // a final long "aa" is usually typed short in Tanglish ("appa", "amma"); one-syllable words keep it ("vaa")
  return s.length > 2 ? out.replace(/aa$/, "a") : out;
}

/** Tamil script -> everyday Tanglish. Non-Tamil text (English words, numbers, punctuation) is kept. */
export function tamilToTanglish(text: string): string {
  return text.replace(/[஀-௿]+/g, (w) => wordToTanglish(w));
}

/* ------------------------------------------------------------------ Tanglish -> Tamil */

const WORDS: Record<string, string> = {
  vanakkam: "வணக்கம்", nandri: "நன்றி", romba: "ரொம்ப", nalla: "நல்ல", nallaa: "நல்லா", nalla_irukken: "நல்லா இருக்கேன்",
  enna: "என்ன", ennaa: "என்னா", epdi: "எப்படி", eppadi: "எப்படி", epadi: "எப்படி", enga: "எங்க", engae: "எங்கே",
  eppo: "எப்போ", epo: "எப்போ", yaar: "யார்", yaaru: "யாரு", yen: "ஏன்", ean: "ஏன்", edhu: "எது", ethu: "எது",
  idhu: "இது", ithu: "இது", adhu: "அது", athu: "அது", inga: "இங்க", anga: "அங்க", ippo: "இப்போ", ipo: "இப்போ",
  naan: "நான்", nee: "நீ", neenga: "நீங்க", avan: "அவன்", aval: "அவள்", avanga: "அவங்க", naanga: "நாங்க", naama: "நாம", namma: "நம்ம",
  unga: "உங்க", ungaluku: "உங்களுக்கு", enaku: "எனக்கு", enakku: "எனக்கு", unaku: "உனக்கு", unakku: "உனக்கு",
  iruku: "இருக்கு", irukku: "இருக்கு", irukkeenga: "இருக்கீங்க", irukinga: "இருக்கீங்க", irukeenga: "இருக்கீங்க", irukken: "இருக்கேன்", iruken: "இருக்கேன்",
  illa: "இல்ல", illai: "இல்லை", aamaa: "ஆமா", aama: "ஆமா", sari: "சரி", seri: "சரி", ok: "ஓகே", okay: "ஓகே",
  venum: "வேணும்", vendam: "வேண்டாம்", venaam: "வேணாம்", mudiyum: "முடியும்", mudiyadhu: "முடியாது", mudiyathu: "முடியாது",
  pannu: "பண்ணு", pannunga: "பண்ணுங்க", pannalaam: "பண்ணலாம்", pannalam: "பண்ணலாம்", pannren: "பண்றேன்", panren: "பண்றேன்",
  sollu: "சொல்லு", sollunga: "சொல்லுங்க", solren: "சொல்றேன்", paaru: "பாரு", paarunga: "பாருங்க", vaa: "வா", vaanga: "வாங்க",
  po: "போ", poo: "போ", ponga: "போங்க", saapadu: "சாப்பாடு", sapadu: "சாப்பாடு", saaptiya: "சாப்டியா", saaptinga: "சாப்டீங்களா",
  veedu: "வீடு", veetla: "வீட்ல", amma: "அம்மா", appa: "அப்பா", anna: "அண்ணா", akka: "அக்கா", thambi: "தம்பி", thangachi: "தங்கச்சி",
  kaasu: "காசு", panam: "பணம்", velai: "வேலை", vela: "வேலை", naalaiku: "நாளைக்கு", naalai: "நாளை", inniki: "இன்னிக்கு", indru: "இன்று", nethu: "நேத்து",
  kaalai: "காலை", maalai: "மாலை", raathiri: "ராத்திரி", neram: "நேரம்", konjam: "கொஞ்சம்", niraya: "நிறைய", ellam: "எல்லாம்", ellaam: "எல்லாம்",
  kalyanam: "கல்யாணம்", kalyaanam: "கல்யாணம்", thanni: "தண்ணி", kannu: "கண்ணு", ponnu: "பொண்ணு", paiyan: "பையன்", oor: "ஊர்", ooru: "ஊரு",
  tamil: "தமிழ்", thamizh: "தமிழ்", tamizh: "தமிழ்", chennai: "சென்னை", madurai: "மதுரை", kovai: "கோவை",
  da: "டா", di: "டி", la: "ல", le: "லே", va: "வா", thaan: "தான்", dhaan: "தான்", kooda: "கூட", mattum: "மட்டும்",
  pesu: "பேசு", pesunga: "பேசுங்க", kelu: "கேளு", kelunga: "கேளுங்க", theriyum: "தெரியும்", theriyala: "தெரியல", puriyala: "புரியல", puriyudhu: "புரியுது",
  aagum: "ஆகும்", aagudhu: "ஆகுது", aaguthu: "ஆகுது", varen: "வரேன்", varein: "வரேன்", poren: "போறேன்", irundha: "இருந்தா",
};

// longest first; each rule: Latin sound -> [Tamil when it starts a syllable with a vowel sign, the consonant]
const CONS_MAP: [string, string][] = [
  ["ksh", "க்ஷ"], ["ngk", "ங்க"], ["nch", "ஞ்ச"], ["ndr", "ன்ற"], ["tr", "ற்ற"],
  ["zh", "ழ"], ["sh", "ஷ"], ["ch", "ச"], ["th", "த"], ["dh", "த"], ["ng", "ங்க"], ["nj", "ஞ"], ["gn", "ஞ"],
  ["kk", "க்க"], ["cc", "ச்ச"], ["tt", "ட்ட"], ["pp", "ப்ப"], ["mm", "ம்ம"], ["nn", "ன்ன"], ["ll", "ல்ல"], ["rr", "ற"], ["LL", "ள்ள"],
  ["k", "க"], ["g", "க"], ["c", "க"], ["q", "க"], ["s", "ச"], ["j", "ஜ"], ["t", "ட"], ["d", "ட"], ["N", "ண"], ["n", "ன"],
  ["p", "ப"], ["b", "ப"], ["f", "ஃப"], ["m", "ம"], ["y", "ய"], ["r", "ர"], ["l", "ல"], ["L", "ள"], ["v", "வ"], ["w", "வ"],
  ["h", "ஹ"], ["x", "க்ஸ"], ["z", "ஸ"],
];
const VOWEL_MAP: [string, string, string][] = [
  // latin, independent vowel, vowel sign
  ["aa", "ஆ", "ா"], ["ai", "ஐ", "ை"], ["au", "ஔ", "ௌ"], ["ae", "ஏ", "ே"], ["ee", "ஈ", "ீ"], ["ii", "ஈ", "ீ"], ["oo", "ஊ", "ூ"],
  ["uu", "ஊ", "ூ"], ["oa", "ஓ", "ோ"], ["ei", "ஏ", "ே"],
  ["a", "அ", ""], ["i", "இ", "ி"], ["u", "உ", "ு"], ["e", "எ", "ெ"], ["o", "ஒ", "ொ"],
];

function wordToTamil(word: string): string {
  // a capital first letter is just sentence case; capital N / L inside a word mean ண / ள
  const w = word[0].toLowerCase() + word.slice(1);
  const lower = w.toLowerCase();
  if (WORDS[lower]) return WORDS[lower];
  let out = "";
  let i = 0;
  let first = true;
  while (i < w.length) {
    let cons = "";
    let ci = 0;
    for (const [lat, ta] of CONS_MAP) {
      const piece = w.substr(i, lat.length);
      if (piece === lat || (lat.toLowerCase() === lat && piece.toLowerCase() === lat && lat !== "n" && lat !== "l")) {
        cons = ta;
        ci = lat.length;
        break;
      }
    }
    if (cons) {
      // word-initial n -> ந, n before d/th -> ந (ந்த)
      if (cons === "ன" && (first || /^(th|dh|d)/i.test(w.substr(i + 1)))) cons = "ந";
      // th at the start is த, t/d at the start: ட is rare at word start in Tamil -> த
      if (cons === "ட" && first) cons = "த";
      i += ci;
      let sign: string | null = null;
      for (const [lat, , vs] of VOWEL_MAP) {
        if (w.substr(i, lat.length).toLowerCase() === lat) {
          sign = vs;
          i += lat.length;
          break;
        }
      }
      out += sign === null ? cons + PULLI : cons + sign;
    } else {
      let matched = false;
      for (const [lat, iv] of VOWEL_MAP) {
        if (w.substr(i, lat.length).toLowerCase() === lat) {
          out += iv;
          i += lat.length;
          matched = true;
          break;
        }
      }
      if (!matched) {
        out += w[i];
        i++;
      }
    }
    first = false;
  }
  // a final "a" often stands for "ை"? No - keep as typed. Fix doubled pulli from clusters like "க்க" + pulli.
  return out.replace(/்்/g, "்");
}

const ENGLISH_HINT = /(tion|ing$|ph|ck|qu)|^(the|and|for|you|your|this|that|with|from|have|will|meeting|phone|mobile|office|please|thanks?|hello|sorry|order|delivery|price|offer|online|app|whatsapp|email|google|youtube|video|audio|photo|free|time|today|tomorrow|okay|bro|sir|madam)$/i;

/** Tanglish -> Tamil letters. Words that look English are kept in English. */
export function tanglishToTamil(text: string, opts: { keepEnglish?: boolean } = { keepEnglish: true }): string {
  return text.replace(/[A-Za-z]+/g, (w) => {
    if (WORDS[w.toLowerCase()]) return WORDS[w.toLowerCase()];
    if (opts.keepEnglish !== false && ENGLISH_HINT.test(w) && w.length > 2) return w;
    return wordToTamil(w);
  });
}
