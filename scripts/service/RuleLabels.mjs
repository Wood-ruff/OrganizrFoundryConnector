const KEY_PREFIX = "PF2E.";

/** A copy of the export data whose custom resistance rule labels are localized when they are pf2e lang keys. */
export function withLocalizedResistanceLabels(data, localize) {
  if (!Array.isArray(data?.items)) return data;
  return { ...data, items: data.items.map((item) => withLocalizedRules(item, localize)) };
}

function withLocalizedRules(item, localize) {
  const rules = item?.system?.rules;
  if (!Array.isArray(rules)) return item;
  const localized = rules.map((rule) => withLocalizedLabel(rule, localize));
  return { ...item, system: { ...item.system, rules: localized } };
}

function withLocalizedLabel(rule, localize) {
  if (!isCustomResistance(rule)) return rule;
  if (typeof rule.label !== "string" || !rule.label.startsWith(KEY_PREFIX)) return rule;
  const text = localize(rule.label);
  if (!isUsableText(text, rule.label)) return rule;
  return { ...rule, label: text };
}

function isCustomResistance(rule) {
  if (rule?.key !== "Resistance") return false;
  if (Array.isArray(rule.type)) return rule.type.includes("custom");
  return rule.type === "custom";
}

function isUsableText(text, key) {
  if (typeof text !== "string") return false;
  if (text.trim() === "") return false;
  if (text === key) return false;
  return !text.includes("{");
}
