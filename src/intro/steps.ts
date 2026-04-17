import type { GlossaryId } from '../walkthrough/glossary'

export type IntroLineSegment =
  | {
      kind: 'text'
      text: string
    }
  | {
      kind: 'term'
      text: string
      glossaryId: GlossaryId
    }

export interface IntroLineDefinition {
  segments: IntroLineSegment[]
}

export interface IntroStepDefinition {
  id: string
  title: string
  lines: IntroLineDefinition[]
}

function text(value: string): IntroLineSegment {
  return { kind: 'text', text: value }
}

function term(value: string, glossaryId: GlossaryId): IntroLineSegment {
  return { kind: 'term', text: value, glossaryId }
}

function line(...segments: IntroLineSegment[]): IntroLineDefinition {
  return { segments }
}

export const introSteps: IntroStepDefinition[] = [
  {
    id: 'what-this-is',
    title: 'What this is',
    lines: [
      line(text('A language model keeps guessing what should come next.')),
      line(text('It does not write the whole answer at once.')),
      line(
        text('It builds the answer one '),
        term('token', 'token'),
        text(' at a time.'),
      ),
    ],
  },
  {
    id: 'text-becomes-tokens',
    title: 'Text becomes tokens',
    lines: [
      line(text('The model cannot work with raw text directly.')),
      line(
        text('It first breaks text into smaller pieces called '),
        term('tokens', 'token'),
        text('.'),
      ),
      line(text('A token can be a word, part of a word, or punctuation.')),
    ],
  },
  {
    id: 'tokens-become-numbers',
    title: 'Tokens become numbers',
    lines: [
      line(text('Each token is turned into numbers.')),
      line(
        text('Those numbers give the model something it can compare and transform.'),
      ),
      line(text('You can think of them as a compact description of the token.')),
    ],
  },
  {
    id: 'looks-backward',
    title: 'The model looks backward',
    lines: [
      line(
        text('When it chooses the next token, it looks at earlier text in its '),
        term('context', 'context'),
        text('.'),
      ),
      line(text('It cannot look at words that have not been generated yet.')),
      line(text('That is why it moves forward one step at a time.')),
    ],
  },
  {
    id: 'scores-next-tokens',
    title: 'It scores possible next tokens',
    lines: [
      line(
        text('After reading the visible text, the model scores many possible next tokens.'),
      ),
      line(text('Some options look stronger than others.')),
      line(text('Higher scores mean a continuation looks more likely in that moment.')),
    ],
  },
  {
    id: 'chooses-one',
    title: 'It chooses one',
    lines: [
      line(text('Those scores are turned into chances.')),
      line(
        text('Then one token is chosen through '),
        term('sampling', 'sampling'),
        text('.'),
      ),
      line(
        term('Temperature', 'temperature'),
        text(' changes how safe or adventurous that choice feels.'),
      ),
    ],
  },
  {
    id: 'repeats',
    title: 'It repeats',
    lines: [
      line(text('Once a token is chosen, it is added to the text.')),
      line(text('Then the model runs the same process again.')),
      line(text('That repeating loop is how full sentences appear.')),
    ],
  },
  {
    id: 'how-it-learned',
    title: 'How it learned',
    lines: [
      line(
        text('Before you use the model, it spends a long time adjusting its weights on lots of text.'),
      ),
      line(
        text('That process is called '),
        term('training', 'training'),
        text('.'),
      ),
      line(text('This site shows the trained model making predictions, not training itself.')),
    ],
  },
  {
    id: 'why-it-fails',
    title: 'Why it still fails',
    lines: [
      line(text('A language model can sound fluent without being right.')),
      line(text('It predicts likely continuations, not guaranteed truth.')),
      line(
        text('That is why it can '),
        term('hallucinate', 'hallucination'),
        text(' or miss facts.'),
      ),
    ],
  },
  {
    id: 'open-live-walkthrough',
    title: 'Open the live walkthrough',
    lines: [
      line(text('Next you can open the live walkthrough.')),
      line(text('That deeper view shows a tiny real model step by step.')),
      line(text('You will see the code, the scene, and each stage of one prediction.')),
    ],
  },
]
