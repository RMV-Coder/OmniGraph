export function formatDate(date) {
  return date.toISOString();
}

export function slugify(text) {
  return text.toLowerCase().replace(/\s+/g, '-');
}
