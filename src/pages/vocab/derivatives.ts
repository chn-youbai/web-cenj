import { escapeHtml } from "@/core/dom";
import type { DerivativesApiResponse } from "@shared/types";
import {
  deinflectSingleToken,
  escapeRegExp,
  formatShortUnitBadge,
  formatUnitLabel,
  getShortBookName,
  normalizeWordStr,
} from "./search";
import type {
  CloudDerivativesCacheEntry,
  CognateItem,
  InflectionItem,
  VocabEntry,
  WordDetailData,
} from "./types";
import { COMPLETE_ROOT_FAMILIES, CORE_POLYSEMY_EXTRAS } from "./word-knowledge";

const IRREG_VERB_TABLE: Record<string, { past: string; pp: string; ing: string; s: string }> = {
  arise: { past: "arose", pp: "arisen", ing: "arising", s: "arises" },
  awake: { past: "awoke", pp: "awoken", ing: "awaking", s: "awakes" },
  be: { past: "was / were", pp: "been", ing: "being", s: "is / am / are" },
  bear: { past: "bore", pp: "born / borne", ing: "bearing", s: "bears" },
  beat: { past: "beat", pp: "beaten", ing: "beating", s: "beats" },
  become: { past: "became", pp: "become", ing: "becoming", s: "becomes" },
  begin: { past: "began", pp: "begun", ing: "beginning", s: "begins" },
  behold: { past: "beheld", pp: "beheld", ing: "beholding", s: "beholds" },
  bend: { past: "bent", pp: "bent", ing: "bending", s: "bends" },
  bet: { past: "bet", pp: "bet", ing: "betting", s: "bets" },
  bite: { past: "bit", pp: "bitten", ing: "biting", s: "bites" },
  bleed: { past: "bled", pp: "bled", ing: "bleeding", s: "bleeds" },
  blow: { past: "blew", pp: "blown", ing: "blowing", s: "blows" },
  break: { past: "broke", pp: "broken", ing: "breaking", s: "breaks" },
  bring: { past: "brought", pp: "brought", ing: "bringing", s: "brings" },
  broadcast: { past: "broadcast", pp: "broadcast", ing: "broadcasting", s: "broadcasts" },
  build: { past: "built", pp: "built", ing: "building", s: "builds" },
  burn: { past: "burnt / burned", pp: "burnt / burned", ing: "burning", s: "burns" },
  buy: { past: "bought", pp: "bought", ing: "buying", s: "buys" },
  cast: { past: "cast", pp: "cast", ing: "casting", s: "casts" },
  catch: { past: "caught", pp: "caught", ing: "catching", s: "catches" },
  choose: { past: "chose", pp: "chosen", ing: "choosing", s: "chooses" },
  come: { past: "came", pp: "come", ing: "coming", s: "comes" },
  cost: { past: "cost", pp: "cost", ing: "costing", s: "costs" },
  cut: { past: "cut", pp: "cut", ing: "cutting", s: "cuts" },
  deal: { past: "dealt", pp: "dealt", ing: "dealing", s: "deals" },
  dig: { past: "dug", pp: "dug", ing: "digging", s: "digs" },
  dive: { past: "dived / dove", pp: "dived", ing: "diving", s: "dives" },
  do: { past: "did", pp: "done", ing: "doing", s: "does" },
  draw: { past: "drew", pp: "drawn", ing: "drawing", s: "draws" },
  dream: { past: "dreamt / dreamed", pp: "dreamt / dreamed", ing: "dreaming", s: "dreams" },
  drink: { past: "drank", pp: "drunk", ing: "drinking", s: "drinks" },
  drive: { past: "drove", pp: "driven", ing: "driving", s: "drives" },
  eat: { past: "ate", pp: "eaten", ing: "eating", s: "eats" },
  fall: { past: "fell", pp: "fallen", ing: "falling", s: "falls" },
  feed: { past: "fed", pp: "fed", ing: "feeding", s: "feeds" },
  feel: { past: "felt", pp: "felt", ing: "feeling", s: "feels" },
  fight: { past: "fought", pp: "fought", ing: "fighting", s: "fights" },
  find: { past: "found", pp: "found", ing: "finding", s: "finds" },
  flee: { past: "fled", pp: "fled", ing: "fleeing", s: "flees" },
  fly: { past: "flew", pp: "flown", ing: "flying", s: "flies" },
  forbid: { past: "forbade", pp: "forbidden", ing: "forbidding", s: "forbids" },
  forecast: { past: "forecast", pp: "forecast", ing: "forecasting", s: "forecasts" },
  forget: { past: "forgot", pp: "forgotten", ing: "forgetting", s: "forgets" },
  forgive: { past: "forgave", pp: "forgiven", ing: "forgiving", s: "forgives" },
  freeze: { past: "froze", pp: "frozen", ing: "freezing", s: "freezes" },
  get: { past: "got", pp: "got / gotten", ing: "getting", s: "gets" },
  give: { past: "gave", pp: "given", ing: "giving", s: "gives" },
  go: { past: "went", pp: "gone", ing: "going", s: "goes" },
  grow: { past: "grew", pp: "grown", ing: "growing", s: "grows" },
  hang: { past: "hung / hanged", pp: "hung / hanged", ing: "hanging", s: "hangs" },
  have: { past: "had", pp: "had", ing: "having", s: "has" },
  hear: { past: "heard", pp: "heard", ing: "hearing", s: "hears" },
  hide: { past: "hid", pp: "hidden", ing: "hiding", s: "hides" },
  hit: { past: "hit", pp: "hit", ing: "hitting", s: "hits" },
  hold: { past: "held", pp: "held", ing: "holding", s: "holds" },
  hurt: { past: "hurt", pp: "hurt", ing: "hurting", s: "hurts" },
  keep: { past: "kept", pp: "kept", ing: "keeping", s: "keeps" },
  know: { past: "knew", pp: "known", ing: "knowing", s: "knows" },
  lay: { past: "laid", pp: "laid", ing: "laying", s: "lays" },
  lead: { past: "led", pp: "led", ing: "leading", s: "leads" },
  lean: { past: "leant / leaned", pp: "leant / leaned", ing: "leaning", s: "leans" },
  leap: { past: "leapt / leaped", pp: "leapt / leaped", ing: "leaping", s: "leaps" },
  learn: { past: "learnt / learned", pp: "learnt / learned", ing: "learning", s: "learns" },
  leave: { past: "left", pp: "left", ing: "leaving", s: "leaves" },
  lend: { past: "lent", pp: "lent", ing: "lending", s: "lends" },
  lie: { past: "lay / lied", pp: "lain / lied", ing: "lying", s: "lies" },
  light: { past: "lit / lighted", pp: "lit / lighted", ing: "lighting", s: "lights" },
  lose: { past: "lost", pp: "lost", ing: "losing", s: "loses" },
  make: { past: "made", pp: "made", ing: "making", s: "makes" },
  mean: { past: "meant", pp: "meant", ing: "meaning", s: "means" },
  meet: { past: "met", pp: "met", ing: "meeting", s: "meets" },
  mistake: { past: "mistook", pp: "mistaken", ing: "mistaking", s: "mistakes" },
  overcome: { past: "overcame", pp: "overcome", ing: "overcoming", s: "overcomes" },
  output: { past: "output", pp: "output", ing: "outputting", s: "outputs" },
  pay: { past: "paid", pp: "paid", ing: "paying", s: "pays" },
  put: { past: "put", pp: "put", ing: "putting", s: "puts" },
  quit: { past: "quit", pp: "quit", ing: "quitting", s: "quits" },
  read: { past: "read", pp: "read", ing: "reading", s: "reads" },
  ride: { past: "rode", pp: "ridden", ing: "riding", s: "rides" },
  ring: { past: "rang", pp: "rung", ing: "ringing", s: "rings" },
  rise: { past: "rose", pp: "risen", ing: "rising", s: "rises" },
  run: { past: "ran", pp: "run", ing: "running", s: "runs" },
  say: { past: "said", pp: "said", ing: "saying", s: "says" },
  see: { past: "saw", pp: "seen", ing: "seeing", s: "sees" },
  seek: { past: "sought", pp: "sought", ing: "seeking", s: "seeks" },
  sell: { past: "sold", pp: "sold", ing: "selling", s: "sells" },
  send: { past: "sent", pp: "sent", ing: "sending", s: "sends" },
  set: { past: "set", pp: "set", ing: "setting", s: "sets" },
  sew: { past: "sewed", pp: "sewn / sewed", ing: "sewing", s: "sews" },
  shake: { past: "shook", pp: "shaken", ing: "shaking", s: "shakes" },
  shine: { past: "shone / shined", pp: "shone / shined", ing: "shining", s: "shines" },
  shoot: { past: "shot", pp: "shot", ing: "shooting", s: "shoots" },
  show: { past: "showed", pp: "shown", ing: "showing", s: "shows" },
  shut: { past: "shut", pp: "shut", ing: "shutting", s: "shuts" },
  sing: { past: "sang", pp: "sung", ing: "singing", s: "sings" },
  sink: { past: "sank", pp: "sunk", ing: "sinking", s: "sinks" },
  sit: { past: "sat", pp: "sat", ing: "sitting", s: "sits" },
  sleep: { past: "slept", pp: "slept", ing: "sleeping", s: "sleeps" },
  slide: { past: "slid", pp: "slid", ing: "sliding", s: "slides" },
  smell: { past: "smelt / smelled", pp: "smelt / smelled", ing: "smelling", s: "smells" },
  sow: { past: "sowed", pp: "sown / sowed", ing: "sowing", s: "sows" },
  speak: { past: "spoke", pp: "spoken", ing: "speaking", s: "speaks" },
  speed: { past: "sped / speeded", pp: "sped / speeded", ing: "speeding", s: "speeds" },
  spell: { past: "spelt / spelled", pp: "spelt / spelled", ing: "spelling", s: "spells" },
  spend: { past: "spent", pp: "spent", ing: "spending", s: "spends" },
  spill: { past: "spilt / spilled", pp: "spilt / spilled", ing: "spilling", s: "spills" },
  spin: { past: "spun", pp: "spun", ing: "spinning", s: "spins" },
  spit: { past: "spat", pp: "spat", ing: "spitting", s: "spits" },
  split: { past: "split", pp: "split", ing: "splitting", s: "splits" },
  spoil: { past: "spoilt / spoiled", pp: "spoilt / spoiled", ing: "spoiling", s: "spoils" },
  spread: { past: "spread", pp: "spread", ing: "spreading", s: "spreads" },
  spring: { past: "sprang", pp: "sprung", ing: "springing", s: "springs" },
  stand: { past: "stood", pp: "stood", ing: "standing", s: "stands" },
  steal: { past: "stole", pp: "stolen", ing: "stealing", s: "steals" },
  stick: { past: "stuck", pp: "stuck", ing: "sticking", s: "sticks" },
  sting: { past: "stung", pp: "stung", ing: "stinging", s: "stings" },
  strike: { past: "struck", pp: "struck / stricken", ing: "striking", s: "strikes" },
  string: { past: "strung", pp: "strung", ing: "stringing", s: "strings" },
  swear: { past: "swore", pp: "sworn", ing: "swearing", s: "swears" },
  sweep: { past: "swept", pp: "swept", ing: "sweeping", s: "sweeps" },
  swell: { past: "swelled", pp: "swollen / swelled", ing: "swelling", s: "swells" },
  swim: { past: "swam", pp: "swum", ing: "swimming", s: "swims" },
  swing: { past: "swung", pp: "swung", ing: "swinging", s: "swings" },
  take: { past: "took", pp: "taken", ing: "taking", s: "takes" },
  teach: { past: "taught", pp: "taught", ing: "teaching", s: "teaches" },
  tear: { past: "tore", pp: "torn", ing: "tearing", s: "tears" },
  tell: { past: "told", pp: "told", ing: "telling", s: "tells" },
  think: { past: "thought", pp: "thought", ing: "thinking", s: "thinks" },
  throw: { past: "threw", pp: "thrown", ing: "throwing", s: "throws" },
  undergo: { past: "underwent", pp: "undergone", ing: "undergoing", s: "undergoes" },
  understand: { past: "understood", pp: "understood", ing: "understanding", s: "understands" },
  upset: { past: "upset", pp: "upset", ing: "upsetting", s: "upsets" },
  wake: { past: "woke", pp: "woken", ing: "waking", s: "wakes" },
  wear: { past: "wore", pp: "worn", ing: "wearing", s: "wears" },
  weave: { past: "wove", pp: "woven", ing: "weaving", s: "weaves" },
  weep: { past: "wept", pp: "wept", ing: "weeping", s: "weeps" },
  win: { past: "won", pp: "won", ing: "winning", s: "wins" },
  wind: { past: "wound", pp: "wound", ing: "winding", s: "winds" },
  withdraw: { past: "withdrew", pp: "withdrawn", ing: "withdrawing", s: "withdraws" },
  write: { past: "wrote", pp: "written", ing: "writing", s: "writes" },
};

const IRREG_PLURALS: Record<string, string> = {
  man: "men",
  woman: "women",
  child: "children",
  tooth: "teeth",
  foot: "feet",
  mouse: "mice",
  goose: "geese",
  deer: "deer (单复同形)",
  sheep: "sheep (单复同形)",
  species: "species (单复同形)",
  means: "means (单复同形)",
  series: "series (单复同形)",
  aircraft: "aircraft (单复同形)",
  spacecraft: "spacecraft (单复同形)",
  phenomenon: "phenomena",
  criterion: "criteria",
  analysis: "analyses",
  crisis: "crises",
  basis: "bases",
  medium: "media / mediums",
  bacterium: "bacteria",
  datum: "data",
  stadium: "stadiums / stadia",
  tornado: "tornadoes / tornados",
  volcano: "volcanoes / volcanos",
  mosquito: "mosquitoes / mosquitos",
  shelf: "shelves",
  leaf: "leaves",
  life: "lives",
  wife: "wives",
  knife: "knives",
  wolf: "wolves",
  half: "halves",
  thief: "thieves",
  loaf: "loaves",
  scarf: "scarves",
  calf: "calves",
};

const DOUBLE_CONSONANT_WORDS = new Set([
  "admit",
  "commit",
  "permit",
  "submit",
  "prefer",
  "refer",
  "occur",
  "equip",
  "regret",
  "control",
  "patrol",
  "compel",
  "propel",
  "rebel",
  "upset",
  "begin",
  "forbid",
  "forget",
  "chat",
  "clap",
  "drag",
  "drop",
  "fit",
  "flip",
  "grab",
  "grip",
  "hug",
  "jam",
  "jog",
  "knit",
  "nod",
  "pack",
  "plan",
  "plug",
  "pop",
  "rob",
  "rub",
  "shop",
  "skip",
  "slap",
  "slip",
  "spot",
  "step",
  "stir",
  "stop",
  "tap",
  "trap",
  "trip",
  "wrap",
  "ban",
  "beg",
  "stun",
]);

const VERB_WHITELIST = new Set([
  "look",
  "sign",
  "work",
  "study",
  "play",
  "plan",
  "change",
  "design",
  "focus",
  "challenge",
  "debate",
  "exchange",
  "lecture",
  "schedule",
  "struggle",
  "rescue",
  "ruin",
  "shelter",
  "shock",
  "stress",
  "strike",
  "supply",
  "trap",
  "wave",
  "whistle",
  "account",
  "aim",
  "alarm",
  "approach",
  "attack",
  "attempt",
  "award",
  "balance",
  "battle",
  "benefit",
  "charge",
  "chat",
  "click",
  "comment",
  "conduct",
  "contact",
  "contrast",
  "crowd",
  "cure",
  "damage",
  "decrease",
  "delay",
  "demand",
  "desire",
  "despair",
  "diet",
  "discount",
  "disguise",
  "display",
  "document",
  "download",
  "draft",
  "drill",
  "escape",
  "estimate",
  "export",
  "favour",
  "feature",
  "figure",
  "file",
  "flash",
  "flood",
  "flow",
  "fold",
  "forecast",
  "frame",
  "frost",
  "function",
  "fund",
  "gain",
  "grab",
  "grant",
  "grasp",
  "guarantee",
  "handle",
  "harm",
  "harvest",
  "hike",
  "hire",
  "honour",
  "host",
  "hug",
  "hunt",
  "impact",
  "import",
  "input",
  "iron",
  "issue",
  "jam",
  "jog",
  "judge",
  "label",
  "lack",
  "launch",
  "leak",
  "leap",
  "limit",
  "link",
  "loan",
  "log",
  "mail",
  "march",
  "master",
  "measure",
  "mirror",
  "monitor",
  "mount",
  "murder",
  "nail",
  "net",
  "network",
  "orbit",
  "outline",
  "output",
  "pack",
  "package",
  "panic",
  "parade",
  "parcel",
  "pedal",
  "permit",
  "pirate",
  "plot",
  "plug",
  "poison",
  "polish",
  "pose",
  "position",
  "preserve",
  "press",
  "process",
  "profit",
  "protest",
  "purchase",
  "puzzle",
  "quote",
  "range",
  "rank",
  "rap",
  "rate",
  "recall",
  "reform",
  "regard",
  "register",
  "reject",
  "relay",
  "release",
  "rent",
  "request",
  "reserve",
  "resolve",
  "respect",
  "respond",
  "result",
  "retire",
  "reward",
  "rhyme",
  "roar",
  "roast",
  "roll",
  "sail",
  "sample",
  "scare",
  "scream",
  "search",
  "seed",
  "sequence",
  "shade",
  "shadow",
  "shape",
  "share",
  "shave",
  "shift",
  "shoot",
  "show",
  "signal",
  "sink",
  "site",
  "skateboard",
  "ski",
  "skip",
  "slap",
  "sleep",
  "slice",
  "slide",
  "slip",
  "snack",
  "sneeze",
  "soil",
  "sort",
  "sow",
  "space",
  "spark",
  "speed",
  "spell",
  "spend",
  "spill",
  "spin",
  "spit",
  "split",
  "spoil",
  "sponsor",
  "spot",
  "spray",
  "spread",
  "spring",
  "spy",
  "square",
  "stage",
  "stain",
  "stamp",
  "stand",
  "stare",
  "start",
  "starve",
  "state",
  "station",
  "stay",
  "steam",
  "step",
  "stew",
  "stick",
  "sting",
  "stir",
  "stock",
  "stone",
  "stop",
  "store",
  "storm",
  "strain",
  "stream",
  "stretch",
  "string",
  "stuff",
  "style",
  "subject",
  "suit",
  "sum",
  "support",
  "surf",
  "surface",
  "surprise",
  "surround",
  "suspect",
  "swallow",
  "swear",
  "sweat",
  "sweep",
  "swell",
  "swim",
  "swing",
  "switch",
  "symbol",
  "tackle",
  "tailor",
  "tap",
  "target",
  "taste",
  "tax",
  "tear",
  "tease",
  "temper",
  "tend",
  "test",
  "threat",
  "thunder",
  "tick",
  "tie",
  "tip",
  "title",
  "toast",
  "tone",
  "top",
  "total",
  "touch",
  "tour",
  "towel",
  "trace",
  "track",
  "trade",
  "train",
  "transfer",
  "transform",
  "transport",
  "treasure",
  "treat",
  "trick",
  "trip",
  "trouble",
  "trust",
  "try",
  "tune",
  "tunnel",
  "turn",
  "tutor",
  "twin",
  "type",
  "update",
  "upset",
  "urge",
  "use",
  "utter",
  "value",
  "view",
  "visit",
  "voice",
  "volunteer",
  "vote",
  "voyage",
  "wage",
  "wait",
  "wake",
  "walk",
  "wander",
  "want",
  "ward",
  "warm",
  "warn",
  "wash",
  "waste",
  "watch",
  "water",
  "wear",
  "weather",
  "weed",
  "weep",
  "weigh",
  "welcome",
  "wheel",
  "whisper",
  "will",
  "win",
  "wind",
  "wing",
  "wipe",
  "wire",
  "wish",
  "witness",
  "wonder",
  "worry",
  "wound",
  "wrap",
  "wrestle",
  "wrinkle",
  "wrong",
  "yield",
  "zone",
  "amaze",
  "annoy",
  "confuse",
  "frighten",
  "injure",
  "embarrass",
  "disappoint",
  "satisfy",
  "convince",
  "depress",
  "inspire",
  "motivate",
  "fascinate",
  "astonish",
  "exhaust",
  "terrify",
  "horrify",
  "addict",
  "base",
  "advance",
  "locate",
  "equip",
]);

const NOUN_WHITELIST = new Set([
  "look",
  "sign",
  "work",
  "study",
  "play",
  "plan",
  "change",
  "design",
  "focus",
  "challenge",
  "debate",
  "exchange",
  "lecture",
  "schedule",
  "struggle",
  "rescue",
  "ruin",
  "shelter",
  "shock",
  "stress",
  "strike",
  "supply",
  "trap",
  "wave",
  "whistle",
  "account",
  "aim",
  "alarm",
  "approach",
  "attack",
  "attempt",
  "award",
  "balance",
  "battle",
  "benefit",
  "charge",
  "chat",
  "click",
  "comment",
  "conduct",
  "contact",
  "contrast",
  "crowd",
  "cure",
  "damage",
  "decrease",
  "delay",
  "demand",
  "desire",
  "despair",
  "diet",
  "discount",
  "disguise",
  "display",
  "document",
  "download",
  "draft",
  "drill",
  "escape",
  "estimate",
  "export",
  "favour",
  "feature",
  "figure",
  "file",
  "flash",
  "flood",
  "flow",
  "fold",
  "forecast",
  "frame",
  "frost",
  "function",
  "fund",
  "gain",
  "grab",
  "grant",
  "grasp",
  "guarantee",
  "handle",
  "harm",
  "harvest",
  "hike",
  "hire",
  "honour",
  "host",
  "hug",
  "hunt",
  "impact",
  "import",
  "input",
  "iron",
  "issue",
  "jam",
  "jog",
  "judge",
  "label",
  "lack",
  "launch",
  "leak",
  "leap",
  "limit",
  "link",
  "loan",
  "log",
  "mail",
  "march",
  "master",
  "measure",
  "mirror",
  "monitor",
  "mount",
  "murder",
  "nail",
  "net",
  "network",
  "orbit",
  "outline",
  "output",
  "pack",
  "package",
  "panic",
  "parade",
  "parcel",
  "pedal",
  "permit",
  "pirate",
  "plot",
  "plug",
  "poison",
  "polish",
  "pose",
  "position",
  "preserve",
  "press",
  "process",
  "profit",
  "protest",
  "purchase",
  "puzzle",
  "quote",
  "range",
  "rank",
  "rap",
  "rate",
  "recall",
  "reform",
  "regard",
  "register",
  "reject",
  "relay",
  "release",
  "rent",
  "request",
  "reserve",
  "resolve",
  "respect",
  "result",
  "reward",
  "rhyme",
  "roar",
  "roast",
  "roll",
  "sail",
  "sample",
  "scare",
  "scream",
  "search",
  "seed",
  "sequence",
  "shade",
  "shadow",
  "shape",
  "share",
  "shave",
  "shift",
  "shoot",
  "show",
  "signal",
  "sink",
  "site",
  "skateboard",
  "ski",
  "skip",
  "slap",
  "sleep",
  "slice",
  "slide",
  "slip",
  "snack",
  "sneeze",
  "soil",
  "sort",
  "sow",
  "space",
  "spark",
  "speed",
  "spell",
  "spend",
  "spill",
  "spin",
  "spit",
  "split",
  "spoil",
  "sponsor",
  "spot",
  "spray",
  "spread",
  "spring",
  "spy",
  "square",
  "stage",
  "stain",
  "stamp",
  "stand",
  "stare",
  "start",
  "state",
  "station",
  "stay",
  "steam",
  "step",
  "stew",
  "stick",
  "sting",
  "stir",
  "stock",
  "stone",
  "stop",
  "store",
  "storm",
  "strain",
  "stream",
  "stretch",
  "string",
  "stuff",
  "style",
  "subject",
  "suit",
  "sum",
  "support",
  "surf",
  "surface",
  "surprise",
  "suspect",
  "swallow",
  "sweat",
  "sweep",
  "swell",
  "swim",
  "swing",
  "switch",
  "symbol",
  "tackle",
  "tailor",
  "tap",
  "target",
  "taste",
  "tax",
  "tear",
  "tease",
  "temper",
  "test",
  "threat",
  "thunder",
  "tick",
  "tie",
  "tip",
  "title",
  "toast",
  "tone",
  "top",
  "total",
  "touch",
  "tour",
  "towel",
  "trace",
  "track",
  "trade",
  "train",
  "transfer",
  "transport",
  "treasure",
  "treat",
  "trick",
  "trip",
  "trouble",
  "trust",
  "try",
  "tune",
  "tunnel",
  "turn",
  "tutor",
  "twin",
  "type",
  "update",
  "upset",
  "urge",
  "use",
  "value",
  "view",
  "visit",
  "voice",
  "volunteer",
  "vote",
  "voyage",
  "wage",
  "wait",
  "wake",
  "walk",
  "wander",
  "want",
  "ward",
  "warm",
  "wash",
  "waste",
  "watch",
  "water",
  "wear",
  "weather",
  "weed",
  "weight",
  "welcome",
  "wheel",
  "whisper",
  "will",
  "win",
  "wind",
  "wing",
  "wipe",
  "wire",
  "wish",
  "witness",
  "wonder",
  "worry",
  "wound",
  "wrap",
  "wrinkle",
  "wrong",
  "yield",
  "zone",
]);

const ADJ_WHITELIST = new Set([
  "calm",
  "flat",
  "fluent",
  "formal",
  "forward",
  "junior",
  "senior",
  "major",
  "minor",
  "narrow",
  "native",
  "official",
  "positive",
  "negative",
  "slim",
  "specific",
  "suitable",
  "unique",
  "average",
  "aware",
  "capable",
  "chief",
  "classic",
  "classical",
  "convenient",
  "creative",
  "due",
  "eager",
  "effective",
  "extinct",
  "false",
  "familiar",
  "former",
  "generous",
  "gradual",
  "historic",
  "historical",
  "illegal",
  "legal",
  "individual",
  "likely",
  "living",
  "mass",
  "military",
  "nearby",
  "net",
  "ordinary",
  "original",
  "overseas",
  "particular",
  "plain",
  "previous",
  "professional",
  "quality",
  "resident",
  "romantic",
  "rude",
  "sacred",
  "sensory",
  "sharp",
  "shallow",
  "solar",
  "sufficient",
  "super",
  "tough",
  "typical",
  "unusual",
  "various",
  "virtual",
  "worthwhile",
  "brief",
  "broad",
  "commercial",
  "current",
  "diverse",
  "energetic",
  "ethnic",
  "evil",
  "external",
  "internal",
  "faint",
  "fancy",
  "faraway",
  "fatal",
  "financial",
  "flexible",
  "frank",
  "giant",
  "grateful",
  "herbal",
  "horrible",
  "independent",
  "inner",
  "outer",
  "intelligent",
  "joyful",
  "keen",
  "lunar",
  "material",
  "medium",
  "mental",
  "merry",
  "mild",
  "moral",
  "neat",
  "normal",
  "abnormal",
  "odd",
  "ongoing",
  "passive",
  "plastic",
  "pleased",
  "pleasant",
  "poisonous",
  "precious",
  "pregnant",
  "regular",
  "religious",
  "roast",
  "scared",
  "spicy",
  "upper",
  "willing",
  "accurate",
  "academic",
  "adorable",
  "alternative",
  "appropriate",
  "artificial",
  "ashamed",
  "automatic",
  "available",
  "botanical",
  "chemical",
  "constant",
  "conventional",
  "critical",
  "crucial",
  "deceased",
  "distinct",
  "distant",
  "domestic",
  "efficient",
  "electrical",
  "electric",
  "enormous",
  "essential",
  "extraordinary",
  "fake",
  "gentle",
  "identical",
  "incredible",
  "instant",
  "intense",
  "liquid",
  "lower",
  "nonverbal",
  "numerous",
  "nutritional",
  "nutritious",
  "objective",
  "subjective",
  "organic",
  "polar",
  "potential",
  "rare",
  "relevant",
  "reliable",
  "remarkable",
  "remote",
  "rewarding",
  "routine",
  "rural",
  "urban",
  "salty",
  "scientific",
  "secure",
  "slight",
  "sour",
  "splendid",
  "superb",
  "twin",
  "vast",
  "visible",
  "vital",
  "widespread",
  "abstract",
  "acid",
  "ambitious",
  "antique",
  "awesome",
  "bold",
  "bound",
  "brilliant",
  "coherent",
  "competent",
  "complex",
  "concrete",
  "consistent",
  "contradictory",
  "contrary",
  "dairy",
  "desperate",
  "dramatic",
  "elderly",
  "elegant",
  "exceptional",
  "fellow",
  "firm",
  "foggy",
  "freezing",
  "fundamental",
  "gifted",
  "ideal",
  "initial",
  "logical",
  "loose",
  "manual",
  "massive",
  "mature",
  "mechanical",
  "minimum",
  "maximum",
  "misty",
  "modest",
  "multiple",
  "optimistic",
  "pessimistic",
  "outstanding",
  "overall",
  "overwhelming",
  "patriotic",
  "practical",
  "prior",
  "pure",
  "raw",
  "reasonable",
  "severe",
  "solid",
  "spectacular",
  "stable",
  "steady",
  "substantial",
  "surrounding",
  "tight",
  "tremendous",
  "urgent",
  "vivid",
  "annual",
  "arched",
  "artistic",
  "barren",
  "bitter",
  "blank",
  "bronze",
  "civil",
  "comprehensive",
  "contemporary",
  "corporate",
  "cosy",
  "cruel",
  "damp",
  "decent",
  "delicate",
  "dominant",
  "dynamic",
  "enthusiastic",
  "folk",
  "fond",
  "genuine",
  "habitable",
  "harmonious",
  "humanistic",
  "humble",
  "influential",
  "innocent",
  "literary",
  "loyal",
  "memorial",
  "miserable",
  "moderate",
  "monthly",
  "weekly",
  "noble",
  "nuclear",
  "permanent",
  "temporary",
  "physical",
  "precise",
  "primitive",
  "qualified",
  "racial",
  "realistic",
  "representative",
  "respective",
  "rough",
  "selfish",
  "sensitive",
  "sugary",
  "sustainable",
  "sympathetic",
  "thorough",
  "tropical",
  "utter",
  "visual",
  "worldwide",
  "worthy",
  "absurd",
  "alien",
  "blurred",
  "cardiac",
  "communist",
  "disabled",
  "dusty",
  "grand",
  "graphic",
  "greedy",
  "guilty",
  "hazy",
  "hollow",
  "hypothetical",
  "iconic",
  "intermediate",
  "joint",
  "leftover",
  "licensed",
  "located",
  "manned",
  "marine",
  "maritime",
  "merchant",
  "political",
  "premier",
  "ridiculous",
  "rigid",
  "ripe",
  "royal",
  "secondary",
  "socialist",
  "straightforward",
  "superior",
  "underwater",
  "uniform",
  "violent",
  "good",
  "bad",
  "big",
  "small",
  "tall",
  "short",
  "long",
  "wide",
  "deep",
  "high",
  "happy",
  "easy",
  "heavy",
  "early",
  "fast",
  "slow",
  "hard",
  "warm",
  "cold",
  "hot",
  "clean",
  "clear",
  "safe",
  "true",
]);

const IRREG_ADJ: Record<string, { er: string; est: string; adv: string }> = {
  good: { er: "better", est: "best", adv: "well" },
  well: { er: "better", est: "best", adv: "well" },
  bad: { er: "worse", est: "worst", adv: "badly" },
  ill: { er: "worse", est: "worst", adv: "badly" },
  far: { er: "farther / further", est: "farthest / furthest", adv: "far" },
  little: { er: "less", est: "least", adv: "little" },
  much: { er: "more", est: "most", adv: "much" },
  many: { er: "more", est: "most", adv: "—" },
  old: { er: "older / elder", est: "oldest / eldest", adv: "—" },
};

const CLOUD_DERIVATIVES_CACHE = new Map<string, CloudDerivativesCacheEntry | null>();

export function extractCoreBaseWord(entry: VocabEntry): string {
  let raw = String(entry.w || "")
    .replace(/\([^)]*\)/g, " ")
    .trim();
  if (raw.includes("/")) raw = (raw.split("/")[0] ?? "").trim();
  const cleaned = normalizeWordStr(raw)
    .replace(/\.\.\.|…/g, "")
    .trim();
  if (!cleaned.includes(" ")) return cleaned;
  const stopWords = new Set([
    "a",
    "an",
    "the",
    "to",
    "of",
    "in",
    "on",
    "at",
    "for",
    "with",
    "from",
    "by",
    "up",
    "out",
    "off",
    "down",
    "away",
    "over",
    "into",
    "onto",
    "sb",
    "sth",
    "one's",
    "oneself",
    "be",
    "do",
    "get",
    "make",
    "take",
    "give",
    "have",
    "keep",
    "set",
    "put",
    "turn",
    "come",
    "go",
    "no",
    "all",
    "as",
    "so",
    "even",
    "if",
  ]);
  const tokens = cleaned.split(/\s+/).filter((t) => /^[a-z-]+$/.test(t));
  const contentTokens = tokens.filter((t) => !stopWords.has(t) && t.length >= 3);
  return contentTokens[0] ?? tokens[0] ?? cleaned;
}

export function generateWordInflections(
  vocabList: VocabEntry[],
  entry: VocabEntry,
  coreWord?: string,
): InflectionItem[] {
  const w = coreWord || extractCoreBaseWord(entry);
  if (!w || !/^[a-z-]+$/.test(w)) return [];

  const baseCands = deinflectSingleToken(w);
  let baseWord = w;
  if (baseCands.length > 0) {
    const matchedInVocab = baseCands.find((c) =>
      vocabList.some((v) => (v._headLower || normalizeWordStr(v.w)) === c),
    );
    if (matchedInVocab) {
      baseWord = matchedInVocab;
    } else if (w.endsWith("ing") || w.endsWith("ed") || w.endsWith("ly") || w.endsWith("ies")) {
      baseWord = baseCands[0] ?? w;
    }
  }

  const posStr = String(entry.p || "").toLowerCase();
  const vowels = "aeiou";
  const isConsonant = (ch: string | undefined): boolean => Boolean(ch && !vowels.includes(ch));
  const isCVC = (str: string): boolean => {
    if (str.length < 3) return false;
    const c1 = str[str.length - 3];
    const v = str[str.length - 2];
    const c2 = str[str.length - 1];
    return Boolean(
      c1 &&
        v &&
        c2 &&
        isConsonant(c1) &&
        vowels.includes(v) &&
        isConsonant(c2) &&
        !["w", "x", "y"].includes(c2),
    );
  };

  const targetVerb = IRREG_VERB_TABLE[w] ? w : IRREG_VERB_TABLE[baseWord] ? baseWord : w;
  const canBeVerb = Boolean(
    posStr.includes("v") ||
      IRREG_VERB_TABLE[targetVerb] ||
      !posStr ||
      /(ate|ify|ise|ize|en)$/.test(targetVerb) ||
      VERB_WHITELIST.has(targetVerb),
  );

  const canBeNoun = Boolean(
    posStr.includes("n.") ||
      IRREG_PLURALS[w] ||
      /(tion|sion|ment|ness|ity|ance|ence|er|or|ist|ism|ship|age|ure|cy|th|dom|hood)$/.test(w) ||
      NOUN_WHITELIST.has(w),
  );

  const canBeAdj = Boolean(
    posStr.includes("adj") ||
      /(ful|less|ous|ive|able|ible|al|ic|ed|ing|ant|ent|ary|ory)$/.test(w) ||
      ADJ_WHITELIST.has(w),
  );

  const forms: InflectionItem[] = [];
  const seenFormKeys = new Set<string>();
  const addForm = (label: string, val: string): void => {
    const key = `${label}:${val}`;
    if (!val || seenFormKeys.has(key)) return;
    seenFormKeys.add(key);
    const cleanFirst = (val.split("/")[0] ?? "")
      .replace(/\([^)]*\)/g, "")
      .trim()
      .toLowerCase();
    const inCsv = vocabList.some(
      (v) =>
        (v._headLower || normalizeWordStr(v.w)) === cleanFirst ||
        normalizeWordStr(v.w) === cleanFirst,
    );
    forms.push({ label, val, inCsv });
  };

  addForm("词干 / 原形 (Base)", baseWord);
  if (baseWord !== w) {
    addForm("当前词条形态", w);
  }

  if (canBeVerb) {
    const vw = targetVerb;
    const irreg = IRREG_VERB_TABLE[vw];
    if (irreg) {
      addForm("第三人称单数 (-s)", irreg.s);
      addForm("现在分词 / 动名词 (-ing)", irreg.ing);
      addForm("过去式 (Past)", irreg.past);
      addForm("过去分词 (P.P.)", irreg.pp);
    } else {
      let sForm = `${vw}s`;
      if (vw.endsWith("y") && isConsonant(vw[vw.length - 2])) sForm = `${vw.slice(0, -1)}ies`;
      else if (/(s|x|ch|sh|o|z)$/.test(vw)) sForm = `${vw}es`;

      let ingForm = `${vw}ing`;
      if (vw.endsWith("ie")) ingForm = `${vw.slice(0, -2)}ying`;
      else if (vw.endsWith("e") && !vw.endsWith("ee") && !vw.endsWith("ye") && !vw.endsWith("oe")) {
        ingForm = `${vw.slice(0, -1)}ing`;
      } else if (DOUBLE_CONSONANT_WORDS.has(vw) || (vw.length <= 4 && isCVC(vw))) {
        ingForm = `${vw}${vw[vw.length - 1] ?? ""}ing`;
      } else if (vw === "panic") {
        ingForm = "panicking";
      }

      let edForm = `${vw}ed`;
      if (vw.endsWith("e")) edForm = `${vw}d`;
      else if (vw.endsWith("y") && isConsonant(vw[vw.length - 2])) edForm = `${vw.slice(0, -1)}ied`;
      else if (DOUBLE_CONSONANT_WORDS.has(vw) || (vw.length <= 4 && isCVC(vw))) {
        edForm = `${vw}${vw[vw.length - 1] ?? ""}ed`;
      } else if (vw === "panic") {
        edForm = "panicked";
      }

      addForm("第三人称单数 (-s)", sForm);
      addForm("现在分词 / 动名词 (-ing)", ingForm);
      addForm("过去式 (Past)", edForm);
      addForm("过去分词 (P.P.)", edForm);
    }
  }

  if (canBeNoun) {
    let plForm = "";
    const irregPl = IRREG_PLURALS[w];
    if (irregPl) {
      plForm = irregPl;
    } else if (w.endsWith("y") && isConsonant(w[w.length - 2])) {
      plForm = `${w.slice(0, -1)}ies`;
    } else if (/(s|x|ch|sh)$/.test(w)) {
      plForm = `${w}es`;
    } else if (w.endsWith("f") && !w.endsWith("ff")) {
      plForm = `${w.slice(0, -1)}ves / ${w}s`;
    } else if (w.endsWith("fe")) {
      plForm = `${w.slice(0, -2)}ves`;
    } else {
      plForm = `${w}s`;
    }
    addForm("名词复数 (Plural)", plForm);
  }

  if (canBeAdj) {
    const irregAdj = IRREG_ADJ[w];
    if (irregAdj) {
      addForm("形容词比较级", irregAdj.er);
      addForm("形容词最高级", irregAdj.est);
    } else if (w.length <= 6 && !/(ful|less|ous|ive|able|ible|al|ic|ed|ing|ant|ent)$/.test(w)) {
      let er = `${w}er`;
      let est = `${w}est`;
      if (w.endsWith("e")) {
        er = `${w}r`;
        est = `${w}st`;
      } else if (w.endsWith("y") && isConsonant(w[w.length - 2])) {
        er = `${w.slice(0, -1)}ier`;
        est = `${w.slice(0, -1)}iest`;
      } else if (isCVC(w)) {
        const last = w[w.length - 1] ?? "";
        er = `${w}${last}er`;
        est = `${w}${last}est`;
      }
      addForm("形容词比较级 (-er)", er);
      addForm("形容词最高级 (-est)", est);
    } else {
      addForm("比较级 (Comparative)", `more ${w}`);
      addForm("最高级 (Superlative)", `most ${w}`);
    }

    if (!w.endsWith("ly")) {
      let adv = `${w}ly`;
      if (w.endsWith("y") && isConsonant(w[w.length - 2])) adv = `${w.slice(0, -1)}ily`;
      else if (w.endsWith("le") && isConsonant(w[w.length - 3])) adv = `${w.slice(0, -1)}y`;
      else if (w.endsWith("ic")) adv = `${w}ally`;
      else if (w === "true") adv = "truly";
      else if (w === "whole") adv = "wholly";
      else if (w === "full") adv = "fully";
      addForm("副词形式 (-ly)", adv);
    }
  }

  return forms;
}

export function getMorphologicalRoot(word: string): string {
  const w = normalizeWordStr(word);
  if (!w || w.includes(" ")) return w;
  const suffixes = [
    "isation",
    "ization",
    "ational",
    "fulness",
    "ousness",
    "iveness",
    "ability",
    "ibility",
    "cation",
    "ition",
    "ation",
    "ingly",
    "edly",
    "fully",
    "lessly",
    "ment",
    "ness",
    "ship",
    "ance",
    "ence",
    "ancy",
    "ency",
    "able",
    "ible",
    "tion",
    "sion",
    "ious",
    "eous",
    "less",
    "ful",
    "ous",
    "ive",
    "ist",
    "ism",
    "ant",
    "ent",
    "ary",
    "ory",
    "ize",
    "ise",
    "ify",
    "ate",
    "ing",
    "ed",
    "er",
    "or",
    "ly",
    "al",
    "ic",
    "en",
    "y",
  ];
  let root = w;
  for (const suf of suffixes) {
    if (root.endsWith(suf) && root.length - suf.length >= 3) {
      root = root.slice(0, -suf.length);
      break;
    }
  }
  if (root.endsWith("e") && root.length >= 4) {
    root = root.slice(0, -1);
  }
  return root;
}

export async function fetchCloudDerivativesIfNeeded(
  targetCore: string,
  onUpdated: (cleanWord: string) => void,
): Promise<void> {
  if (!targetCore) return;
  const cleanW = targetCore.toLowerCase().trim();
  if (CLOUD_DERIVATIVES_CACHE.has(cleanW)) return;

  try {
    const res = await fetch(`/api/derivatives?q=${encodeURIComponent(cleanW)}`);
    if (!res.ok) {
      CLOUD_DERIVATIVES_CACHE.set(cleanW, null);
      return;
    }
    const data = (await res.json()) as DerivativesApiResponse;
    if (
      data &&
      data.status === "ok" &&
      Array.isArray(data.derivatives) &&
      data.derivatives.length > 0
    ) {
      CLOUD_DERIVATIVES_CACHE.set(cleanW, {
        rootGroup: data.rootGroup || "",
        derivatives: data.derivatives,
      });
      onUpdated(cleanW);
    } else {
      CLOUD_DERIVATIVES_CACHE.set(cleanW, null);
    }
  } catch {
    CLOUD_DERIVATIVES_CACHE.set(cleanW, null);
  }
}

export function findCognatesAndPhrases(
  vocabList: VocabEntry[],
  entry: VocabEntry,
  coreWord?: string,
): {
  coreWord: string;
  rootGroupTitle: string;
  cognates: CognateItem[];
  phrases: VocabEntry[];
} {
  const targetCore = coreWord || extractCoreBaseWord(entry);
  const targetRoot = getMorphologicalRoot(targetCore);
  const entryWLower = normalizeWordStr(entry.w);

  const matchedFamily = COMPLETE_ROOT_FAMILIES.find(
    (fam) =>
      fam.triggers.includes(targetCore) ||
      fam.members.some((m) => normalizeWordStr(m.w) === targetCore),
  );

  const cloudCached = CLOUD_DERIVATIVES_CACHE.get(targetCore) ?? null;

  const cognates: CognateItem[] = [];
  const phrases: VocabEntry[] = [];
  const seenWords = new Set<string>([entryWLower, targetCore]);

  const addCognateItem = (
    wordStr: string,
    posStr: string,
    meanStr: string,
    isCloudD1: boolean,
  ): void => {
    const normW = normalizeWordStr(wordStr);
    if (!normW || seenWords.has(normW)) return;
    seenWords.add(normW);

    const csvMatch = vocabList.find(
      (v) => (v._headLower || normalizeWordStr(v.w)) === normW || normalizeWordStr(v.w) === normW,
    );
    if (csvMatch) {
      cognates.push({
        w: csvMatch.w,
        p: csvMatch.p || posStr,
        m: csvMatch.m || meanStr,
        b: csvMatch.b,
        u: csvMatch.u,
        f: csvMatch.f,
        inCsv: true,
      });
    } else {
      cognates.push({
        w: wordStr,
        p: posStr,
        m: meanStr,
        b: isCloudD1 ? "D1云端词族库" : "拓展同根词库",
        u: "非CSV",
        f: "拓展",
        inCsv: false,
        fromCloud: isCloudD1,
      });
    }
  };

  if (matchedFamily) {
    for (const mem of matchedFamily.members) {
      addCognateItem(mem.w, mem.p, mem.m, false);
    }
  }

  if (cloudCached && Array.isArray(cloudCached.derivatives)) {
    for (const mem of cloudCached.derivatives) {
      const w = mem.word || mem.w || "";
      if (!w) continue;
      addCognateItem(w, mem.pos || mem.p || "", mem.meaning || mem.m || "", true);
    }
  }

  for (const item of vocabList) {
    const itemWLower = normalizeWordStr(item.w);
    const itemHead = item._headLower || itemWLower;
    const isItemPhrase = itemHead.includes(" ");

    if (isItemPhrase) {
      if (itemWLower === entryWLower) continue;
      const esc = escapeRegExp(targetCore);
      const re = new RegExp(`(^|[^a-z])${esc}([^a-z]|$)`, "i");
      if (re.test(itemWLower) && !phrases.some((p) => normalizeWordStr(p.w) === itemWLower)) {
        phrases.push(item);
      }
    } else {
      if (seenWords.has(itemWLower)) continue;
      const itemCore = extractCoreBaseWord(item);
      const itemRoot = getMorphologicalRoot(itemCore);
      const sharesMorphRoot =
        targetRoot.length >= 3 &&
        (itemRoot === targetRoot ||
          (targetCore.length >= 4 &&
            (itemCore.startsWith(targetCore) || targetCore.startsWith(itemCore))) ||
          (targetRoot.length >= 4 &&
            (itemCore.startsWith(targetRoot) || itemCore.endsWith(targetCore))));
      if (sharesMorphRoot) {
        addCognateItem(item.w, item.p, item.m, false);
      }
    }
  }

  const finalTitle = matchedFamily
    ? matchedFamily.rootName
    : cloudCached?.rootGroup
      ? cloudCached.rootGroup
      : targetRoot.length >= 3
        ? `词根/词族: ${targetRoot}-`
        : `核心词: ${targetCore}`;

  return {
    coreWord: targetCore,
    rootGroupTitle: finalTitle,
    cognates: cognates.slice(0, 30),
    phrases: phrases.slice(0, 12),
  };
}

export function parsePolysemySenses(
  entry: VocabEntry,
): Array<{ index: number; pos: string; meaning: string }> {
  const rawP = String(entry.p || "").trim();
  const rawM = String(entry.m || "").trim();
  if (!rawM) return [];
  const segments = rawM
    .split(/[；;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return segments.map((seg, idx) => ({
    index: idx + 1,
    pos: rawP || "词性/义项",
    meaning: seg,
  }));
}

export function generateWordDetailData(
  vocabList: VocabEntry[],
  entry: VocabEntry,
): WordDetailData | null {
  if (!entry) return null;
  const coreWord = extractCoreBaseWord(entry);
  const isCet4 = Boolean(entry.b && (entry.b.includes("四级") || entry.b.includes("CET-4")));
  const isCet6 = Boolean(entry.b && (entry.b.includes("六级") || entry.b.includes("CET-6")));
  const isBold = entry.f === "黑体";
  const isExtended = entry.inCsv === false || entry.b === "拓展同根词库";
  const isProper = Boolean(entry.n?.includes("专有名词"));

  let badgesHtml = "";
  if (isCet4) {
    badgesHtml +=
      '<span class="inline-flex items-center text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-md">🎓 大学英语四级 (CET-4)</span>';
  } else if (isCet6) {
    badgesHtml +=
      '<span class="inline-flex items-center text-[11px] font-semibold bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-md">🎓 大学英语六级 (CET-6)</span>';
  } else if (isExtended) {
    badgesHtml +=
      '<span class="inline-flex items-center text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md">✨ 课外同根拓展词</span>';
  } else {
    badgesHtml += isBold
      ? '<span class="inline-flex items-center text-[11px] font-semibold bg-gray-900 text-white px-2 py-0.5 rounded-md">黑体 · 重点词</span>'
      : '<span class="inline-flex items-center text-[11px] font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md">白体 · 认读词</span>';
  }
  if (isProper) {
    badgesHtml +=
      '<span class="inline-flex items-center text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-md">△ 专有名词</span>';
  }
  if (coreWord && coreWord !== normalizeWordStr(entry.w)) {
    badgesHtml += `<span class="inline-flex items-center text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-md">核心词干: ${escapeHtml(coreWord)}</span>`;
  }

  const normW = normalizeWordStr(entry.w);
  const allOccurrences = vocabList.filter(
    (e) =>
      normalizeWordStr(e.w) === normW ||
      (e._headLower && e._headLower === (entry._headLower || normW)),
  );

  const textbookSenses = parsePolysemySenses(entry);
  const extraPolysemy = CORE_POLYSEMY_EXTRAS[coreWord] || CORE_POLYSEMY_EXTRAS[normW] || [];
  const inflections = generateWordInflections(vocabList, entry, coreWord);
  const familyData = findCognatesAndPhrases(vocabList, entry, coreWord);

  const inCsvCognateCount = familyData.cognates.filter((c) => c.inCsv).length;
  const extCognateCount = familyData.cognates.length - inCsvCognateCount;

  let bodyHtml = `
    <div class="ios-card p-3.5 space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-xs font-bold text-gray-800 flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-[#007AFF]"></span>
          📍 课本与大纲收录情况（${allOccurrences.length > 0 ? `共 ${allOccurrences.length} 处` : "未单独收录于词库，以下为完整拓展卡片"}）
        </span>
      </div>
      ${
        allOccurrences.length > 0
          ? `<div class="space-y-1.5">
          ${allOccurrences
            .map((occ) => {
              const isOccCet4 = occ.b && (occ.b.includes("四级") || occ.b.includes("CET-4"));
              const isOccCet6 = occ.b && (occ.b.includes("六级") || occ.b.includes("CET-6"));
              const cardBg = isOccCet4
                ? "bg-indigo-50/60 border-indigo-100"
                : isOccCet6
                  ? "bg-purple-50/60 border-purple-100"
                  : "bg-blue-50/60 border-blue-100";
              const titleColor = isOccCet4
                ? "text-indigo-950"
                : isOccCet6
                  ? "text-purple-950"
                  : "text-blue-950";
              const icon = isOccCet4 || isOccCet6 ? "🎓" : "📘";
              return `
              <div class="${cardBg} border rounded-xl p-2.5 flex items-center justify-between gap-2">
                <div>
                  <div class="text-xs font-bold ${titleColor}">${icon} ${escapeHtml(getShortBookName(occ.b))} · ${escapeHtml(formatUnitLabel(occ.u))}</div>
                  <div class="text-[11px] text-gray-600 mt-0.5">${escapeHtml(occ.p ? `[${occ.p}] ` : "")}${escapeHtml(occ.m)}</div>
                </div>
                <span class="text-[10px] font-semibold px-2 py-0.5 rounded ${occ.f === "黑体" ? "bg-gray-900 text-white" : "bg-white text-gray-600 border border-gray-200"} shrink-0">${escapeHtml(occ.f || "核心")}</span>
              </div>
            `;
            })
            .join("")}
        </div>`
          : `<div class="bg-emerald-50/60 border border-emerald-100 rounded-xl p-2.5 text-xs text-emerald-900">
          该词（<strong>${escapeHtml(entry.w)}</strong>）属于课外拓展/变形词，虽未单独列于 CSV 词表中，已为您完整生成其<strong>所有不同形式</strong>与<strong>全部同根词家族</strong>。
        </div>`
      }
    </div>
  `;

  if (inflections.length > 0) {
    bodyHtml += `
      <div class="ios-card p-3.5 space-y-2.5">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-gray-800 flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-blue-500"></span>
            🔄 所有不同形式（全形态词形变化：${escapeHtml(coreWord)}）
          </span>
          <span class="text-[10px] text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded">含非CSV全变形 · 点击发音</span>
        </div>
        <div class="grid grid-cols-2 gap-2">
          ${inflections
            .map((inf) => {
              const speakTarget = (inf.val.split("/")[0] ?? "").replace(/\([^)]*\)/g, "").trim();
              return `
            <button type="button" data-speak-word="${escapeHtml(speakTarget)}" class="speak-btn ios-btn-active text-left bg-purple-50/60 border border-purple-100 rounded-xl p-2.5">
              <div class="flex items-center justify-between gap-1">
                <span class="text-[10px] font-medium text-purple-700">${escapeHtml(inf.label)}</span>
                ${inf.inCsv ? '<span class="text-[10px] bg-blue-50 text-blue-600 px-1 rounded">课本词</span>' : ""}
              </div>
              <div class="text-sm font-bold text-purple-900 mt-0.5 break-words">${escapeHtml(inf.val)}</div>
            </button>
          `;
            })
            .join("")}
        </div>
      </div>
    `;
  }

  if (familyData.cognates.length > 0) {
    bodyHtml += `
      <div class="ios-card p-3.5 space-y-2.5">
        <div class="flex items-center justify-between flex-wrap gap-1">
          <span class="text-xs font-bold text-gray-800 flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-[#34C759]"></span>
            🌱 所有同根词与派生词（共 ${familyData.cognates.length} 个）
          </span>
          ${familyData.rootGroupTitle ? `<span class="text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-md">${escapeHtml(familyData.rootGroupTitle)}</span>` : ""}
        </div>
        <div class="text-[11px] text-gray-500">
          已列出全部真实同根词（其中课本收录 <strong>${inCsvCognateCount}</strong> 个${extCognateCount > 0 ? `，权威词族拓展 <strong>${extCognateCount}</strong> 个` : ""}）。点击任意词条可切换查看其卡片：
        </div>
        <div class="space-y-1.5">
          ${familyData.cognates
            .map(
              (cog) => `
            <button
              type="button"
              data-open-word="${escapeHtml(cog.w)}"
              data-open-book="${escapeHtml(cog.b)}"
              data-open-pos="${escapeHtml(cog.p || "")}"
              data-open-mean="${escapeHtml(cog.m || "")}"
              data-open-incsv="${cog.inCsv ? "1" : "0"}"
              class="modal-jump-word-btn ios-btn-active w-full text-left ${cog.inCsv ? "bg-gray-50/90 border-gray-200/80" : "bg-emerald-50/60 border-emerald-200"} hover:bg-blue-50 border rounded-xl p-2.5 flex items-center justify-between gap-2"
            >
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="font-bold text-sm ${cog.inCsv ? "text-[#007AFF]" : "text-emerald-900"}">${escapeHtml(cog.w)}</span>
                  ${cog.p ? `<span class="text-[11px] italic text-gray-500">${escapeHtml(cog.p)}</span>` : ""}
                  ${cog.inCsv && cog.f === "黑体" ? '<span class="text-[10px] bg-gray-900 text-white px-1.5 py-0.2 rounded">黑体</span>' : ""}
                </div>
                <div class="text-xs text-gray-600 mt-0.5 break-words">${escapeHtml(cog.m)}</div>
              </div>
              ${
                cog.inCsv
                  ? `<span class="text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-1 rounded-lg shrink-0">
                  📘 ${escapeHtml(getShortBookName(cog.b))} · ${escapeHtml(formatShortUnitBadge(cog.u))} ›
                </span>`
                  : `<span class="text-[10px] font-semibold text-emerald-700 bg-white border border-emerald-200 px-2 py-1 rounded-lg shrink-0">
                  ✨ 词族拓展 ›
                </span>`
              }
            </button>
          `,
            )
            .join("")}
        </div>
      </div>
    `;
  } else {
    bodyHtml += `
      <div class="ios-card p-3.5 space-y-1.5">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-gray-800 flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-gray-400"></span>
            🌱 同根词与派生词
          </span>
          <span class="text-[11px] text-gray-400">暂无拓展词族</span>
        </div>
        <div class="text-[11px] text-gray-500 leading-relaxed">
          本词在高中与四六级词库及核心词族库中暂无其他派生词，重点掌握上方释义、变形与例句搭配即可。
        </div>
      </div>
    `;
  }

  bodyHtml += `
    <div class="ios-card p-3.5 space-y-2.5">
      <div class="flex items-center justify-between">
        <span class="text-xs font-bold text-gray-800 flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-[#34C759]"></span>
          📖 一词多义与词性详解
        </span>
        <span class="text-[11px] text-gray-400">共 ${textbookSenses.length + extraPolysemy.length} 个义项维度</span>
      </div>
      <div class="space-y-1.5">
        ${textbookSenses
          .map(
            (s) => `
          <div class="bg-gray-50/90 border border-gray-100 rounded-xl p-2.5 flex items-start gap-2">
            <span class="w-5 h-5 rounded-full bg-blue-50 text-blue-700 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">${s.index}</span>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="text-[11px] font-semibold italic text-blue-600">${escapeHtml(s.pos)}</span>
                <span class="text-sm font-bold text-gray-900">${escapeHtml(s.meaning)}</span>
              </div>
            </div>
          </div>
        `,
          )
          .join("")}
        ${
          extraPolysemy.length > 0
            ? `<div class="pt-1">
            <div class="text-[11px] font-semibold text-emerald-700 mb-1.5">✨ 高考常见一词多义 / 熟词生义拓展（${escapeHtml(coreWord)}）：</div>
            <div class="space-y-1.5">
              ${extraPolysemy
                .map(
                  (ep) => `
                <div class="bg-emerald-50/60 border border-emerald-100 rounded-xl p-2.5">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="text-[11px] font-bold italic text-emerald-700 bg-white px-1.5 py-0.2 rounded border border-emerald-200">${escapeHtml(ep.pos)}</span>
                    <span class="text-xs font-bold text-gray-900">${escapeHtml(ep.mean)}</span>
                  </div>
                  ${ep.ex ? `<div class="text-[11px] text-gray-500 mt-1">例: ${escapeHtml(ep.ex)}</div>` : ""}
                </div>
              `,
                )
                .join("")}
            </div>
          </div>`
            : ""
        }
      </div>
    </div>
  `;

  if (familyData.phrases.length > 0) {
    bodyHtml += `
      <div class="ios-card p-3.5 space-y-2.5">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-gray-800 flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-[#007AFF]"></span>
            🔗 课本关联短语 / 搭配（${familyData.phrases.length} 个）
          </span>
        </div>
        <div class="space-y-1.5">
          ${familyData.phrases
            .map(
              (phr) => `
            <button type="button" data-open-word="${escapeHtml(phr.w)}" data-open-book="${escapeHtml(phr.b)}" data-open-incsv="1" class="modal-jump-word-btn ios-btn-active w-full text-left bg-blue-50/40 border border-blue-100 rounded-xl p-2.5 flex items-center justify-between gap-2">
              <div class="min-w-0 flex-1">
                <div class="font-bold text-sm text-gray-900">${escapeHtml(phr.w)}</div>
                <div class="text-xs text-gray-600 mt-0.5">${escapeHtml(phr.m)}</div>
              </div>
              <span class="text-[10px] font-semibold text-blue-700 bg-white border border-blue-200 px-2 py-1 rounded-lg shrink-0">
                ${escapeHtml(getShortBookName(phr.b))} · ${escapeHtml(formatShortUnitBadge(phr.u))} ›
              </span>
            </button>
          `,
            )
            .join("")}
        </div>
      </div>
    `;
  }

  return {
    word: entry.w,
    pos: entry.p || "",
    badgesHtml,
    bodyHtml,
  };
}
