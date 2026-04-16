export interface IntroStepDefinition {
  id: string
  title: string
  lines: string[]
}

export const introSteps: IntroStepDefinition[] = [
  {
    id: 'what-this-is',
    title: 'What this is',
    lines: [
      'A language model keeps guessing what should come next.',
      'It does not write the whole answer at once.',
      'It builds the answer one token at a time.',
    ],
  },
  {
    id: 'text-becomes-tokens',
    title: 'Text becomes tokens',
    lines: [
      'The model cannot work with raw text directly.',
      'It first breaks text into smaller pieces called tokens.',
      'A token can be a word, part of a word, or punctuation.',
    ],
  },
  {
    id: 'tokens-become-numbers',
    title: 'Tokens become numbers',
    lines: [
      'Each token is turned into numbers.',
      'Those numbers give the model something it can compare and transform.',
      'You can think of them as a compact description of the token.',
    ],
  },
  {
    id: 'looks-backward',
    title: 'The model looks backward',
    lines: [
      'When it chooses the next token, it looks at earlier text.',
      'It cannot look at words that have not been generated yet.',
      'That is why it moves forward one step at a time.',
    ],
  },
  {
    id: 'scores-next-tokens',
    title: 'It scores possible next tokens',
    lines: [
      'After reading the visible text, the model scores many possible next tokens.',
      'Some options look stronger than others.',
      'Higher scores mean a continuation looks more likely in that moment.',
    ],
  },
  {
    id: 'chooses-one',
    title: 'It chooses one',
    lines: [
      'Those scores are turned into chances.',
      'Then one token is chosen.',
      'Temperature changes how safe or adventurous that choice feels.',
    ],
  },
  {
    id: 'repeats',
    title: 'It repeats',
    lines: [
      'Once a token is chosen, it is added to the text.',
      'Then the model runs the same process again.',
      'That repeating loop is how full sentences appear.',
    ],
  },
  {
    id: 'how-it-learned',
    title: 'How it learned',
    lines: [
      'Before you use the model, it spends a long time adjusting its weights on lots of text.',
      'That process is called training.',
      'This site shows the trained model making predictions, not training itself.',
    ],
  },
  {
    id: 'why-it-fails',
    title: 'Why it still fails',
    lines: [
      'A language model can sound fluent without being right.',
      'It predicts likely continuations, not guaranteed truth.',
      'That is why it can hallucinate or miss facts.',
    ],
  },
  {
    id: 'open-live-walkthrough',
    title: 'Open the live walkthrough',
    lines: [
      'Next you can open the live walkthrough.',
      'That deeper view shows a tiny real model step by step.',
      'You will see the code, the scene, and each stage of one prediction.',
    ],
  },
]
