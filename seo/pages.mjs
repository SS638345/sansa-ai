// SEO landing pages for sansaai.in (2026-11-09). One page per search intent; synonyms share a page
// (text to speech = text to voice = AI voice generator) so there are no thin "doorway" pages.
// Every fact here must match the live tools (limits in src/limits.ts and src/cleanup.ts).
// scripts/build-seo-pages.mjs turns each entry into dist/<slug>.html with the working tool inside.

export const SITE = "https://sansaai.in";

export const PAGES = [
  {
    slug: "text-to-speech",
    tool: "tts",
    nav: "Text to Speech",
    title: "Free Text to Speech Online in Tamil & English | SANSA AI Voice Generator",
    description:
      "Turn text into natural speech for free. SANSA reads Tamil and English in male and female AI voices and gives you an MP3. Up to 10,000 characters per file.",
    h1: "Free Text to Speech: turn text into natural Tamil and English voice",
    intro: [
      "SANSA is a free online text to speech tool, also called text to voice or an AI voice generator. Type or paste your text, pick a voice and listen. When it sounds right, download the audio as an MP3.",
      "There are four voices today: Kavya (Tamil, female), Arjun (Tamil, male), Meera (English, female) and Vikram (English, male). The voices run on SANSA's own server in India.",
    ],
    sections: [
      {
        h2: "How to convert text to voice",
        steps: [
          "Sign in with your Google account (free).",
          "Type or paste your text in Tamil or English. Mixed text works: English sentences inside a Tamil script are read by the English voice.",
          "Choose a voice and press play to hear a sample.",
          "For longer scripts use “Long text to MP3”: up to 10,000 characters become one MP3 file you can download.",
        ],
      },
      {
        h2: "What the voice reads correctly",
        bullets: [
          "Numbers, money (₹, lakh, crore), percentages, dates and times are read out in words.",
          "Phone numbers, units (kg, km, GB) and common symbols (&, @, +) are spoken properly.",
          "Common English words typed inside Tamil text are read in Tamil sounds instead of being skipped.",
        ],
      },
      {
        h2: "Who uses an online voice generator",
        cards: [
          ["YouTube and Instagram creators", "Make a clear voice-over for shorts, reels and explainer videos without recording yourself."],
          ["Teachers and students", "Turn lessons and notes into audio for revision and for learners who prefer listening."],
          ["Small businesses", "Create announcements, product demos and WhatsApp audio messages in Tamil and English."],
          ["Accessibility", "Listen to text instead of reading it, at your own pace."],
        ],
      },
      {
        h2: "Limits to know",
        bullets: [
          "Voices are Tamil and English only. Other Indian languages are available for speech to text, not yet for voices.",
          "The quick speak box takes 500 characters; long text up to 10,000 characters.",
          "Switching between a Tamil and an English voice can take up to 20 seconds the first time.",
        ],
      },
    ],
    faq: [
      ["Is SANSA text to speech free?", "Yes. All tools on sansaai.in are free. You only sign in with your Google account."],
      ["Can I download the audio?", "Yes. Long text is turned into one MP3 file that you can download and use in your videos or messages."],
      ["Which languages and voices are available?", "Tamil and English, each with a female and a male voice: Kavya and Arjun (Tamil), Meera and Vikram (English)."],
      ["Is my text saved?", "No. Your text is sent to our server in India only to make the audio and is not stored."],
      ["Can I make the voice sound like me?", "Yes, with Voice Cloning: read a short passage once and SANSA speaks your text in your own voice."],
    ],
    related: ["tamil-text-to-speech", "voice-cloning", "speech-to-text", "voice-changer"],
  },
  {
    slug: "tamil-text-to-speech",
    tool: "tts-ta",
    nav: "Tamil Text to Speech",
    lang: "ta",
    title: "Tamil Text to Speech Online Free | Natural Tamil AI Voice | SANSA",
    description:
      "Free Tamil text to speech with natural female and male Tamil voices. Reads numbers, dates and English words in Tamil correctly. Download MP3.",
    h1: "Tamil Text to Speech with natural Tamil voices",
    intro: [
      "Type Tamil (தமிழ்) text and SANSA reads it aloud in a natural Tamil voice. Choose Kavya (female) or Arjun (male), listen, and download an MP3.",
      "SANSA is built for Tamil first: money, dates, times and phone numbers are read the way a Tamil speaker says them, and common English words inside Tamil text are spoken in Tamil sounds.",
    ],
    sections: [
      {
        h2: "How to use Tamil text to speech",
        steps: [
          "Sign in with Google (free).",
          "Type or paste Tamil text. You can type Tanglish in the speech-to-text tool and convert it to Tamil script first.",
          "Pick Kavya or Arjun and press play.",
          "Use “Long text to MP3” for up to 10,000 characters in one file.",
        ],
      },
      {
        h2: "Examples of what it reads correctly",
        bullets: [
          "₹1,250.50 → rupees and paise in Tamil words",
          "10/11/2026 → the date in Tamil (month name and year)",
          "10:30 AM, 14:45 → the time in Tamil, including காலை / மதியம்",
          "+91 98765 43210 → phone numbers digit by digit",
          "English words like “meeting” or “online” inside Tamil sentences",
        ],
      },
      {
        h2: "Popular uses",
        cards: [
          ["Tamil YouTube channels", "Voice-overs for stories, news summaries and how-to videos."],
          ["Schools and tuition", "Tamil lessons as audio for revision."],
          ["Shops and services", "Offers and announcements as WhatsApp voice messages."],
          ["Elders in the family", "Listen to long Tamil messages instead of reading small text."],
        ],
      },
      {
        h2: "Tips for a natural Tamil voice-over",
        bullets: [
          "Write short sentences. A full stop gives the voice a natural pause.",
          "Write numbers as digits (₹500, 10:30) and let SANSA say them; it reads them the Tamil way.",
          "For a video, make one MP3 per scene so you can move the clips in your editor.",
          "Listen once before you publish and fix any spelling the voice reads oddly.",
        ],
      },
      {
        h2: "Tamil voice for creators outside India",
        paragraphs: [
          "Tamil speakers in Singapore, Malaysia, Sri Lanka, the UK and the US use SANSA for family videos, temple and community announcements and Tamil classes. The tool works in any modern browser; you only need a Google account.",
        ],
      },
    ],
    faq: [
      ["Is the Tamil voice free?", "Yes, free with Google sign-in."],
      ["Does it support Sri Lankan or Malaysian Tamil text?", "It reads standard written Tamil from any region. The voice accent is Indian Tamil."],
      ["Can it read English words in Tamil text?", "Yes. Common English words are converted to Tamil sounds; longer English sentences are read by the English voice."],
      ["How long can the text be?", "Up to 500 characters in the quick box and up to 10,000 characters with Long text to MP3."],
    ],
    related: ["text-to-speech", "tamil-speech-to-text", "voice-cloning", "audio-to-text"],
  },
  {
    slug: "speech-to-text",
    tool: "stt",
    nav: "Speech to Text",
    title: "Free Speech to Text & Voice to Text Online | Tamil, English, Indian Languages | SANSA",
    description:
      "Convert speech to text free: live voice typing, recordings and audio files in Tamil, English and 15+ Indian languages. Export to Word, SRT subtitles or WhatsApp.",
    h1: "Free Speech to Text: voice typing and transcription online",
    intro: [
      "SANSA converts your voice to text in Tamil, English and more than 15 Indian languages. Speak into the microphone and watch the text appear, record and convert, or upload an audio or video file for online transcription.",
      "Tamil is transcribed on SANSA's own speech engine in India, trained for Tamil. Other languages run in your own browser, so the audio does not leave your device.",
    ],
    sections: [
      {
        h2: "Three ways to turn voice into text",
        cards: [
          ["Live mic", "Voice typing: speak and the words appear as you talk."],
          ["Record & convert", "Record first, then get the full transcript in one go."],
          ["Upload audio", "Transcribe a file: WhatsApp voice notes, call recordings, meetings, lectures or videos."],
        ],
      },
      {
        h2: "How to transcribe audio to text",
        steps: [
          "Sign in with Google (free).",
          "Choose the language (Tamil, English, Hindi, Telugu, Kannada, Malayalam and more).",
          "Pick Live mic, Record or Upload, and start.",
          "Edit the text, then copy it, download .txt, Word or PDF, share to WhatsApp, or save subtitles as .srt / .vtt.",
        ],
      },
      {
        h2: "Useful extras",
        bullets: [
          "My words: add names and terms so they are spelled your way.",
          "Tanglish → தமிழ்: turn Tamil typed in English letters into Tamil script.",
          "Timeline: jump to any part of the recording and check the text.",
          "Library: your transcripts are saved only in your own browser.",
        ],
      },
      {
        h2: "Limits",
        bullets: [
          "Tamil files up to 200 MB (about an hour) on the SANSA engine.",
          "Other languages: files up to 25 MB, processed in your browser (a modern computer or phone helps).",
          "Video files up to 300 MB for subtitles.",
        ],
      },
    ],
    faq: [
      ["Is voice to text free?", "Yes. It is free with Google sign-in."],
      ["Which languages can I transcribe?", "Tamil, English and 15+ Indian languages including Hindi, Telugu, Kannada, Malayalam, Bengali, Marathi, Gujarati, Punjabi and Urdu."],
      ["How accurate is it?", "Clear Tamil speech is usually transcribed very accurately. Noise, music and many speakers reduce accuracy; the editor lets you fix any word."],
      ["Is my audio saved?", "No. Tamil audio is sent to our server in India only to convert it and is not saved. Other languages never leave your device."],
      ["Can I make subtitles?", "Yes. Download the transcript as .srt or .vtt subtitles with timings."],
    ],
    related: ["audio-to-text", "tamil-speech-to-text", "text-to-speech", "audio-cleanup"],
  },
  {
    slug: "audio-to-text",
    tool: "audio",
    nav: "Audio to Text",
    title: "Audio to Text Converter Online Free | Transcribe WhatsApp Voice Notes & Recordings | SANSA",
    description:
      "Upload an audio or video file and get the text. Transcribe WhatsApp voice notes, call recordings, meetings and lectures in Tamil, English and Indian languages. Free.",
    h1: "Audio to Text Converter: transcribe recordings and voice notes",
    intro: [
      "Upload a recording and SANSA turns it into editable text. It works with WhatsApp voice notes, phone call recordings, meeting and class recordings, podcasts and videos.",
      "For Tamil, SANSA's own engine handles files up to 200 MB (about one hour). The transcript comes with timings, so you can also save it as subtitles.",
    ],
    sections: [
      {
        h2: "How to convert an audio file to text",
        steps: [
          "Sign in with Google (free) and choose “Upload audio”.",
          "Pick the language spoken in the recording.",
          "Choose the file (MP3, M4A, OGG/Opus voice notes, WAV, MP4 and more).",
          "Wait for the parts to finish, then edit and export: Word, PDF, .txt, .srt, .vtt or WhatsApp.",
        ],
      },
      {
        h2: "WhatsApp voice notes on Android",
        paragraphs: [
          "Add sansaai.in to your home screen. Then, in WhatsApp, long-press a voice note, tap Share and choose Sansa Voice. The note opens in SANSA ready to convert.",
        ],
      },
      {
        h2: "Tips for better transcripts",
        bullets: [
          "Noisy recording? Clean it first with Audio Cleanup, then transcribe.",
          "Add names, places and product words in “My words”.",
          "Long files are converted in parts; if your internet drops, choose the same file again and it continues.",
        ],
      },
      {
        h2: "Common recordings people convert",
        cards: [
          ["WhatsApp voice notes", "Read long voice messages quickly or keep them as text."],
          ["Phone call recordings", "Get the important points of a customer or office call in writing."],
          ["Meetings and classes", "Turn a lecture or meeting into notes you can search and share."],
          ["Interviews and podcasts", "Make a transcript to quote from or publish with the episode."],
          ["YouTube videos", "Create subtitles (.srt) from your video's audio."],
        ],
      },
      {
        h2: "What you get",
        bullets: [
          "Editable text with the timeline, so you can click a line and hear that part.",
          "Exports: copy, .txt, Word (.docx), PDF, WhatsApp, and subtitles as .srt or .vtt.",
          "Text with times, useful for minutes of meetings and interview notes.",
        ],
      },
    ],
    faq: [
      ["What file types are supported?", "Common audio and video formats, including MP3, M4A, WAV, OGG/Opus (WhatsApp) and MP4."],
      ["How long can the recording be?", "Tamil: up to 200 MB, about one hour. Other languages: up to 25 MB. Video for subtitles: up to 300 MB."],
      ["Is it private?", "Files are not saved on our server. Tamil audio is converted on our server in India; other languages are converted on your device."],
      ["Can it separate speakers?", "Not yet. The transcript is one text with timings."],
    ],
    related: ["speech-to-text", "tamil-speech-to-text", "audio-cleanup", "text-to-speech"],
  },
  {
    slug: "tamil-speech-to-text",
    tool: "stt-ta",
    nav: "Tamil Speech to Text",
    lang: "ta",
    title: "Tamil Speech to Text & Tamil Voice Typing Online Free | SANSA",
    description:
      "Free Tamil voice typing and Tamil audio to text. Speak in Tamil or upload a Tamil recording and get Tamil script. Works with Tanglish and WhatsApp voice notes.",
    h1: "Tamil Speech to Text and Tamil voice typing",
    intro: [
      "Speak in Tamil and get Tamil script (தமிழ் எழுத்து) on screen, or upload a Tamil recording and get the full transcript. SANSA's Tamil engine runs on its own server in India and is tuned for Tamil.",
      "If you type in Tanglish (Tamil in English letters), one click turns it into Tamil script.",
    ],
    sections: [
      {
        h2: "How to type Tamil by voice",
        steps: [
          "Sign in with Google (free). Tamil is already selected.",
          "Press Live mic and speak, or upload a Tamil audio file.",
          "Fix any word in the editor and add names in “My words”.",
          "Copy the Tamil text, or save it as Word, PDF, .txt or subtitles.",
        ],
      },
      {
        h2: "Good for",
        cards: [
          ["Writers and journalists", "Dictate Tamil articles and stories instead of typing."],
          ["Students", "Turn Tamil lectures and class recordings into notes."],
          ["Offices", "Transcribe Tamil meetings, calls and interviews."],
          ["Video makers", "Make Tamil subtitles (.srt) for YouTube."],
        ],
      },
      {
        h2: "Accuracy, honestly",
        paragraphs: [
          "Clear Tamil speech is usually converted very accurately. Background noise, music, very fast speech and many people talking at once lower the accuracy. Parts the engine is unsure about are marked so you can check them.",
        ],
      },
      {
        h2: "Tamil voice typing on your phone",
        paragraphs: [
          "Open sansaai.in in Chrome on Android, sign in, and tap Live mic. Speak naturally in Tamil; the text appears on screen and you can copy it into WhatsApp, email or any app. For a long voice note, use Upload audio instead of Live mic.",
        ],
      },
      {
        h2: "Exports and sharing",
        bullets: [
          "Copy the Tamil text or download it as .txt, Word or PDF.",
          "Share straight to WhatsApp.",
          "Save .srt or .vtt subtitles with timings for Tamil videos.",
          "Your transcripts are kept in your own browser's library, not on our server.",
        ],
      },
    ],
    faq: [
      ["Is Tamil voice typing free?", "Yes, free with Google sign-in."],
      ["Does it write Tamil script or Tanglish?", "Tamil script. You can also convert Tanglish to Tamil script with one click."],
      ["Can it handle Tamil mixed with English?", "Yes. Mixed Tamil and English speech is common and is supported."],
      ["How long can a Tamil recording be?", "Up to 200 MB, about one hour per file."],
    ],
    related: ["speech-to-text", "tamil-text-to-speech", "audio-to-text", "audio-cleanup"],
  },
  {
    slug: "voice-cloning",
    tool: "clone",
    nav: "Voice Cloning",
    title: "AI Voice Cloning in Tamil & English (Your Own Voice Only) | SANSA",
    description:
      "Clone your own voice from a 20-second Tamil reading and make MP3s in your voice in Tamil and English. Built-in check so only your own voice can be used. Free.",
    h1: "Voice Cloning: speak any text in your own voice",
    intro: [
      "Read a short Tamil passage aloud (about 20 seconds). SANSA checks that you read the shown words, builds a voice print and keeps it only in your browser. Then type text in Tamil or English and get an MP3 in your voice.",
      "Only your own voice: because you must read a fresh random passage, a recording of someone else cannot be used.",
    ],
    sections: [
      {
        h2: "How voice cloning works",
        steps: [
          "Sign in with Google and tick “This is my own voice”.",
          "Get your reading passage and read it aloud clearly (8–30 seconds).",
          "SANSA checks the words and makes your voice print (about 30 seconds).",
          "Type up to 300 characters in Tamil or English and press “Speak in my voice”.",
        ],
      },
      {
        h2: "Safety and privacy",
        bullets: [
          "Your recording is not saved on our server.",
          "Your voice print stays only in your browser; you can delete it anytime.",
          "Use it for your own content only, and tell listeners when a voice is AI.",
        ],
      },
      {
        h2: "Ideas for your cloned voice",
        cards: [
          ["Personal videos", "Narrate family videos and greetings in your own voice without recording each line."],
          ["Teaching", "Make lesson audio in your voice in Tamil and English."],
          ["Your brand", "Keep one consistent voice for your shop's or channel's announcements."],
          ["Fix a recording", "Use the Voice Changer to re-voice an old clip in your cloned voice."],
        ],
      },
      {
        h2: "Tips for a good voice print",
        bullets: [
          "Record in a quiet room, 15–30 cm from the microphone.",
          "Read the whole passage at your normal speed and volume.",
          "If the check says the words did not match, get a new passage and read it clearly again.",
          "Delete your voice anytime with “Delete my voice”.",
        ],
      },
    ],
    faq: [
      ["Can I clone a celebrity or another person's voice?", "No. The reading check makes sure only the person speaking now can create a voice."],
      ["Does it work in English?", "Yes. You read a Tamil passage once; your cloned voice can then speak Tamil and English."],
      ["Is it free?", "Yes, free with Google sign-in."],
    ],
    related: ["voice-changer", "text-to-speech", "tamil-text-to-speech"],
  },
  {
    slug: "voice-changer",
    tool: "changer",
    nav: "Voice Changer",
    title: "AI Voice Changer Online: Change a Recording to Another Voice | SANSA",
    description:
      "Change the voice in a recording while keeping the words and timing. Turn it into a SANSA female or male voice, or your own cloned voice. Up to 5 minutes, free.",
    h1: "AI Voice Changer: same words, a new voice",
    intro: [
      "Upload a recording up to 5 minutes long. SANSA keeps the words, timing and feeling and changes only the voice: to a SANSA female voice, a SANSA male voice, or your own cloned voice.",
      "You can only change to a SANSA voice or your own voice, never to someone else's.",
    ],
    sections: [
      {
        h2: "How to change a voice",
        steps: [
          "Sign in with Google and choose a recording.",
          "Pick the new voice: SANSA female, SANSA male, or My own voice (after Voice Cloning).",
          "Confirm you have the right to use the recording, then press “Change the voice”.",
          "Compare before and after, and download the MP3.",
        ],
      },
      {
        h2: "Uses",
        cards: [
          ["Privacy", "Share a voice message without revealing your real voice."],
          ["Consistent narration", "Make all your videos use the same voice."],
          ["Fix a recording", "Re-voice a clip in your own cloned voice."],
        ],
      },
      {
        h2: "What stays and what changes",
        bullets: [
          "Stays the same: every word, the pauses and the speed of the original speaker.",
          "Changes: the voice colour, so it sounds like the voice you picked.",
          "Very noisy recordings change less cleanly; run Audio Cleanup first for best results.",
        ],
      },
      {
        h2: "Rules for fair use",
        paragraphs: [
          "You must have the right to use the recording, and you must not use the result to mislead anyone. There is no way to upload another person's voice as the target: the new voice can only be a SANSA voice or your own cloned voice. Tell your listeners when a voice is AI.",
        ],
      },
    ],
    faq: [
      ["Will the words change?", "No. In our tests 99–100% of Tamil words stayed the same after the change."],
      ["How long can the recording be?", "Up to 5 minutes. Long files are processed in parts automatically."],
      ["Is my recording stored?", "No. It is processed and not saved on our server."],
    ],
    related: ["voice-cloning", "text-to-speech", "audio-cleanup"],
  },
  {
    slug: "audio-cleanup",
    tool: "cleanup",
    nav: "Audio Cleanup",
    title: "Remove Background Noise from Audio Online Free | SANSA Audio Cleanup",
    description:
      "Remove background noise from voice recordings in your browser. Light, Normal or Strong cleanup for recordings up to 20 minutes. Your audio never leaves your device.",
    h1: "Audio Cleanup: remove background noise from voice recordings",
    intro: [
      "Fans, traffic, AC hum and room noise make recordings hard to hear and hard to transcribe. SANSA Audio Cleanup removes background noise and keeps the voice clear.",
      "Cleanup runs inside your browser (RNNoise), so your audio is not uploaded anywhere.",
    ],
    sections: [
      {
        h2: "How to clean up audio",
        steps: [
          "Sign in with Google and choose a recording (up to 20 minutes or 300 MB).",
          "Pick Light, Normal or Strong.",
          "Press “Clean audio”, then compare before and after.",
          "Download the cleaned file, or transcribe it with Speech to Text.",
        ],
      },
      {
        h2: "Best results",
        bullets: [
          "Use Light for music or soft noise, Strong for loud fans and traffic.",
          "Cleanup helps speech; it cannot rebuild words that are completely covered by noise.",
        ],
      },
      {
        h2: "When to use Audio Cleanup",
        cards: [
          ["Before transcription", "Cleaner audio gives a better speech-to-text result."],
          ["Online classes and meetings", "Remove fan and keyboard noise from recorded sessions."],
          ["Voice notes", "Make a noisy WhatsApp voice note easy to hear before sharing."],
          ["Video voice-overs", "Clean a phone recording before adding it to your video."],
        ],
      },
      {
        h2: "Light, Normal or Strong?",
        bullets: [
          "Light: keeps the most natural sound; for soft background noise.",
          "Normal: the best choice for most rooms, fans and AC hum.",
          "Strong: for traffic, crowds and loud machines; the voice may sound slightly thinner.",
          "Compare before and after and pick the level that sounds best to you.",
        ],
      },
    ],
    faq: [
      ["Is my audio uploaded?", "No. Audio Cleanup runs in your browser."],
      ["What length is supported?", "Up to 20 minutes or 300 MB per file."],
      ["Is it free?", "Yes, free with Google sign-in."],
    ],
    related: ["audio-to-text", "speech-to-text", "voice-changer"],
  },
];
