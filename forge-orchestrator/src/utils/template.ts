import Mustache from 'mustache';

export function renderTemplate(
  template: string,
  view: Record<string, unknown>,
): string {
  return Mustache.render(template, view);
}
