export interface IntroVisualRow {
  label: string
  values: string[]
  emphasisIndexes?: number[]
}

export interface IntroStepDefinition {
  id: string
  title: string
  body: string
  visualTitle: string
  visualRows: IntroVisualRow[]
  note?: string
}

export const introSteps: IntroStepDefinition[] = [
  {
    id: 'what-this-is',
    title: 'What this is',
    body:
      'A large language model is a system that keeps guessing what token should come next. It does not write the whole answer at once. It builds the answer one step at a time.',
    visualTitle: 'One loop, over and over',
    visualRows: [
      {
        label: 'Sequence',
        values: ['You write', 'Model reads', 'Model guesses', 'Text grows'],
        emphasisIndexes: [2],
      },
    ],
  },
  {
    id: 'text-becomes-tokens',
    title: 'Text becomes tokens',
    body:
      'The model cannot work directly with raw text. It first breaks text into smaller pieces called tokens. A token might be a whole word, part of a word, or punctuation.',
    visualTitle: 'Text is split into pieces',
    visualRows: [
      {
        label: 'Text',
        values: ['under', 'stand', 'ing'],
      },
      {
        label: 'Another example',
        values: ['Hello', ',', 'world'],
      },
    ],
  },
  {
    id: 'tokens-become-numbers',
    title: 'Tokens become numbers',
    body:
      'Each token is turned into numbers the model can compare and transform. You can think of those numbers as a compact description the model can do math with.',
    visualTitle: 'Pieces become numeric descriptions',
    visualRows: [
      {
        label: 'Token',
        values: ['cat', 'sat', 'mat'],
      },
      {
        label: 'Description',
        values: ['0.42 · -0.11 · 0.83', '0.15 · 0.68 · -0.20', '-0.07 · 0.51 · 0.39'],
      },
    ],
  },
  {
    id: 'looks-backward',
    title: 'The model looks backward',
    body:
      'When choosing the next token, the model can look at earlier tokens in the visible text. It cannot look ahead at words that have not been generated yet.',
    visualTitle: 'It reads left, not right',
    visualRows: [
      {
        label: 'Visible now',
        values: ['The', 'cat', 'sat', 'on'],
        emphasisIndexes: [0, 1, 2, 3],
      },
      {
        label: 'Not visible yet',
        values: ['the', 'mat'],
      },
    ],
    note: 'This is why generation works as a next-step process instead of a full answer appearing all at once.',
  },
  {
    id: 'scores-next-tokens',
    title: 'It scores possible next tokens',
    body:
      'After reading the visible text, the model creates a score for many possible next tokens. Higher scores mean “this continuation looks more plausible here.”',
    visualTitle: 'Many candidates compete',
    visualRows: [
      {
        label: 'Candidates',
        values: ['the', 'a', 'with', 'because'],
        emphasisIndexes: [0, 1],
      },
      {
        label: 'Scores',
        values: ['high', 'medium', 'low', 'low'],
      },
    ],
  },
  {
    id: 'chooses-one',
    title: 'It chooses one',
    body:
      'Those scores are turned into chances. Then one token is chosen. Temperature changes how safe or adventurous that choice becomes, but the model is still picking from its learned options.',
    visualTitle: 'Scores become chances',
    visualRows: [
      {
        label: 'Probabilities',
        values: ['the 54%', 'a 26%', 'with 12%', 'because 8%'],
        emphasisIndexes: [0],
      },
      {
        label: 'Chosen token',
        values: ['the'],
        emphasisIndexes: [0],
      },
    ],
  },
  {
    id: 'repeats',
    title: 'It repeats',
    body:
      'Once a token is chosen, it gets added to the text. Then the model runs the same process again with the slightly longer history. That repeating loop is how full sentences appear.',
    visualTitle: 'The answer grows one token at a time',
    visualRows: [
      {
        label: 'Before',
        values: ['The', 'cat', 'sat', 'on'],
      },
      {
        label: 'After one step',
        values: ['The', 'cat', 'sat', 'on', 'the'],
        emphasisIndexes: [4],
      },
    ],
  },
  {
    id: 'how-it-learned',
    title: 'How it learned',
    body:
      'Before you ever use the model, it spends a long time adjusting its internal weights on large amounts of text. Training is where it learns patterns. This site runs the already-trained model doing inference, not training itself.',
    visualTitle: 'Training builds the weights first',
    visualRows: [
      {
        label: 'Offline training',
        values: ['Read examples', 'Adjust weights', 'Repeat many times'],
      },
      {
        label: 'Live use',
        values: ['Read prompt', 'Predict next token'],
        emphasisIndexes: [1],
      },
    ],
  },
  {
    id: 'why-it-fails',
    title: 'Why it still fails',
    body:
      'An LLM can sound fluent without being right. It predicts likely continuations, not guaranteed truth. That is why it can hallucinate, miss hidden facts, or drift when the useful context is missing.',
    visualTitle: 'Fluent does not always mean correct',
    visualRows: [
      {
        label: 'What it is good at',
        values: ['Pattern matching', 'Language fluency', 'Style imitation'],
      },
      {
        label: 'What can go wrong',
        values: ['Missing facts', 'Overconfidence', 'Context limits'],
      },
    ],
  },
  {
    id: 'open-live-walkthrough',
    title: 'Open the live walkthrough',
    body:
      'Next you can step through a tiny real model as it generates text. That deeper view shows the actual code, the live architecture scene, and every stage of one prediction pass.',
    visualTitle: 'From simple story to live system',
    visualRows: [
      {
        label: 'You just learned',
        values: ['tokens', 'context', 'attention', 'sampling', 'limits'],
      },
      {
        label: 'Next',
        values: ['Open the live walkthrough'],
        emphasisIndexes: [0],
      },
    ],
    note: 'The advanced walkthrough is still plain-language, but it shows the real moving parts in more detail.',
  },
]
