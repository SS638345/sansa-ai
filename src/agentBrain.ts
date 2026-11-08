/**
 * SANSA's own voice-agent brain: no external AI, no key, no cost. Runs in the browser.
 *
 * Understands English, Tamil (script) and Tanglish questions about SANSA, answers in the
 * visitor's language, and can do things on the page (start voice to text, open a section,
 * play a voice, read text aloud, switch theme). Answers only from the facts below.
 */
export type Lang = "en" | "ta";
export type Action =
  | { type: "dictate" }
  | { type: "goto"; id: string }
  | { type: "play"; voice: string }
  | { type: "say"; text: string }
  | { type: "theme" }
  | { type: "page"; url: string };
export type Reply = { intent: string; lang: Lang; text: string; action?: Action; suggestions: string[] };

const TANGLISH = new Set(
  ("enna enaku enakku epdi eppadi epadi iruku irukku iruka irukka irukkuma venum vendum venuma pannu panna pannalam pannanum " +
    "pannunga sollu sollunga solunga theriyuma theriyum theriyala illa illaya aagum aaguma aagudhu kudu kudunga podu kelu " +
    "naan nee neenga unga ungaluku enga eppo epo yaaru yaru evlo evvalavu evalavu sari seri vanakkam nandri romba nalla " +
    "pesu pesunga padi padinga paaru paarunga edhu ethu edhuku ethuku yen yean mudiyuma mudiyum mudiyadhu kaasu panam " +
    "vaanga varum varuma iruntha irundha thaan dhaan idhu ithu adhu athu inga ange konjam vena venam aa aah bro machan").split(" "),
);

export function detectLang(text: string): Lang {
  if (/[஀-௿]/.test(text)) return "ta";
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const hits = words.filter((w) => TANGLISH.has(w) && w.length > 2).length;
  return hits >= 1 && hits / Math.max(words.length, 1) >= 0.2 ? "ta" : "en";
}

const norm = (t: string) => " " + t.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim() + " ";

type Intent = {
  id: string;
  /** English / Tanglish keywords or phrases (matched as whole words) */
  kw: string[];
  /** Tamil-script fragments (matched as substrings) */
  ta?: string[];
  en: string;
  tam: string;
  action?: Action;
  /** action only when the visitor asks to do it ("open", "start", "try") */
  actionOnDo?: boolean;
  next?: string[];
};

const VOICE_NAMES: Record<string, string> = { kavya: "kavya", arjun: "arjun", meera: "meera", vikram: "vikram", "கவ்யா": "kavya", "அர்ஜுன்": "arjun", "மீரா": "meera", "விக்ரம்": "vikram" };

const INTENTS: Intent[] = [
  {
    id: "greet",
    kw: ["hi", "hello", "hey", "hai", "vanakkam", "good morning", "good evening", "good afternoon"],
    ta: ["வணக்கம்", "ஹலோ", "ஹாய்"],
    en: "Hello! I'm the SANSA voice agent. Ask me about speech to text, our voices or audio cleanup, or say start to begin voice to text.",
    tam: "வணக்கம்! நான் SANSA voice agent. Speech to text, எங்க voices, audio cleanup பற்றி கேளுங்க. Voice to text ஆரம்பிக்க start-னு சொல்லுங்க.",
    next: ["What can SANSA do?", "Is it free?", "Start voice to text"],
  },
  {
    id: "thanks",
    kw: ["thanks", "thank you", "thank u", "thx", "nandri", "super", "great", "awesome", "nice"],
    ta: ["நன்றி", "சூப்பர்"],
    en: "You're welcome! Anything else I can help with?",
    tam: "நன்றி! வேற ஏதாவது உதவி வேணுமா?",
  },
  {
    id: "bye",
    kw: ["bye", "goodbye", "see you", "that s all", "thats all", "poitu varen", "ok bye"],
    ta: ["போயிட்டு வரேன்", "பை"],
    en: "Bye! Come back any time.",
    tam: "சரி, மீண்டும் வாங்க!",
  },
  {
    id: "who",
    kw: ["who are you", "your name", "are you ai", "are you a bot", "are you human", "real person", "nee yaaru", "neenga yaaru"],
    ta: ["நீ யார்", "நீங்க யார்", "உங்க பெயர்", "நீங்கள் யார்"],
    en: "I'm SANSA's website voice agent. I answer questions about SANSA and can open our tools for you. For anything I can't answer, the team is on the contact page.",
    tam: "நான் SANSA website-ன் voice agent. SANSA பற்றி பதில் சொல்லுவேன், tools-ஐ திறந்து காட்டுவேன். மற்ற கேள்விகளுக்கு contact page-ல team-ஐ கேளுங்க.",
    next: ["What can SANSA do?", "Contact the team"],
  },
  {
    id: "features",
    kw: ["what can", "what do you do", "what is sansa", "about sansa", "features", "services", "products", "tools", "help me", "sansa enna", "enna panna mudiyum", "what does sansa"],
    ta: ["என்ன செய்ய", "என்ன பண்ண", "சான்சா என்ன", "சேவை", "என்னென்ன"],
    en: "SANSA turns speech into text in Tamil, English and fifteen more languages, reads text aloud with four natural voices, and removes background noise from recordings. All free on this website. Voice cloning, dubbing and the API are coming soon.",
    tam: "SANSA பேச்சை எழுத்தா மாற்றும், நான்கு voices-ல text-ஐ படிச்சு காட்டும், recording-ல background noise-ஐ நீக்கும். எல்லாமே இந்த website-ல இலவசம். Voice cloning, dubbing, API விரைவில் வருது.",
    next: ["Start voice to text", "Play Kavya", "Clean up audio"],
  },
  {
    id: "free",
    kw: ["free", "price", "pricing", "cost", "costs", "how much", "charge", "charges", "pay", "payment", "plan", "plans", "subscription", "paid", "evlo", "evalavu", "kaasu", "panam", "rupees", "money"],
    ta: ["இலவச", "விலை", "காசு", "பணம்", "கட்டணம்", "எவ்வளவு", "ரூபாய்"],
    en: "Everything on this website is free to use: speech to text, voices, downloads and audio cleanup. For plans and business use, sign up or ask the team on the contact page.",
    tam: "இந்த website-ல எல்லாமே இலவசம்: speech to text, voices, download, audio cleanup. Plans, business use பற்றி sign up பண்ணுங்க அல்லது contact page-ல கேளுங்க.",
    next: ["Start voice to text", "Contact the team"],
  },
  {
    id: "dictate",
    kw: ["start", "begin", "dictate", "dictation", "voice to text", "speech to text", "transcribe", "transcription", "type what i say", "convert my voice", "start pannu", "aarambi", "open voice to text", "try it"],
    ta: ["ஆரம்பி", "தொடங்கு", "எழுத்தா மாத்து", "எழுத்தாக மாற்று", "பேச்சை எழுத்து"],
    en: "Speech to text works in Tamil, Tanglish, English and fifteen more Indian languages. You can use the live mic, record, or upload audio and video.",
    tam: "Speech to text Tamil, Tanglish, English மற்றும் பதினைந்து இந்திய மொழிகள்ல வேலை செய்யும். Live mic, recording, upload எல்லாம் பண்ணலாம்.",
    action: { type: "dictate" },
    actionOnDo: true,
    next: ["Which files can I upload?", "Make subtitles"],
  },
  {
    id: "languages",
    kw: ["language", "languages", "hindi", "telugu", "kannada", "malayalam", "bengali", "marathi", "gujarati", "punjabi", "urdu", "odia", "tanglish", "which languages", "support tamil", "tamil support", "english support", "mozhi"],
    ta: ["மொழி", "ஹிந்தி", "தெலுங்கு", "மலையாளம்", "கன்னடம்"],
    en: "Speech to text supports Tamil, Tanglish, English, Hindi, Telugu, Kannada, Malayalam, Bengali, Marathi, Gujarati, Punjabi, Urdu and more. Text to speech has Tamil and English voices.",
    tam: "Speech to text தமிழ், Tanglish, English, ஹிந்தி, தெலுங்கு, கன்னடம், மலையாளம் உட்பட பல மொழிகள்ல வேலை செய்யும். Text to speech-க்கு தமிழ், English voices இருக்கு.",
    next: ["How accurate is Tamil?", "Play Kavya"],
  },
  {
    id: "accuracy",
    kw: ["accurate", "accuracy", "correct", "mistake", "mistakes", "wrong", "errors", "quality", "good", "better than google", "sariya", "correct ah"],
    ta: ["துல்லிய", "தப்பு", "சரியா", "தவறு"],
    en: "Tamil runs on SANSA's own Tamil speech engine. Speak clearly with little background noise for the best result. Clean mode removes umm, and My words teaches it names it should spell right.",
    tam: "தமிழுக்கு SANSA-வின் சொந்த Tamil engine. சத்தம் குறைவா, தெளிவா பேசினா நல்ல result வரும். Clean mode umm-ஐ நீக்கும், My words பெயர்களை சரியா எழுத கத்துக்கொடுக்கும்.",
    next: ["Clean up audio", "Start voice to text"],
  },
  {
    id: "upload",
    kw: ["upload", "file", "files", "mp3", "m4a", "wav", "ogg", "opus", "amr", "format", "formats", "file size", "how big", "mb", "recording", "recordings"],
    ta: ["கோப்பு", "பைல்", "ஃபைல்", "அப்லோட்"],
    en: "You can upload mp3, m4a, wav, ogg, opus, WhatsApp voice notes and call recordings up to 25 megabytes, and videos up to 300 megabytes for subtitles.",
    tam: "mp3, m4a, wav, ogg, opus, WhatsApp voice notes, call recordings 25 MB வரை upload பண்ணலாம். Subtitles-க்கு video 300 MB வரை.",
    action: { type: "dictate" },
    actionOnDo: true,
    next: ["Make subtitles", "Clean up audio"],
  },
  {
    id: "whatsapp",
    kw: ["whatsapp", "voice note", "voice notes", "call recording", "phone call recording", "audio message"],
    ta: ["வாட்ஸ்அப்", "வாட்ஸ் அப்"],
    en: "Yes, upload a WhatsApp voice note or call recording in the voice to text tool and you get the text. If it's noisy, clean it first with Audio Cleanup.",
    tam: "ஆமா, WhatsApp voice note அல்லது call recording-ஐ voice to text-ல upload பண்ணா text கிடைக்கும். சத்தமா இருந்தா முதல்ல Audio Cleanup பண்ணுங்க.",
    next: ["Start voice to text", "Clean up audio"],
  },
  {
    id: "subtitles",
    kw: ["subtitle", "subtitles", "srt", "vtt", "caption", "captions", "youtube", "instagram reel", "reels", "video to text"],
    ta: ["சப்டைட்டில்", "சப் டைட்டில்"],
    en: "Upload your video in the voice to text tool, then download subtitles as srt or vtt for YouTube and Instagram.",
    tam: "Video-வை voice to text-ல upload பண்ணுங்க, அப்புறம் YouTube, Instagram-க்கு srt அல்லது vtt subtitles download பண்ணலாம்.",
    action: { type: "dictate" },
    actionOnDo: true,
  },
  {
    id: "tts",
    kw: ["text to speech", "tts", "voices", "read aloud", "speak my text", "voiceover", "voice over", "narration", "male voice", "female voice", "kural"],
    ta: ["குரல்", "வாய்ஸ்", "படிச்சு காட்டு", "படித்து காட்டு"],
    en: "Text to speech has four voices: Kavya and Arjun in Tamil, Meera and Vikram in English. Type up to 1500 characters, press Speak, and download the mp3.",
    tam: "Text to speech-ல நான்கு voices: தமிழ்ல கவ்யா, அர்ஜுன்; English-ல மீரா, விக்ரம். 1500 எழுத்துகள் வரை type பண்ணி Speak அழுத்தி mp3 download பண்ணலாம்.",
    action: { type: "goto", id: "voices" },
    actionOnDo: true,
    next: ["Play Kavya", "Play Vikram", "Read: Welcome to SANSA"],
  },
  {
    id: "slow",
    kw: ["slow", "takes time", "taking time", "loading", "late", "waiting", "why slow", "lag", "neram aaguthu"],
    ta: ["மெதுவா", "தாமதம்", "நேரம் ஆகுது"],
    en: "Our voice engine keeps one language ready at a time, so switching between Tamil and English can take about twenty seconds the first time. After that each voice takes a few seconds.",
    tam: "எங்க voice engine ஒரு நேரத்துல ஒரு மொழி மட்டும் ready-ஆ வச்சிருக்கும். அதனால தமிழ், English மாறும்போது முதல் தடவை இருபது seconds ஆகலாம். அப்புறம் சில seconds தான்.",
  },
  {
    id: "cleanup",
    kw: ["noise", "noisy", "background", "background noise", "clean", "cleanup", "clean up", "remove noise", "hiss", "fan noise", "traffic", "echo", "denoise", "audio cleanup", "satham"],
    ta: ["சத்தம்", "இரைச்சல்", "நாய்ஸ்"],
    en: "Audio Cleanup removes background noise like fans, traffic and hiss from audio or video, right in your browser. Choose Light, Normal or Strong, compare before and after, and download.",
    tam: "Audio Cleanup audio அல்லது video-ல இருக்கற fan, traffic, hiss மாதிரி background சத்தத்தை உங்க browser-லயே நீக்கும். Light, Normal, Strong தேர்ந்தெடுத்து before, after கேட்டு download பண்ணலாம்.",
    action: { type: "goto", id: "cleanup" },
    actionOnDo: true,
    next: ["Is my audio uploaded?", "Start voice to text"],
  },
  {
    id: "cloning",
    kw: ["clone", "cloning", "my own voice", "my voice", "copy my voice", "voice clone", "en voice", "enoda voice"],
    ta: ["குளோன்", "என் குரல்", "என்னோட குரல்"],
    en: "Voice cloning is coming soon. You can already record a ten second sample on this page to hear how it will work.",
    tam: "Voice cloning விரைவில் வருது. இப்போ இந்த page-ல பத்து second sample record பண்ணி பார்க்கலாம்.",
    action: { type: "goto", id: "clone" },
    actionOnDo: true,
    next: ["When will it be ready?", "Play Kavya"],
  },
  {
    id: "dubbing",
    kw: ["dub", "dubbing", "translate video", "translation", "translate"],
    ta: ["டப்பிங்", "மொழிபெயர்"],
    en: "Dubbing is coming soon. Today you can make Tamil or English subtitles from a video.",
    tam: "Dubbing விரைவில் வருது. இப்போ video-வுக்கு தமிழ் அல்லது English subtitles எடுக்கலாம்.",
    next: ["Make subtitles", "When will it be ready?"],
  },
  {
    id: "changer",
    kw: ["voice changer", "change my voice", "sound effect", "sound effects", "sfx", "music"],
    en: "Voice changer and sound effects are coming soon. Text to speech, speech to text and audio cleanup work today.",
    tam: "Voice changer, sound effects விரைவில் வருது. Text to speech, speech to text, audio cleanup இப்போவே வேலை செய்யும்.",
  },
  {
    id: "api",
    kw: ["api", "developer", "developers", "sdk", "integrate", "integration", "code", "python", "node", "key", "api key"],
    en: "The SANSA API is coming soon. To get early access, write to the team on the contact page.",
    tam: "SANSA API விரைவில் வருது. Early access வேணும்னா contact page-ல team-க்கு எழுதுங்க.",
    action: { type: "goto", id: "api" },
    actionOnDo: true,
    next: ["Contact the team"],
  },
  {
    id: "phoneagent",
    kw: ["phone agent", "call center", "call centre", "receptionist", "answer calls", "booking", "ivr", "customer support bot"],
    en: "Phone voice agents that answer calls in Tamil and English are coming soon. I'm a small preview of them on this website.",
    tam: "Tamil, English-ல phone call-க்கு பதில் சொல்லும் voice agents விரைவில் வருது. நான் அதோட சின்ன preview தான்.",
    next: ["Contact the team"],
  },
  {
    id: "when",
    kw: ["when", "eppo", "epo", "release date", "launch", "how soon", "ready"],
    ta: ["எப்போ", "எப்பொழுது", "எப்போது"],
    en: "We don't have a date to share yet. Follow us on Instagram at sansaai dot in, or ask the team on the contact page.",
    tam: "இன்னும் தேதி சொல்ல முடியல. Instagram-ல sansaai.in-ஐ follow பண்ணுங்க, அல்லது contact page-ல கேளுங்க.",
  },
  {
    id: "privacy",
    kw: ["privacy", "private", "safe", "secure", "security", "data", "saved", "save my", "store", "stored", "uploaded", "upload my audio", "keep my", "delete"],
    ta: ["தனியுரிமை", "பாதுகாப்", "சேமிக்க", "save ஆகுமா"],
    en: "Your audio isn't saved. Tamil speech and text for voices go to SANSA's own server only to process them, audio cleanup never leaves your browser, and your saved texts stay in your browser.",
    tam: "உங்க audio save ஆகாது. Tamil speech, voice text எல்லாம் process பண்ண மட்டும் SANSA server-க்கு போகும். Audio cleanup உங்க browser-ஐ விட்டு போகாது. Save பண்ணின text உங்க browser-லயே இருக்கும்.",
    next: ["Is it free?"],
  },
  {
    id: "account",
    kw: ["account", "sign up", "signup", "register", "login", "log in", "sign in", "password", "profile"],
    ta: ["கணக்கு", "லாகின்", "பதிவு"],
    en: "You don't need an account to use the tools here. To sign up or log in, use the buttons at the top of the page.",
    tam: "இந்த tools use பண்ண account தேவையில்லை. Sign up, log in பண்ண page மேல இருக்கற buttons-ஐ use பண்ணுங்க.",
    action: { type: "page", url: "https://app.sansaai.in/register" },
    actionOnDo: true,
  },
  {
    id: "contact",
    kw: ["contact", "support", "customer care", "email", "mail", "phone number", "call you", "reach", "talk to human", "talk to a person", "complaint", "feedback", "partnership", "business"],
    ta: ["தொடர்பு", "உதவி", "புகார்"],
    en: "You can reach the SANSA team on the contact page, or on Instagram at sansaai dot in. I'll open the contact page for you.",
    tam: "SANSA team-ஐ contact page-ல தொடர்பு கொள்ளலாம், அல்லது Instagram-ல sansaai.in. Contact page-ஐ திறக்கிறேன்.",
    action: { type: "page", url: "./contact" },
  },
  {
    id: "company",
    kw: ["company", "who made", "who built", "founder", "owner", "where are you", "location", "based", "india", "chennai", "tamil nadu", "made by"],
    ta: ["யார் உருவாக்க", "நிறுவனம்", "எங்க இருக்கீங்க"],
    en: "SANSA is made by SANSA AI in Tamil Nadu, India.",
    tam: "SANSA-வை உருவாக்கியது தமிழ்நாட்டில் உள்ள SANSA AI.",
  },
  {
    id: "mobile",
    kw: ["mobile", "phone", "android", "iphone", "ios", "app", "download app", "play store", "laptop", "computer", "browser", "chrome", "safari"],
    ta: ["மொபைல்", "ஃபோன்", "போன்"],
    en: "SANSA works in the browser on your phone or computer, no app to install. Chrome works best for the live mic.",
    tam: "SANSA உங்க phone அல்லது computer browser-லயே வேலை செய்யும், app install பண்ண வேண்டாம். Live mic-க்கு Chrome best.",
  },
  {
    id: "mic",
    kw: ["mic not working", "microphone", "mic", "permission", "not hearing", "can t hear me", "cant hear me", "no sound", "not working"],
    ta: ["மைக்", "வேலை செய்யல", "வேலை செய்யவில்லை"],
    en: "If the mic doesn't work, allow microphone access when the browser asks, or tap the lock icon in the address bar and turn the microphone on. Chrome works best.",
    tam: "Mic வேலை செய்யலனா browser கேட்கும்போது microphone-ஐ allow பண்ணுங்க, அல்லது address bar-ல lock icon-ஐ தொட்டு microphone-ஐ on பண்ணுங்க. Chrome best.",
  },
  {
    id: "howto",
    kw: ["how to use", "how do i use", "how does it work", "steps", "guide", "tutorial", "how to", "epdi use", "eppadi use"],
    ta: ["எப்படி பயன்படுத்த", "எப்படி use", "எப்படி வேலை"],
    en: "Choose your language, then speak with the live mic, record, or upload a file. Your words appear as text, and you can copy them or download text and subtitles.",
    tam: "மொழியை தேர்ந்தெடுங்க, அப்புறம் live mic-ல பேசுங்க, record பண்ணுங்க, அல்லது file upload பண்ணுங்க. Text வந்ததும் copy பண்ணலாம் அல்லது text, subtitles download பண்ணலாம்.",
    next: ["Start voice to text"],
  },
  {
    id: "library",
    kw: ["library", "history", "my texts", "where saved", "old text", "previous", "my words", "clean mode"],
    en: "Every conversion is saved in My library, only in your own browser. Clean mode removes umm and fillers, and My words lets you add names it should spell right.",
    tam: "ஒவ்வொரு conversion-உம் உங்க browser-ல My library-ல save ஆகும். Clean mode umm-ஐ நீக்கும், My words-ல பெயர்களை சேர்த்தா சரியா எழுதும்.",
    action: { type: "dictate" },
    actionOnDo: true,
  },
  {
    id: "legal",
    kw: ["refund", "terms", "terms of use", "policy", "cancel", "cancellation"],
    en: "You can read our terms, privacy and refund policy from the links at the bottom of the page.",
    tam: "எங்க terms, privacy, refund policy page கீழே இருக்கற links-ல படிக்கலாம்.",
  },
  {
    id: "jobs",
    kw: ["job", "jobs", "career", "careers", "hiring", "work with you", "internship", "vacancy"],
    ta: ["வேலை வாய்ப்பு"],
    en: "For jobs or internships, write to the team on the contact page.",
    tam: "Job அல்லது internship-க்கு contact page-ல team-க்கு எழுதுங்க.",
    action: { type: "page", url: "./contact" },
    actionOnDo: true,
  },
];

const DO_WORDS = /\b(open|start|show|go to|take me|try|begin|launch|use|pannu|kaattu|kaatu|thira|podu)\b|திற|காட்டு|ஆரம்பி|தொடங்கு|போ/;

const FALLBACK: Record<Lang, string> = {
  en: "I'm not sure about that one. I can help with speech to text, our voices, audio cleanup and how SANSA works. For anything else, the team is on the contact page.",
  ta: "அது பற்றி எனக்கு சரியா தெரியல. Speech to text, voices, audio cleanup, SANSA எப்படி வேலை செய்யும்-னு சொல்லுவேன். மற்ற கேள்விகளுக்கு contact page-ல team-ஐ கேளுங்க.",
};
const FALLBACK_NEXT = ["What can SANSA do?", "Is it free?", "Contact the team"];

function score(intent: Intent, n: string, raw: string): number {
  let s = 0;
  for (const k of intent.kw) if (n.includes(` ${k} `)) s += k.includes(" ") ? 3 : 1.5;
  for (const t of intent.ta ?? []) if (raw.includes(t)) s += 2.5;
  return s;
}

let lastIntent = "";

/** Answer one message. Keeps a little context (the previous topic) for follow-ups like "when?". */
export function think(text: string): Reply {
  const raw = text.trim();
  const lang = detectLang(raw);
  const n = norm(raw);
  const pick = (t: Record<Lang, string>) => (lang === "ta" ? t.ta : t.en);

  // read aloud: "say ...", "read: ...", "speak ..."
  const say = raw.match(/^(?:please\s+)?(?:say|read(?: out| aloud)?|speak|pronounce)\s*[:\-]?\s+(.{2,})$/i) ?? raw.match(/^(?:இதை\s+)?(?:படி|சொல்லு)\s*[:\-]\s*(.{2,})$/);
  if (say) {
    lastIntent = "say";
    return { intent: "say", lang, text: say[1].trim(), action: { type: "say", text: say[1].trim() }, suggestions: ["Play Kavya", "What can SANSA do?"] };
  }

  // play a voice: "play kavya", "kavya voice", "கவ்யா"
  for (const [name, id] of Object.entries(VOICE_NAMES)) {
    if (n.includes(` ${name} `) || raw.includes(name)) {
      lastIntent = "play";
      const v = id[0].toUpperCase() + id.slice(1);
      return {
        intent: "play",
        lang,
        text: lang === "ta" ? `இதோ ${v}-வின் குரல்.` : `Here's ${v}.`,
        action: { type: "play", voice: id },
        suggestions: ["Play Arjun", "Play Meera", "Read: Welcome to SANSA"],
      };
    }
  }

  // theme
  if (/\b(dark|black|night) (mode|theme)\b|\b(light|white|day) (mode|theme)\b|\b(dark|light) mode\b|\bswitch theme\b/.test(n)) {
    lastIntent = "theme";
    return { intent: "theme", lang, text: pick({ en: "Done, I've switched the theme.", ta: "சரி, theme-ஐ மாத்திட்டேன்." }), action: { type: "theme" }, suggestions: [] };
  }

  // "when?" right after a coming-soon topic
  const soon = ["cloning", "dubbing", "changer", "api", "phoneagent"];
  let best: Intent | null = null;
  let top = 0;
  for (const it of INTENTS) {
    const s = score(it, n, raw);
    if (s > top) {
      top = s;
      best = it;
    }
  }
  if (best?.id === "when" && !soon.includes(lastIntent) && top < 3) best = null; // a bare "when" without context isn't enough
  // "start" alone is a strong action word; "voice" alone shouldn't beat a clearer topic
  if (!best || top < 1.5) {
    lastIntent = "";
    return { intent: "fallback", lang, text: FALLBACK[lang], suggestions: FALLBACK_NEXT };
  }
  lastIntent = best.id;
  const wantsAction = !best.actionOnDo || DO_WORDS.test(n) || DO_WORDS.test(raw);
  const action = best.action && wantsAction ? best.action : undefined;
  let reply = lang === "ta" ? best.tam : best.en;
  if (best.id === "dictate" && action) reply = lang === "ta" ? "சரி, voice to text-ஐ திறக்கிறேன். Mic-ஐ தொட்டு பேசுங்க." : "Sure, opening voice to text. Tap the mic and speak.";
  return { intent: best.id, lang, text: reply, action, suggestions: best.next ?? [] };
}

/** For tests: forget the previous topic. */
export function resetContext() {
  lastIntent = "";
}
