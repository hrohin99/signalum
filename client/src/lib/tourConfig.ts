export interface TourStep {
  target: string;
  title: string;
  body: string;
}

export const topicTourSteps: TourStep[] = [
  {
    target: "ai-summary",
    title: "Your topic summary",
    body: "Signalum reads everything captured here and keeps this summary current. The more you add, the sharper the picture.",
  },
  {
    target: "key-signals",
    title: "What matters most",
    body: "The most significant updates surface here automatically so you can see what changed without reading through everything.",
  },
  {
    target: "dates-deadlines",
    title: "Never miss a key date",
    body: "Add any date that matters — a compliance deadline, a contract renewal, a product launch, a meeting. Signalum reminds you before it arrives.",
  },
  {
    target: "quick-capture",
    title: "Add what you know",
    body: "Drop in anything relevant — a note, a link, a document, something from a conversation. Signalum connects it to everything else on this topic.",
  },
];
