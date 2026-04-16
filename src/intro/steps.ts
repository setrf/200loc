export type IntroVisualKind = 'hero' | 'contrast' | 'handoff'

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
    id: 'llm',
    eyebrow: 'Big Idea',
    title: 'An LLM is a system that continues text, not a person or a hidden database.',
    body: [
      'It has learned patterns from earlier training, then uses those patterns to make a fresh guess about what text should come next now.',
      'That means its replies can feel fluent and helpful while still being imperfect or wrong.',
    ],
    visualKind: 'contrast',
    visualTitle: 'What it is and what it is not',
    visualBody:
      'It is a prediction engine shaped by training. It is not a mind reading your intent and it does not simply look up one perfect answer.',
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
