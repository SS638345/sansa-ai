import { tamilToTanglish, tanglishToTamil } from "../src/translit";
const A: [string, string][] = [
  ["வணக்கம்", "vanakkam"], ["எப்படி", "eppadi"], ["இருக்கீங்க", "irukkeenga"], ["நன்றி", "nandri"], ["தமிழ்", "thamizh"],
  ["வெற்றி", "vetri"], ["பச்சை", "pachai"], ["அப்பா", "appa"], ["கடை", "kadai"], ["மதுரை", "madhurai"], ["பங்கு", "pangu"],
  ["இன்று", "indru"], ["பேசுங்க", "pesunga"], ["கோவை", "kovai"], ["மழை", "mazhai"], ["சாப்பாடு", "saappaadu"], ["தம்பி", "thambi"], ["அம்மா", "amma"], ["வா", "vaa"], ["பசங்க", "pasanga"],
  ["வணக்கம், நான் SANSA. 2026", "vanakkam, naan SANSA. 2026"],
];
const B: [string, string][] = [
  ["vanakkam epdi irukeenga", "வணக்கம் எப்படி இருக்கீங்க"],
  ["naan nalla irukken", "நான் நல்ல இருக்கேன்"],
  ["inniki meeting irukku", "இன்னிக்கு meeting இருக்கு"],
  ["kadai", "கடை"], ["padam", "படம்"], ["maram", "மரம்"], ["pasanga", "பசங்க"], ["paal", "பால்"], ["kalyanam", "கல்யாணம்"],
  ["Nandri", "நன்றி"], ["naalaiku order varum", "நாளைக்கு order வரும்"], ["thanni", "தண்ணி"], ["poonga", "பூங்க"],
];
let ok = 0; const bad: string[] = [];
for (const [i, w] of A) { const g = tamilToTanglish(i); g === w ? ok++ : bad.push(`  T→E ${i}: got "${g}" want "${w}"`); }
for (const [i, w] of B) { const g = tanglishToTamil(i); g === w ? ok++ : bad.push(`  E→T ${i}: got "${g}" want "${w}"`); }
console.log(`${ok}/${A.length + B.length} correct`); if (bad.length) { console.log(bad.join("\n")); process.exitCode = 1; }
