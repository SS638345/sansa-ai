/**
 * The site's limits in one place. The page uses these, and tests/agentBrain.test.ts checks that
 * the voice agent quotes the same numbers, so the agent can never say an old limit.
 */
export const SPEAK_MAX_CHARS = 500; // home page "Speak" box
export const LONG_TEXT_MAX_CHARS = 10000; // "Long text to MP3"
export const ENGINE_UPLOAD_MB = 200; // Tamil on the SANSA engine (about 1 hour)
export const LOCAL_UPLOAD_MB = 25; // on-device languages
export const VIDEO_UPLOAD_MB = 300; // video for subtitles
export const CLONE_MAX_CHARS = 300; // "Speak in your own voice" box (the engine allows the same)
