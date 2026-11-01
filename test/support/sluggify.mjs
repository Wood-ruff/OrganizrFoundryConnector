const WORD = String.raw`[\p{Alphabetic}\p{Mark}\p{Decimal_Number}\p{Join_Control}]`;
const NON_WORD = new RegExp(String.raw`[^\p{Alphabetic}\p{Mark}\p{Decimal_Number}\p{Join_Control}]`, "gu");
const CAMEL_BOUNDARY = new RegExp(String.raw`(\p{Lowercase_Letter})(\p{Uppercase_Letter}(?=^|$|${WORD}))`, "gu");

/** A test port of pf2e's default `sluggify` ("Fighter Weapon Mastery (Sword)" → "fighter-weapon-mastery-sword"). */
export function sluggify(text) {
  if (typeof text !== "string") return "";
  if (text === "-") return text;
  return text
    .replace(CAMEL_BOUNDARY, "$1-$2")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(NON_WORD, " ")
    .trim()
    .replace(/[-\s]+/g, "-");
}
