import type { GlossaryId } from '../walkthrough/glossary'
import { autoAnnotateText } from '../walkthrough/autoGlossary'

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
  return {
    segments: segments.flatMap((segment) =>
      segment.kind === 'text' ? autoAnnotateText(segment.text) : segment,
    ),
  }
}

export const introSteps: IntroStepDefinition[] = [
  {
    id: 'ai-is-everywhere',
    title: 'AI is everywhere',
    lines: [
      line(text('AI is everywhere these days.')),
      line(
        text(
          'Chatbots, coding tools, search helpers, and writing assistants all feel different on the surface.',
        ),
      ),
      line(text('Underneath, many of the ones that work with language are powered by LLMs.')),
    ],
  },
  {
    id: 'llms-are-simple',
    title: 'LLMs are simpler than they seem',
    lines: [
      line(text('A large language model can look impossibly complicated from the outside.')),
      line(
        text(
          'At its core, it repeats a simple loop: read the text so far, score what could come next, and choose one token.',
        ),
      ),
      line(
        text(
          'This app keeps the complete code, model architecture, and every inference step side by side.',
        ),
      ),
      line(
        text(
          'Nothing important is hidden behind an API call; the scale is huge, but the building blocks are learnable.',
        ),
      ),
    ],
  },
  {
    id: 'meet-microgpt',
    title: 'Meet microgpt',
    lines: [
      line(text('To show every piece clearly, we use the smallest complete model we can put on screen.')),
      line(
        text('That model is microgpt: a tiny GPT-style model trained on 32,033 lowercase names.'),
      ),
      line(text('It runs locally in your browser and predicts one character at a time.')),
    ],
  },
  {
    id: 'what-this-is',
    title: 'Text becomes tokens',
    lines: [
      line(
        text('microgpt does not read raw text directly. It turns the starting text into '),
        term('token', 'token'),
        text(' ids first.'),
      ),
      line(
        text('In this tiny model, the '),
        term('tokens', 'token'),
        text(' are just lowercase characters plus a beginning marker.'),
      ),
      line(
        text('Those ids become small number vectors the model can compare and transform.'),
      ),
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
    title: 'It scores, chooses, repeats',
    lines: [
      line(
        text('After reading the visible text, the model scores every possible next character.'),
      ),
      line(
        text('Those scores become chances, and one character is chosen through '),
        term('sampling', 'sampling'),
        text('.'),
      ),
      line(
        term('Temperature', 'temperature'),
        text(' changes how predictable or surprising that choice feels.'),
      ),
      line(text('The chosen character is added to the text, and the same loop runs again.')),
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
