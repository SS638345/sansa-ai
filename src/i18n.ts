/**
 * Site language (English / தமிழ்) for the interface text, separate from the speech language.
 * Usage: App calls useUi() once so the whole page re-renders on a switch; anywhere below,
 * t("English", "தமிழ்") picks the text for the current choice.
 */
import { useSyncExternalStore } from "react";

export type Ui = "en" | "ta";

function initial(): Ui {
  try {
    const v = localStorage.getItem("vtt.ui");
    if (v === "en" || v === "ta") return v;
  } catch {
    /* storage blocked */
  }
  return typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("ta") ? "ta" : "en";
}

let cur: Ui = initial();
const subs = new Set<() => void>();
if (typeof document !== "undefined") document.documentElement.lang = cur;

export const getUi = () => cur;

export function setUi(l: Ui) {
  cur = l;
  try {
    localStorage.setItem("vtt.ui", l);
  } catch {
    /* storage blocked */
  }
  document.documentElement.lang = l;
  subs.forEach((f) => f());
}

export function useUi(): Ui {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    getUi,
    getUi,
  );
}

/** Text for the current site language. */
export const t = (en: string, ta: string) => (cur === "ta" ? ta : en);

/* ------------------------------------------------------------------ Tamil text for the interface.
 * Keys are the exact English text on the page; anything missing stays in English. */
const TA: Record<string, string> = {
  // header / menu
  Products: "சேவைகள்",
  "Text to Speech": "எழுத்து → குரல்",
  "Speech to Text": "குரல் → எழுத்து",
  Voices: "குரல்கள்",
  API: "API",
  Search: "தேடு",
  "Log in": "உள்நுழை",
  "Sign up": "பதிவு செய்",
  "Sign in with Google": "Google-ல் உள்நுழை",
  FAQ: "கேள்விகள்",
  "Switch light / dark": "வெளிச்சம் / இருள் மாற்று",
  "Open menu": "மெனு திற",
  "Close menu": "மெனு மூடு",
  // hero
  "AI Voice Platform": "தமிழ் AI குரல் தளம்",
  "Lifelike AI voices in English and Tamil.": "தமிழிலும் ஆங்கிலத்திலும் இயல்பான AI குரல்கள்.",
  "Text to speech, speech to text, voice cloning and dubbing — in one studio and one API.":
    "எழுத்தை குரலாக்கு, பேச்சை எழுத்தாக்கு, சத்தம் நீக்கு. இலவசம்.",
  "Talk live": "நேரடியாக பேசு",
  "▶ Speak": "▶ கேள்",
  "■ Stop": "■ நிறுத்து",
  "… Creating": "… உருவாகிறது",
  "⬇ Download mp3": "⬇ mp3 பதிவிறக்கு",
  "Text to hear": "கேட்க வேண்டிய எழுத்து",
  "Type anything to hear it": "எதையாவது type செய்து கேளுங்கள்",
  Language: "மொழி",
  Voice: "குரல்",
  "Voice language": "குரல் மொழி",
  "Welcome to SANSA. Type anything here and hear it come alive.": "SANSA-வுக்கு வரவேற்கிறோம். இங்கே எதையாவது type செய்து கேளுங்கள்.",
  // products
  "Everything you need to create with voice.": "குரலுக்கு தேவையான எல்லாம், ஒரே இடத்தில்.",
  "Coming soon": "விரைவில்",
  Live: "இப்போது",
  "Natural voiceovers from any script.": "எந்த script-ஐயும் இயல்பான குரலாக்கும்.",
  "Accurate transcripts and subtitles.": "துல்லியமான எழுத்தும் subtitles-உம்.",
  "Your own voice from a short sample.": "சின்ன மாதிரியிலிருந்து உங்கள் சொந்த குரல்.",
  Dubbing: "டப்பிங்",
  "Translate video and keep every voice.": "வீடியோவை மொழிபெயர்த்து அதே குரலில்.",
  "Voice Changer": "குரல் மாற்றி",
  "Turn one recording into any voice.": "ஒரு பதிவை வேறு குரலாக மாற்றும்.",
  "Same words in a SANSA voice or your own voice.": "அதே வார்த்தைகள், SANSA குரலில் அல்லது உங்கள் சொந்த குரலில்.",
  "Sound Effects": "ஒலி விளைவுகள்",
  "Generate sound from a text prompt.": "எழுத்திலிருந்து ஒலி உருவாக்கும்.",
  "Assistants for calls and support.": "அழைப்புகளுக்கும் உதவிக்கும் உதவியாளர்கள்.",
  "Ask SANSA about our tools, by voice. Phone agents soon.": "எங்கள் கருவிகள் பற்றி குரலில் SANSA-விடம் கேளுங்கள். Phone agents விரைவில்.",
  "Remove noise and isolate clear speech.": "சத்தம் நீக்கி தெளிவான பேச்சை தரும்.",
  "Voice Library": "குரல் நூலகம்",
  "Audio Cleanup": "சத்தம் நீக்கல்",
  "Voice Cloning": "குரல் நகல்",
  "Voice Agents": "குரல் உதவியாளர்",
  // how it works
  "How it works": "எப்படி வேலை செய்கிறது",
  "From script to sound in four steps.": "நான்கு படிகளில் எழுத்திலிருந்து குரல்.",
  Write: "எழுது",
  "Type or paste your script in English or Tamil.": "தமிழிலோ ஆங்கிலத்திலோ உங்கள் script-ஐ type அல்லது paste செய்யுங்கள்.",
  "Choose a voice": "குரலை தேர்ந்தெடு",
  "Pick from the library or use your own cloned voice.": "நூலகத்திலிருந்து ஒரு குரலை தேர்ந்தெடுங்கள்.",
  Adjust: "சரிசெய்",
  "Set pitch, pace and emotion until it sounds right.": "சரியாக ஒலிக்கும் வரை வேகத்தை மாற்றுங்கள்.",
  Publish: "பதிவிறக்கு",
  "Download the audio or stream it through the API.": "குரலை mp3-ஆக பதிவிறக்குங்கள்.",
  // voices
  "Voice library": "குரல் நூலகம்",
  "Hear our voices.": "எங்கள் குரல்களை கேளுங்கள்.",
  "Browse all voices →": "எல்லா குரல்களும் →",
  All: "எல்லாம்",
  Tamil: "தமிழ்",
  English: "ஆங்கிலம்",
  "Tamil · Female": "தமிழ் · பெண்",
  "Tamil · Male": "தமிழ் · ஆண்",
  "English · Female": "ஆங்கிலம் · பெண்",
  "English · Male": "ஆங்கிலம் · ஆண்",
  // cleanup
  "Audio cleanup": "சத்தம் நீக்கல்",
  "Clean up any recording.": "எந்த பதிவையும் சுத்தமாக்குங்கள்.",
  "Remove fan, traffic and crowd noise from voice notes, call recordings and videos. It runs in your browser, so your audio is never uploaded.":
    "Voice note, call recording, வீடியோவிலிருந்து fan, traffic, கூட்ட சத்தத்தை நீக்குங்கள். இது உங்கள் browser-லேயே நடக்கும், audio upload ஆகாது.",
  "mp3, m4a, wav, ogg, opus, WhatsApp voice notes, mp4 and more": "mp3, m4a, wav, ogg, opus, WhatsApp voice notes, mp4 மற்றும் பல",
  "Up to 20 minutes at a time": "ஒரு முறைக்கு 20 நிமிடம் வரை",
  "Listen before and after, then download": "முன்பும் பின்பும் கேட்டு, பிறகு பதிவிறக்குங்கள்",
  "Drop an audio or video file here": "Audio அல்லது video file-ஐ இங்கே போடுங்கள்",
  "Make voice louder": "குரலை சத்தமாக்கு",
  Before: "முன்பு",
  After: "பின்பு",
  "⬇ Download clean audio (WAV)": "⬇ சுத்தமான audio பதிவிறக்கு (WAV)",
  "For videos you get the cleaned sound as a WAV file.": "வீடியோவுக்கு, சுத்தமான ஒலி WAV file-ஆக கிடைக்கும்.",
  "Cleanup strength": "நீக்கும் அளவு",
  light: "குறைவு",
  normal: "சாதாரணம்",
  strong: "அதிகம்",
  // voice cloning (live 2026-11-08): server messages and FAQ
  "Tick the box, read a short Tamil passage aloud (about 20 seconds) and we check the words, so only your own voice can be used. Then type up to 300 characters in Tamil or English and get an MP3 in your voice. Your voice print stays only in your browser.":
    "Box-ஐ tick செய்து, ஒரு சிறிய தமிழ் பத்தியை (சுமார் 20 வினாடி) சத்தமாக படியுங்கள். வார்த்தைகளை சரிபார்ப்பதால் உங்கள் சொந்த குரல் மட்டுமே பயன்படும். பிறகு தமிழ் அல்லது ஆங்கிலத்தில் 300 எழுத்துகள் வரை type செய்தால் உங்கள் குரலில் MP3 கிடைக்கும். உங்கள் குரல் அடையாளம் உங்கள் browser-ல் மட்டும் இருக்கும்.",
  "Your own voice from a 20-second reading.": "20 வினாடி வாசிப்பில் உங்கள் சொந்த குரல்.",
  "Please confirm that this is your own voice.": "இது உங்கள் சொந்த குரல் என்று உறுதி செய்யுங்கள்.",
  "The recording is too large. Please keep it under 30 seconds.": "பதிவு மிகப் பெரியது. 30 வினாடிக்குள் வையுங்கள்.",
  "The recording is too long. Please keep it under 30 seconds.": "பதிவு மிக நீளம். 30 வினாடிக்குள் வையுங்கள்.",
  "This reading check is not valid. Get a new passage and try again.": "இந்த சோதனை செல்லாது. புதிய பத்தி எடுத்து மீண்டும் முயலுங்கள்.",
  "The passage expired (10 minutes). Get a new passage and read it again.": "பத்தியின் நேரம் முடிந்தது (10 நிமிடம்). புதிய பத்தி எடுத்து மீண்டும் படியுங்கள்.",
  "Your saved voice is not valid. Please record your voice again.": "சேமித்த குரல் செல்லாது. உங்கள் குரலை மீண்டும் பதிவு செய்யுங்கள்.",
  "Could not read the recording. Please record again.": "பதிவை படிக்க முடியவில்லை. மீண்டும் பதிவு செய்யுங்கள்.",
  "We could not hear you. Move closer to the microphone and record again.": "உங்கள் குரல் கேட்கவில்லை. மைக் அருகில் வந்து மீண்டும் பதிவு செய்யுங்கள்.",
  "The recording is too loud (distorted). Move a little away from the microphone and record again.": "பதிவு மிக சத்தமாக (உடைந்து) உள்ளது. மைக்கிலிருந்து சற்று விலகி மீண்டும் பதிவு செய்யுங்கள்.",
  "Please read the whole passage. We need at least 8 seconds of your voice.": "முழு பத்தியையும் படியுங்கள். குறைந்தது 8 வினாடி உங்கள் குரல் தேவை.",
  "The reading check is busy right now. Please try again in a minute.": "சரிபார்ப்பு இப்போது பிஸி. ஒரு நிமிடம் கழித்து முயலுங்கள்.",
  "The words did not match the passage. Read the passage shown on the page, clearly, and try again.": "வார்த்தைகள் பத்தியுடன் பொருந்தவில்லை. பக்கத்தில் காட்டிய பத்தியை தெளிவாக படித்து மீண்டும் முயலுங்கள்.",
  "Text is too long. Send 300 characters or less at a time.": "Text மிக நீளம். ஒரு முறைக்கு 300 எழுத்துகள் அல்லது குறைவாக அனுப்புங்கள்.",
  "Working…": "வேலை நடக்கிறது…",
  "Stop & convert": "நிறுத்தி மாற்று",
  Record: "பதிவு",
  // clone
  "Voice cloning": "குரல் நகல்",
  "Clone your voice in seconds.": "உங்கள் குரலின் நகல் (விரைவில்).",
  "Read the line out loud. SANSA captures a short sample and turns it into a voice you can use anywhere.":
    "இந்த வரியை சத்தமாக படியுங்கள். இப்போது பதிவு செய்து கேட்கலாம். உங்கள் குரலில் பேசும் வசதி விரைவில் வரும்.",
  "Read aloud": "சத்தமாக படியுங்கள்",
  "“Hi, this is my voice. I’m creating my own AI voice with SANSA.”": "“வணக்கம், இது என் குரல். SANSA-வில் என் சொந்த AI குரலை உருவாக்குகிறேன்.”",
  "Preview only. Your recording stays in this browser.": "முன்னோட்டம் மட்டும். உங்கள் பதிவு இந்த browser-லேயே இருக்கும்.",
  // agents
  "Voice agents": "குரல் உதவியாளர்",
  "Agents that answer the phone for you.": "உங்களுக்காக பதில் சொல்லும் உதவியாளர்.",
  "Voice assistants that take bookings, answer questions and switch between English and Tamil mid-call.":
    "SANSA பற்றி தமிழிலோ ஆங்கிலத்திலோ கேளுங்கள். Phone அழைப்பு உதவியாளர் விரைவில் வரும்.",
  "Try the live agent": "உதவியாளரிடம் பேசு",
  "Live call · Clinic booking": "மாதிரி அழைப்பு · Clinic booking",
  // developers
  Developers: "டெவலப்பர்கள்",
  "Add voice to your app in minutes.": "உங்கள் app-இல் குரல் (விரைவில்).",
  "One API for speech generation, transcription, dubbing and voice agents, with SDKs for Python and Node.":
    "Developer API விரைவில் வரும். முன்கூட்டியே அணுக Contact பக்கத்தில் கேளுங்கள்.",
  "Get an API key": "முன்கூட்டியே அணுக கேளுங்கள்",
  SDKs: "SDKs",
  // faq / cta / footer
  "Frequently asked questions": "அடிக்கடி கேட்கப்படும் கேள்விகள்",
  "Give your words a voice.": "உங்கள் வார்த்தைகளுக்கு குரல் கொடுங்கள்.",
  "Start free": "இலவசமாக தொடங்கு",
  "AI voices for English and Tamil.": "தமிழ், ஆங்கில AI குரல்கள்.",
  Support: "உதவி",
  Company: "நிறுவனம்",
  "Help Centre": "உதவி மையம்",
  About: "எங்களை பற்றி",
  Careers: "வேலைவாய்ப்பு",
  Privacy: "தனியுரிமை",
  "Terms of Use": "பயன்பாட்டு விதிகள்",
  Refund: "பணம் திரும்ப",
  // agent overlay / palette
  "SANSA voice agent": "SANSA குரல் உதவியாளர்",
  "Close agent": "உதவியாளரை மூடு",
  "Ask about SANSA, or tap the mic and speak": "SANSA பற்றி கேளுங்கள், அல்லது mic-ஐ தொட்டு பேசுங்கள்",
  Message: "செய்தி",
  "Agent language": "உதவியாளர் மொழி",
  Send: "அனுப்பு",
  "What can SANSA do?": "SANSA என்ன செய்யும்?",
  "Is it free?": "இது இலவசமா?",
  "Start voice to text": "குரல் → எழுத்து தொடங்கு",
  "Search pages, voices and actions": "பக்கங்கள், குரல்கள், செயல்களை தேடு",
  "No results": "எதுவும் கிடைக்கவில்லை",
  // the voice to text tool
  "Voice to text": "குரல் → எழுத்து",
  "Try it now.": "இப்போதே முயற்சிக்கவும்.",
  "Live mic": "நேரடி mic",
  free: "இலவசம்",
  "Record & convert": "பதிவு செய்து மாற்று",
  "Upload audio": "ஆடியோ upload",
  "This browser has no live speech engine. Open in Chrome, or use Record & convert.":
    "இந்த browser-இல் நேரடி பேச்சு வசதி இல்லை. Chrome-இல் திறங்கள், அல்லது ‘பதிவு செய்து மாற்று’ பயன்படுத்துங்கள்.",
  "Record first, then the whole clip is converted. More accurate for long talks.":
    "முதலில் பதிவு செய்யுங்கள், பிறகு முழுதும் எழுத்தாகும். நீண்ட பேச்சுக்கு அதிக துல்லியம்.",
  "Any audio: mp3, m4a, wav, ogg, opus, amr, aac, flac, wma, 3gp, WhatsApp voice notes, call recordings (max 25 MB), or mp4/webm video for subtitles (max 300 MB). First time, the speech model downloads once.":
    "எந்த audio-வும்: mp3, m4a, wav, ogg, opus, amr, aac, WhatsApp voice notes, call recordings (25 MB வரை), அல்லது subtitles-க்கு mp4/webm video (300 MB வரை).",
  "Speech engine": "பேச்சு engine",
  "SANSA engine": "SANSA engine",
  "free, accurate": "இலவசம், துல்லியம்",
  "On-device": "இந்த device-இல்",
  "free, offline": "இலவசம், offline",
  "This language works only with Live mic. Upload and record are not available for it yet.":
    "இந்த மொழி நேரடி mic-இல் மட்டும் வேலை செய்யும். Upload, பதிவு இன்னும் இல்லை.",
  "Speech model (runs free on your device, downloads once)": "பேச்சு model (உங்கள் device-இல் இலவசமாக, ஒருமுறை பதிவிறங்கும்)",
  "Write the text as": "எழுத்தை இப்படி எழுது",
  "As spoken": "பேசியபடி",
  "same language": "அதே மொழி",
  translate: "மொழிபெயர்",
  Tanglish: "Tanglish",
  "English letters": "ஆங்கில எழுத்தில்",
  Mixed: "கலவை",
  "Tamil + English words": "தமிழ் + ஆங்கில சொற்கள்",
  "Clean background noise": "பின்னணி சத்தம் நீக்கு",
  "fan, traffic, crowd. Free, on this device": "fan, traffic, கூட்டம். இலவசம், இந்த device-இல்",
  "Clean mode": "சுத்தமான எழுத்து",
  "removes umm, uh, ம்ம் and tidies punctuation": "umm, uh, ம்ம் நீக்கி, புள்ளி குறிகளை சரிசெய்யும்",
  "Names and words SANSA should spell right, one per line. Write": "SANSA சரியாக எழுத வேண்டிய பெயர்கள், சொற்கள் — ஒரு வரிக்கு ஒன்று. எழுதுங்கள்",
  "to fix a common mistake.": "என்று, அடிக்கடி வரும் தவறை சரிசெய்ய.",
  Text: "எழுத்து",
  "Your text will appear here. You can edit it too.": "உங்கள் எழுத்து இங்கே வரும். நீங்கள் திருத்தவும் செய்யலாம்.",
  Copy: "நகலெடு",
  "Copied ✓": "நகலெடுத்தது ✓",
  "Download .txt": ".txt பதிவிறக்கு",
  "🔊 Read aloud": "🔊 படித்து காட்டு",
  "■ Stop reading": "■ படிப்பதை நிறுத்து",
  "Reading speed": "படிக்கும் வேகம்",
  Slow: "மெதுவாக",
  Normal: "சாதாரணம்",
  Fast: "வேகமாக",
  "Subtitles .srt": "சப்டைட்டில் .srt",
  "Text with times": "நேரத்துடன் எழுத்து",
  "Subtitles for YouTube, Instagram, video editors": "YouTube, Instagram, video editors-க்கு subtitles",
  "Subtitles for web video": "Web video-க்கு subtitles",
  "Text with a time before each line": "ஒவ்வொரு வரிக்கும் முன் நேரத்துடன்",
  Clear: "அழி",
  "No speech found in this audio.": "இந்த audio-வில் பேச்சு இல்லை.",
  "Could not open the microphone. Allow mic access and try again.": "Mic-ஐ திறக்க முடியவில்லை. Mic அனுமதி கொடுத்து மீண்டும் முயற்சிக்கவும்.",
  "Copy failed. Select the text and copy manually.": "நகலெடுக்க முடியவில்லை. எழுத்தை தேர்ந்தெடுத்து நீங்களே நகலெடுங்கள்.",
  "Could not open the shared file. Use Upload audio instead.": "பகிர்ந்த file-ஐ திறக்க முடியவில்லை. ‘ஆடியோ upload’ பயன்படுத்துங்கள்.",
  // library / timeline
  "My library": "என் நூலகம்",
  "Upload or record something and it will be kept here, only in this browser.": "Upload அல்லது பதிவு செய்தவை இங்கே, இந்த browser-இல் மட்டும் சேமிக்கப்படும்.",
  "Search your transcripts": "உங்கள் எழுத்துகளில் தேடு",
  Rename: "பெயர் மாற்று",
  Delete: "நீக்கு",
  Timeline: "நேரவரிசை",
  "Audio is not loaded. Open this from My library to play it again; subtitles still download.":
    "Audio ஏற்றப்படவில்லை. மீண்டும் கேட்க ‘என் நூலகம்’-இல் திறங்கள்; subtitles பதிவிறக்கலாம்.",
  check: "சரிபார்",
  // languages list
  "English (India)": "ஆங்கிலம் (இந்தியா)",
  "English (US)": "ஆங்கிலம் (US)",
  "Mixed / auto detect (upload/record)": "கலவை / தானாக கண்டறி (upload/பதிவு)",
  // honest copy (2026-11-08) + FAQ
  "Text to speech, speech to text and noise cleanup in Tamil and English. Free, sign in with Google.":
    "எழுத்தை குரலாக்கு, பேச்சை எழுத்தாக்கு, சத்தம் நீக்கு — தமிழிலும் ஆங்கிலத்திலும். இலவசம், Google-ல் உள்நுழைந்தால் போதும்.",
  "Pick a Tamil or English voice from the library.": "நூலகத்திலிருந்து தமிழ் அல்லது ஆங்கில குரலை தேர்ந்தெடுங்கள்.",
  "Listen, change the words, and play again until it sounds right.": "கேட்டு, வார்த்தைகளை மாற்றி, சரியாக ஒலிக்கும் வரை மீண்டும் கேளுங்கள்.",
  "Download the audio as an mp3.": "குரலை mp3-ஆக பதிவிறக்குங்கள்.",
  "Your own voice, coming soon.": "உங்கள் சொந்த குரல் — விரைவில்.",
  "Read the line out loud to record a short sample and hear it back. Speaking in your own voice is coming soon.":
    "இந்த வரியை சத்தமாக படித்து பதிவு செய்து கேளுங்கள். உங்கள் குரலிலேயே பேசும் வசதி விரைவில் வரும்.",
  "Ask SANSA anything, by voice.": "SANSA-விடம் குரலிலேயே கேளுங்கள்.",
  "Talk to the SANSA agent in Tamil or English about our tools. Phone call agents are coming soon.":
    "SANSA உதவியாளரிடம் தமிழிலோ ஆங்கிலத்திலோ பேசுங்கள். Phone அழைப்பு உதவியாளர் விரைவில் வரும்.",
  "A developer API is coming soon.": "Developer API விரைவில் வரும்.",
  "Speech to text and text to speech for your own app. Ask for early access on the contact page.":
    "உங்கள் app-க்கு குரல் → எழுத்து, எழுத்து → குரல். முன்கூட்டியே அணுக Contact பக்கத்தில் கேளுங்கள்.",
  "Ask for early access": "முன்கூட்டியே அணுக கேளுங்கள்",
  "Which languages are supported?": "எந்த மொழிகள் உள்ளன?",
  "Voice to text works in Tamil, English and 15+ Indian languages. The AI voices speak Tamil and English.":
    "குரல் → எழுத்து தமிழ், ஆங்கிலம் மற்றும் 15+ இந்திய மொழிகளில் வேலை செய்யும். AI குரல்கள் தமிழும் ஆங்கிலமும் பேசும்.",
  "Is my audio saved?": "என் audio சேமிக்கப்படுமா?",
  "No. Audio is converted on our own server in India or on your device, and is not saved. Your texts stay only in your browser.":
    "இல்லை. Audio இந்தியாவில் உள்ள எங்கள் server-இல் அல்லது உங்கள் device-இல் மாற்றப்படும், சேமிக்கப்படாது. உங்கள் எழுத்துகள் உங்கள் browser-இல் மட்டும் இருக்கும்.",
  "How does voice cloning work?": "குரல் நகல் எப்படி வேலை செய்யும்?",
  "Voice cloning is coming soon. Today you can record a short sample on this page and play it back.":
    "குரல் நகல் விரைவில் வரும். இப்போது இந்த பக்கத்தில் சின்ன மாதிரியை பதிவு செய்து கேட்கலாம்.",
  "Yes. Every tool on this site is free. You only sign in with your Google account.": "ஆம். இந்த தளத்தில் உள்ள எல்லா கருவிகளும் இலவசம். உங்கள் Google account-ல் உள்நுழைந்தால் போதும்.",
  "How do I convert a WhatsApp voice note?": "WhatsApp voice note-ஐ எப்படி எழுத்தாக்குவது?",
  "Upload the voice note, or on Android add this site to your home screen and use Share > Sansa Voice from WhatsApp.":
    "Voice note-ஐ upload செய்யுங்கள். Android-இல் இந்த தளத்தை home screen-இல் சேர்த்து, WhatsApp-இல் Share > Sansa Voice தேர்ந்தெடுங்கள்.",
  "⚠ {n} line(s) may have mistakes. They are marked yellow in the Timeline below. Tap one to hear it, then fix the text above.":
    "⚠ {n} வரிகளில் தவறு இருக்கலாம். கீழே நேரவரிசையில் மஞ்சளாக காட்டப்பட்டுள்ளன. அதை தொட்டு கேட்டு, மேலே உள்ள எழுத்தை சரி செய்யுங்கள்.",
  "Site language": "தள மொழி",
  "Tamil engine on": "தமிழ் engine இயங்குகிறது",
  "AI on": "AI இயங்குகிறது",
  "Free mode": "இலவச நிலை",
  "● Start speaking": "● பேச தொடங்கு",
  "Listening… text appears as you speak.": "கேட்கிறது… நீங்கள் பேசும்போதே எழுத்து வரும்.",
  "Words appear live while you talk. Works best in Chrome.": "நீங்கள் பேசும்போதே சொற்கள் வரும். Chrome-இல் சிறப்பாக வேலை செய்யும்.",
  "My words": "என் சொற்கள்",
  "words": "சொற்கள்",
  "every conversion is saved here": "ஒவ்வொரு மாற்றமும் இங்கே சேமிக்கப்படும்",
  "{n} saved on this device": "இந்த device-இல் {n} சேமிப்பு",
  "Your saved texts stay only in your own browser.": "சேமித்த எழுத்துகள் உங்கள் browser-இல் மட்டும் இருக்கும்.",
  " Tamil audio is sent to our own server only to convert it, and is not saved.": " தமிழ் audio மாற்றுவதற்காக மட்டும் எங்கள் server-க்கு போகும், சேமிக்கப்படாது.",
  "Choose another": "வேறு file",
  "Choose file": "File தேர்ந்தெடு",
  "Light": "குறைவு",
  "Strong": "அதிகம்",
  "Light keeps some room sound and removes most hiss.": "குறைவு: அறை ஒலியை கொஞ்சம் வைத்து, பெரும்பாலான இரைச்சலை நீக்கும்.",
  "Normal removes most background noise. Best for most recordings.": "சாதாரணம்: பெரும்பாலான பின்னணி சத்தத்தை நீக்கும். பெரும்பாலான பதிவுகளுக்கு சிறந்தது.",
  "Strong also quietens the gaps between words. Best for very noisy places.": "அதிகம்: சொற்களுக்கு இடையிலான இடைவெளியையும் அமைதியாக்கும். மிக சத்தமான இடங்களுக்கு.",
  "Reading file…": "File படிக்கிறது…",
  "✨ Clean audio": "✨ சத்தம் நீக்கு",
  "Ready when you are": "நீங்கள் தயாரானதும் தொடங்கலாம்",
  "Recording… speak now": "பதிவு செய்கிறது… இப்போது பேசுங்கள்",
  "Building your voice…": "உங்கள் குரலை தயார் செய்கிறது…",
  "Your voice preview is ready": "உங்கள் குரல் முன்னோட்டம் தயார்",
  "Microphone access was blocked. Allow it and try again.": "Mic அனுமதி தடுக்கப்பட்டது. அனுமதித்து மீண்டும் முயற்சிக்கவும்.",
  "● Start recording": "● பதிவு தொடங்கு",
  "■ Stop recording": "■ பதிவை நிறுத்து",
  "Processing…": "செயலாக்குகிறது…",
  "↺ Record again": "↺ மீண்டும் பதிவு",
  "● Try again": "● மீண்டும் முயற்சி",
  "Sample call · Clinic booking": "மாதிரி அழைப்பு · Clinic booking",
  "Hi, I want to book an appointment for tomorrow.": "வணக்கம், நாளைக்கு ஒரு appointment book பண்ணணும்.",
  "Sure. Morning or evening works better for you?": "சரி. காலையா மாலையா உங்களுக்கு வசதி?",
  "Evening, after 5 if possible.": "மாலை, முடிஞ்சா 5 மணிக்கு மேல.",
  "You’re booked for 5:30 PM tomorrow. I’ve sent the details by SMS.": "நாளை மாலை 5:30-க்கு book ஆயிடுச்சு. விவரங்களை SMS-ல அனுப்பிட்டேன்.",
  "{n} lines · tap a line to play from there": "{n} வரிகள் · ஒரு வரியை தொட்டு அங்கிருந்து கேளுங்கள்",
  "{n} to check": "{n} சரிபார்க்க",
  // added 2026-11-08 (A3 finish): labels, live status and progress text
  "All rights reserved.": "அனைத்து உரிமைகளும் பாதுகாக்கப்பட்டவை.",
  "Agent ready": "Agent தயார்",
  "Listening…": "கேட்கிறது…",
  "Thinking…": "யோசிக்கிறது…",
  Speaking: "பேசுகிறது",
  "▶ Play your voice": "▶ உங்கள் குரலைக் கேளுங்கள்",
  "Creating your audio… the first one can take up to 20 seconds.": "உங்கள் audio உருவாகிறது… முதல் முறை 20 விநாடிகள் வரை ஆகலாம்.",
  "Creating audio… switching between Tamil and English can take up to 20 seconds.": "Audio உருவாகிறது… தமிழ் ↔ English மாறும்போது 20 விநாடிகள் வரை ஆகலாம்.",
  "The engine was not sure about this line. Listen and fix it in the text above.": "இந்த வரியில் engine-க்கு சந்தேகம். கேட்டு, மேலே உள்ள எழுத்தில் திருத்துங்கள்.",
  "Turn Tanglish typed in English letters into Tamil letters": "ஆங்கில எழுத்தில் type செய்த Tanglish-ஐ தமிழ் எழுத்தாக மாற்றும்",
  "Sansa Voice text": "Sansa Voice எழுத்து",
  "Download as a Word document": "Word document-ஆக download செய்",
  "Opens a print page: choose Save as PDF": "Print page திறக்கும்: ‘Save as PDF’ தேர்ந்தெடுங்கள்",
  "Share the text on WhatsApp": "எழுத்தை WhatsApp-இல் பகிர்",
  "Allow pop-ups for this site to save as PDF.": "PDF-ஆக சேமிக்க இந்த தளத்துக்கு pop-up அனுமதி கொடுங்கள்.",
  "Long text to MP3": "நீளமான எழுத்து → MP3",
  "Paste a script, a story or an article (Tamil or English, up to 10,000 characters). You get one MP3.": "Script, கதை அல்லது கட்டுரையை ஒட்டுங்கள் (தமிழ் அல்லது English, 10,000 எழுத்துகள் வரை). ஒரே MP3 கிடைக்கும்.",
  "Create MP3": "MP3 உருவாக்கு",
  "⬇ Download MP3": "⬇ MP3 பதிவிறக்கு",
  "Something went wrong. Try again.": "ஏதோ தவறு நடந்தது. மீண்டும் முயற்சிக்கவும்.",
  "Any audio: mp3, m4a, wav, ogg, opus, amr, aac, WhatsApp voice notes and call recordings, up to about 1 hour (200 MB). Long recordings show the time left and continue where they stopped if the page closes. Video for subtitles up to 300 MB.": "எந்த audio-வும்: mp3, m4a, wav, ogg, opus, amr, aac, WhatsApp voice notes, call recordings — சுமார் 1 மணி நேரம் வரை (200 MB). நீளமான recording-க்கு மீதமுள்ள நேரம் காட்டும்; page மூடினாலும் நின்ற இடத்தில் இருந்து தொடரும். Subtitles-க்கு video 300 MB வரை.",
};

/** Interface text in the chosen language (English when there is no Tamil yet). Non-strings pass through. */
export function tr<T>(s: T): T {
  if (cur !== "ta" || typeof s !== "string") return s;
  const key = s.trim();
  const v = TA[s] ?? TA[key] ?? TA[` ${key}`];
  if (v === undefined) return s;
  // keep the original's leading / trailing spaces (text is often joined to the words around it)
  const lead = s.match(/^\s*/)?.[0] ?? "";
  const trail = s.match(/\s*$/)?.[0] ?? "";
  return ((lead + v.trim() + trail) as unknown) as T;
}
