/**
 * One icon set for the whole site: Lucide (ISC licence), clean line icons that stay sharp at any size.
 * Use <Ic.Play /> etc. Icons inherit the text colour; size follows the font size (1.15em) unless given.
 */
import {
  ArrowRight,
  AudioLines,
  Bot,
  Captions,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Upload,
  Drum,
  FileText,
  Fingerprint,
  Languages,
  LoaderCircle,
  MessageCircle,
  Mic,
  Moon,
  Play,
  Printer,
  Search,
  Sparkles,
  Square,
  Sun,
  TriangleAlert,
  Volume2,
  WandSparkles,
  X,
  type LucideIcon,
} from "lucide-react";

const wrap = (I: LucideIcon, filled = false) =>
  function Icon({ size = "1.15em", className = "ico" }: { size?: number | string; className?: string }) {
    return <I size={size} className={className} strokeWidth={2} fill={filled ? "currentColor" : "none"} aria-hidden="true" />;
  };

export const Ic = {
  ArrowRight: wrap(ArrowRight),
  AudioLines: wrap(AudioLines),
  Bot: wrap(Bot),
  Captions: wrap(Captions),
  Check: wrap(Check),
  ChevronDown: wrap(ChevronDown),
  ChevronUp: wrap(ChevronUp),
  Copy: wrap(Copy),
  Download: wrap(Download),
  Upload: wrap(Upload),
  Drum: wrap(Drum),
  FileText: wrap(FileText),
  Fingerprint: wrap(Fingerprint),
  Languages: wrap(Languages),
  Loader: wrap(LoaderCircle),
  Message: wrap(MessageCircle),
  Mic: wrap(Mic),
  Moon: wrap(Moon),
  Play: wrap(Play, true),
  Printer: wrap(Printer),
  Record: function RecordDot({ size = "0.8em" }: { size?: number | string }) {
    return <span className="ico-rec" style={{ width: size, height: size }} aria-hidden="true" />;
  },
  Search: wrap(Search),
  Sparkles: wrap(Sparkles),
  Stop: wrap(Square, true),
  Sun: wrap(Sun),
  Warn: wrap(TriangleAlert),
  Volume: wrap(Volume2),
  Wand: wrap(WandSparkles),
  X: wrap(X),
};

/** Strip an old text symbol (■ ▶ ● ⬇ 🔊 ⚠) from the start of a label, so the icon replaces it. */
export const bare = (s: string) => s.replace(/^\s*(?:[■▶●⬇⚠…]|🔊)️?\s*/u, "");
