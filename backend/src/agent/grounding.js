// Checks, in code, that constraints the model passes to tools were actually stated by the user.
// The brief says "do not invent" a budget or dietary preference; the model is told to ask, and
// these checks make that rule hold even if the model guesses anyway.

const UNITS = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

/** All numbers a user mentioned, from digits ("200", "1,500", "₹200") and simple English words ("two hundred and fifty"). */
export function extractNumbers(text) {
  const out = new Set();
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const n = Number(m[0].replace(/,/g, ""));
    if (Number.isFinite(n)) out.add(n);
  }
  const words = text
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
  let current = null;
  let total = 0;
  const flush = () => {
    if (current !== null || total) out.add(total + (current ?? 0));
    current = null;
    total = 0;
  };
  for (const w of words) {
    if (w in UNITS) current = (current ?? 0) + UNITS[w];
    else if (w in TENS) current = (current ?? 0) + TENS[w];
    else if (w === "hundred" && current !== null) current *= 100;
    else if (w === "thousand" && current !== null) {
      total += current * 1000;
      current = 0;
    } else if (w === "and" && current !== null) continue;
    else flush();
  }
  flush();
  return out;
}

const NON_VEG =
  /\b(non[\s-]?veg(etarian)?|nonveg|chicken|mutton|meat|fish|egg|prawn|beef|pork|asaivam)\b|அசைவ/i;
const VEG =
  /\b(veg|vegetarian|veggie|pure[\s-]?veg|plant[\s-]?based|saivam|paneer)\b|சைவ/i;
const ANY =
  /\b(any(thing)?|no (diet(ary)? )?preference|don'?t mind|doesn'?t matter|either( is fine)?|whatever|all food)\b/i;

/** Which dietary preferences the user has stated anywhere in the given texts. */
export function statedDiets(texts) {
  const found = new Set();
  for (const t of texts) {
    // Remove non-veg phrases before testing for "veg" so "non-veg" doesn't count as veg.
    if (NON_VEG.test(t)) found.add("non_veg");
    if (VEG.test(t.replace(new RegExp(NON_VEG.source, "gi"), " ")))
      found.add("veg");
    if (ANY.test(t)) found.add("any");
  }
  return found;
}

export function budgetIsGrounded(maxPrice, texts) {
  return texts.some((t) => extractNumbers(t).has(maxPrice));
}

export function dietIsGrounded(diet, texts) {
  return statedDiets(texts).has(diet);
}

const EXTERNAL_SERVICES =
  /\b(swiggy|zomato|uber\s?eats|dunzo|zepto|blinkit|instamart|magicpin|eatsure|domino'?s app)\b/i;

/** Requests to act on a real third-party service, which this sandbox cannot do. */
export function mentionsExternalService(text) {
  const m = text.match(EXTERNAL_SERVICES);
  return m ? m[0] : null;
}

const DIRECTIONS =
  /\b(direction|directions|navigate|navigation|route|map|maps|how (do i|to) get|take me|location|way to)\b|வழி|மேப்/i;
const LAST_ORDER =
  /\b(last|previous|recent|latest|my) (order|meal|pickup)\b|\bthat (order|place|restaurant)\b|கடைசி/i;

/** "Open directions for my last order" and similar: a phone action the code guarantees. */
export function wantsLastOrderDirections(text) {
  return DIRECTIONS.test(text) && LAST_ORDER.test(text);
}

const MAX_WORDS =
  /\b(below|under|less than|lesser than|within|max|maximum|no more than|not more than|up ?to|budget(?: of| is)?|cheaper than)\b/i;
const MIN_WORDS =
  /\b(above|over|more than|greater than|at least|min|minimum|starting|from)\b/i;

/**
 * Which direction the user's price words point, from their latest message:
 * 'max' ("under 200"), 'min' ("above 200"), 'both' ("between 200 and 300" / both kinds of words), or null.
 */
export function priceDirection(text) {
  if (/\bbetween\b/i.test(text)) return "both";
  const hasMax = MAX_WORDS.test(text);
  const hasMin = MIN_WORDS.test(text.replace(/\bmore than\b(?=.*\bno\b)/i, ""));
  if (hasMax && hasMin)
    return /\bno more than|not more than\b/i.test(text) &&
      !/\b(above|over|at least|minimum)\b/i.test(text)
      ? "max"
      : "both";
  if (hasMax) return "max";
  if (hasMin) return "min";
  return null;
}
