export function hasLeadingSectionHeading(section: {
  readonly label: string;
  readonly blocks: readonly { readonly kind: string; readonly effectiveText: string }[];
}): boolean {
  const first = section.blocks[0];
  return first?.kind === "heading" && first.effectiveText === section.label;
}
