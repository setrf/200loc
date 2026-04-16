export type IntroVisualKind =
  | 'hero'
  | 'llm'
  | 'timeline'
  | 'tokens'
  | 'context'
  | 'numbers'
  | 'attention'
  | 'state'
  | 'scores'
  | 'sampling'
  | 'loop'
  | 'limits'
  | 'handoff'

export interface IntroStepDefinition {
  id: string
  eyebrow: string
  title: string
  body: string[]
  visualKind: IntroVisualKind
  visualTitle: string
  visualBody: string
  primaryActionLabel?: string
}

export const introSteps: IntroStepDefinition[] = [
  {
    id: 'splash',
    eyebrow: 'Start Here',
    title: 'This is not magic. It is a machine predicting text one piece at a time.',
    body: [
      '200loc is built to make large language models feel less mysterious before we zoom into the code.',
      'You will get the big picture first, then the app will walk you through one tiny prediction step in detail.',
    ],
    visualKind: 'hero',
    visualTitle: 'From prompt to prediction',
    visualBody:
      'A model reads the text it can see, scores many possible next pieces, and chooses one to continue the sentence.',
    primaryActionLabel: 'Start',
  },
  {
    id: 'what-is-an-llm',
    eyebrow: 'Big Idea',
    title: 'An LLM is a system that continues text, not a person or a hidden database.',
    body: [
      'It has learned patterns from earlier training, then uses those patterns to make a fresh guess about what text should come next now.',
      'That means its replies can feel fluent and helpful while still being imperfect or wrong.',
    ],
    visualKind: 'llm',
    visualTitle: 'What it is and what it is not',
    visualBody:
      'It is a prediction engine shaped by training. It is not a mind reading your intent and it does not simply look up one perfect answer.',
  },
  {
    id: 'training-vs-chat',
    eyebrow: 'Two Timescales',
    title: 'Training happened earlier. Chat is what the model does with that earlier learning right now.',
    body: [
      'During training, the model saw huge amounts of text and slowly adjusted its internal weights so it got better at prediction.',
      'When you type a prompt, it is not learning your topic from scratch. It is using what training already shaped.',
    ],
    visualKind: 'timeline',
    visualTitle: 'Earlier learning, later use',
    visualBody:
      'Training is the long preparation phase. Chat is the fast moment-by-moment prediction phase you see in the product.',
  },
  {
    id: 'tokens',
    eyebrow: 'Text Pieces',
    title: 'The model does not work on raw text directly. It first breaks text into small pieces.',
    body: [
      'Those pieces are usually called tokens. In this intro, think of them as the chunks of text the model can count, compare, and predict.',
      'Sometimes a token is a whole word. Sometimes it is only part of a word, punctuation mark, or space pattern.',
    ],
    visualKind: 'tokens',
    visualTitle: 'From sentence to chunks',
    visualBody:
      'Human-readable text gets split into machine-usable pieces before the model starts its internal work.',
  },
  {
    id: 'context',
    eyebrow: 'Visible Window',
    title: 'At each moment, the model can only use the text it can already see so far.',
    body: [
      'This visible text is called the context window. The model cannot read words that have not been generated yet.',
      'That one rule is why generation moves left to right, always guessing the next piece from the earlier ones.',
    ],
    visualKind: 'context',
    visualTitle: 'Only the left side is visible',
    visualBody:
      'The future is hidden. The next prediction must be made from the prompt and the earlier generated text only.',
  },
  {
    id: 'numbers',
    eyebrow: 'Number Patterns',
    title: 'Each text piece becomes a pattern of numbers that carries clues about meaning and position.',
    body: [
      'The model cannot reason over letters the way people do. It works with number patterns that let similar pieces end up near each other in a learned space.',
      'Another learned pattern tells the model where each piece sits in the sequence, so order still matters.',
    ],
    visualKind: 'numbers',
    visualTitle: 'Meaning plus position',
    visualBody:
      'A text piece becomes a numeric description, then gets combined with a separate signal that says where it appears.',
  },
  {
    id: 'attention',
    eyebrow: 'Look Back',
    title: 'Attention lets the current text piece look back and decide which earlier pieces matter most.',
    body: [
      'Some earlier pieces matter a lot for the next guess. Others barely matter. Attention is the mechanism that decides where to look.',
      'Different attention heads can notice different relationships at the same time, like names, grammar, or nearby context.',
    ],
    visualKind: 'attention',
    visualTitle: 'Looking backward with purpose',
    visualBody:
      'The current piece sends out multiple read paths and gives stronger weight to the earlier pieces that seem most useful.',
  },
  {
    id: 'working-state',
    eyebrow: 'Internal Note',
    title: 'As the model looks back, it keeps rewriting an internal working state for the current position.',
    body: [
      'You can think of this as the model building a richer private note about what is happening in the text right now.',
      'That note is not stored as words. It is another evolving number pattern that gets refined layer by layer.',
    ],
    visualKind: 'state',
    visualTitle: 'A note that keeps changing',
    visualBody:
      'The model starts with a rough numeric description and repeatedly revises it as more signals get mixed in.',
  },
  {
    id: 'scores',
    eyebrow: 'Possible Next Pieces',
    title: 'Near the end of the step, the model scores many possible next text pieces at once.',
    body: [
      'These scores are like a rough ranking of how well each possible next piece fits the current context.',
      'The model is not writing a sentence all at once. It is deciding one next piece from a large menu of options.',
    ],
    visualKind: 'scores',
    visualTitle: 'A ranked menu of next moves',
    visualBody:
      'Every possible next piece gets a score, then the model turns those scores into chances.',
  },
  {
    id: 'sampling',
    eyebrow: 'One Choice',
    title: 'The model then picks one next piece from those chances, not always the single top option.',
    body: [
      'Higher-scoring options are more likely, but the final choice can still vary depending on the sampling settings.',
      'That is why model output can feel flexible or creative, but also why it can drift, surprise you, or occasionally choose a weaker option.',
    ],
    visualKind: 'sampling',
    visualTitle: 'Likely is not guaranteed',
    visualBody:
      'Strong candidates are favored, but the model still makes a sampled choice rather than following a fixed script every time.',
  },
  {
    id: 'loop',
    eyebrow: 'Repeat',
    title: 'The chosen piece gets fed back in, and the whole process repeats until the answer grows word by word.',
    body: [
      'That looping pattern is the heart of autoregressive generation. One guess becomes part of the visible text for the next guess.',
      'A full paragraph is really a long chain of tiny next-piece decisions.',
    ],
    visualKind: 'loop',
    visualTitle: 'Prediction becomes new context',
    visualBody:
      'Each chosen piece is appended to the visible text, which means the next step starts from a slightly larger context window.',
  },
  {
    id: 'limits',
    eyebrow: 'Why It Still Fails',
    title: 'Even when it sounds confident, the model can still be wrong, outdated, or pulled off course by weak patterns.',
    body: [
      'It does not guarantee truth. It predicts what text fits, and sometimes that looks convincing even when the answer is false.',
      'That is why good product design around LLMs includes checking, grounding, and careful user expectations.',
    ],
    visualKind: 'limits',
    visualTitle: 'Fluent does not always mean correct',
    visualBody:
      'A strong writing style can hide stale knowledge, made-up details, or overconfident guesses when the evidence is weak.',
  },
  {
    id: 'handoff',
    eyebrow: 'Deep Dive',
    title: 'Next, we will slow one tiny prediction step down and show its code, story, and architecture together.',
    body: [
      'You will see the same moment from three angles at once so the explanation stays concrete.',
      'Once you are ready, the walkthrough will open on the first inference step.',
    ],
    visualKind: 'handoff',
    visualTitle: 'Three synchronized views',
    visualBody:
      'Code shows the implementation, story explains the idea in plain language, and the scene shows where the computation is happening.',
  },
]
