// Editable guidelines shown to readers in the "How to annotate" modal
// on first login. Keep copy short, concrete, and friendly. The order
// here is the order the buttons appear, so list them in a way that
// reads naturally for an annotator scanning top-to-bottom.
//
// To customise, just edit the strings below. No code change required
// to update the in-app guidance.

export interface ChoiceGuideline {
  /** Matches the harm_source enum exactly. */
  key: 'text' | 'image' | 'both' | 'none';
  /** Short title shown on the choice button. */
  title: string;
  /** One-line description, used in the choice card. */
  caption: string;
  /** Two- or three-sentence guide entry shown in the modal. Plain
   *  text only — no markdown. Paragraphs are joined with a blank
   *  line. */
  guidance: string[];
  /** When to pick this. Lowercase imperative, ~6-12 words. */
  when: string;
}

export const guidelines: ChoiceGuideline[] = [
  {
    key: 'text',
    title: 'Text',
    caption: 'The harm comes from words.',
    when: 'when the words do the work',
    guidance: [
      'Mark Text when the offence, slur, stereotype, or call to action is carried by the written or transcribed content of the meme — the caption, watermark, or overlaid sentence.',
      'If the image on its own would be unremarkable but the wording makes it harmful, the answer is Text.',
      'Do not mark Text if the picture itself is harmful regardless of the words (e.g. a slur drawn on a face) — that is Image.',
    ],
  },
  {
    key: 'image',
    title: 'Image',
    caption: 'The harm comes from the picture.',
    when: 'when the picture does the work',
    guidance: [
      'Mark Image when the harm lives in the visual itself: a stereotype performed by a body, a face, a gesture, a setting, or a composition. The picture alone is enough to cause the harm.',
      'Common cases: caricature, juxtaposition that decontextualises, photographed or drawn violence, sexualised depiction, and so on.',
      'If removing the words would not make the image safe, the answer is Image.',
    ],
  },
  {
    key: 'both',
    title: 'Both',
    caption: 'Words and picture work together.',
    when: 'when neither is enough on its own',
    guidance: [
      'Mark Both when the harm emerges only from the combination — neither the text alone nor the picture alone carries it, but together they do.',
      'A neutral photo captioned with a slur, or a banal phrase over a demeaning image, is the typical case.',
      'When in doubt, prefer Both over Text or Image alone.',
    ],
  },
  {
    key: 'none',
    title: 'None',
    caption: 'Neither text nor image is harmful.',
    when: 'when nothing here is harmful',
    guidance: [
      'Mark None when the meme is benign — humour, commentary, art, advertisement, or simply a picture with no harmful content. Most memes will fall here.',
      'If you find the meme merely tasteless, off-topic, or annoying, that is not enough; mark None and move on.',
      'Reserve Text, Image, or Both for content that a reasonable observer would identify as harmful, not merely impolite.',
    ],
  },
];

export const guidelinesMeta = {
  /** Shown at the top of the modal. One line, no markdown. */
  intro:
    'Each image asks a single question: where does the harm live, if at all? Pick the answer that best describes the source.',
  /** Shown in the bottom of the modal, beneath the four guidance blocks. */
  footnote:
    'There is no wrong answer. The mark is yours. The dataset is the archive of many such marks.',
};
