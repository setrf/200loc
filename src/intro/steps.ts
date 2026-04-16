export type IntroVisualKind =
  | 'welcome'
  | 'layout'
  | 'stage'
  | 'input'
  | 'draft'
  | 'controls'
  | 'story'
  | 'glossary'
  | 'code'
  | 'scene'
  | 'sync'
  | 'mobile'
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
    id: 'welcome',
    eyebrow: 'Quick Tour',
    title: 'Before we talk about the model, let’s get comfortable with the interface.',
    body: [
      'This intro is here to show you what each part of the app does, so the main walkthrough feels guided instead of overwhelming.',
      'You do not need to understand the code yet. First we will get you oriented, then we will hand you off to step one.',
    ],
    visualKind: 'welcome',
    visualTitle: 'A walkthrough with three views',
    visualBody:
      'The app explains one tiny model step through code, plain-language story, and a visual scene at the same time.',
    primaryActionLabel: 'Start tour',
  },
  {
    id: 'layout',
    eyebrow: 'Screen Map',
    title: 'The interface has three main helpers: Code, Story, and Scene.',
    body: [
      'Code shows the exact lines running for the current moment. Story explains the same moment in everyday language. Scene turns it into a visual map.',
      'You do not have to use all three equally. Many people start with Story, then glance at Code or Scene when they want more detail.',
    ],
    visualKind: 'layout',
    visualTitle: 'Three synchronized panels',
    visualBody:
      'Each panel shows the same moment from a different angle, so you can stay grounded even if one view feels unfamiliar.',
  },
  {
    id: 'stage',
    eyebrow: 'Where You Are',
    title: 'The stage chip at the top tells you exactly where you are in the walkthrough.',
    body: [
      'It shows a short name for the current stage and a step counter so you always know what the app is focusing on right now.',
      'If the explanation starts to feel dense, this is the quickest place to re-orient yourself.',
    ],
    visualKind: 'stage',
    visualTitle: 'Stage name plus step count',
    visualBody:
      'Think of this like a chapter heading and page number for the current moment in the model’s decision.',
  },
  {
    id: 'starting-text',
    eyebrow: 'Choose A Prompt',
    title: 'Starting text is where you choose the tiny prompt the model begins from.',
    body: [
      'This is the short bit of text the walkthrough uses as the starting point for the model’s next decision.',
      'You can edit it, but the app keeps your draft separate until you explicitly apply it.',
    ],
    visualKind: 'input',
    visualTitle: 'A safe place to try a different starting point',
    visualBody:
      'Type here when you want a new example. Nothing reruns immediately just because you started typing.',
  },
  {
    id: 'current-text',
    eyebrow: 'Draft Vs Live',
    title: 'Current text shows what the model is actually using right now, not just what you typed a second ago.',
    body: [
      'That matters because the app lets you make edits without throwing away the current run right away.',
      'If Starting text and Current text differ, you are looking at a draft that still needs Apply text or Reset to restart the walkthrough from it.',
    ],
    visualKind: 'draft',
    visualTitle: 'Your draft and the live run can briefly differ',
    visualBody:
      'This keeps experimentation safe. You can inspect the current step, then choose when to restart from your new text.',
  },
  {
    id: 'controls',
    eyebrow: 'Move The Pace',
    title: 'Prev, Next, and Play let you choose how quickly you want to move.',
    body: [
      'Next is the easiest way to learn because it advances one small step at a time. Prev lets you go back if something did not click.',
      'Play turns the walkthrough into an automatic demo, and Pause gives control back to you whenever you want to slow down.',
    ],
    visualKind: 'controls',
    visualTitle: 'Manual or automatic',
    visualBody:
      'Use the controls like a remote. The app is happy to move slowly, quickly, or one click at a time.',
  },
  {
    id: 'story',
    eyebrow: 'Plain Language',
    title: 'Story is the friendly explanation panel for people who do not want to start from raw code.',
    body: [
      'This is where the app translates each model step into short, human-readable explanations.',
      'If you are new to the subject, Story is the best default place to stay while the rest of the interface supports you around it.',
    ],
    visualKind: 'story',
    visualTitle: 'Read the idea in plain language first',
    visualBody:
      'Story keeps the meaning of the step front and center, even when the code and visuals are more detailed.',
  },
  {
    id: 'glossary',
    eyebrow: 'Tap For Help',
    title: 'Underlined terms in Story open quick definitions when you hover or tap them.',
    body: [
      'This is how the app introduces small technical ideas without forcing you into a giant glossary first.',
      'On larger screens you can hover for a preview. On smaller screens you can tap to open the definition inline.',
    ],
    visualKind: 'glossary',
    visualTitle: 'Definitions are right where you need them',
    visualBody:
      'You can grab a quick explanation of one term, then return to the main flow without losing your place.',
  },
  {
    id: 'code',
    eyebrow: 'See The Source',
    title: 'Code shows the exact lines responsible for the current step.',
    body: [
      'You do not need to read every line. The highlight is there to show which parts matter for this moment and ignore the rest.',
      'As you move through the walkthrough, the highlighted lines change to stay matched with the story and the scene.',
    ],
    visualKind: 'code',
    visualTitle: 'Only the relevant lines are emphasized',
    visualBody:
      'The code panel is meant to feel like a guided spotlight, not a wall of text you must decode all at once.',
  },
  {
    id: 'scene',
    eyebrow: 'See The Shape',
    title: 'Scene turns the same step into a visual map you can pan, zoom, and inspect.',
    body: [
      'Some people understand systems better when they can see the parts moving together. That is what Scene is for.',
      'It is the same step, just shown spatially. You can explore it without breaking the walkthrough.',
    ],
    visualKind: 'scene',
    visualTitle: 'A picture of the current computation',
    visualBody:
      'The scene helps you see where information is flowing, especially when the code feels too abstract at first.',
  },
  {
    id: 'sync',
    eyebrow: 'Everything Stays Together',
    title: 'Code, Story, and Scene stay synchronized so you are never comparing different moments by accident.',
    body: [
      'When you move to the next step, all three views update together. That is one of the main teaching tricks of this app.',
      'You can use whichever view makes sense first, then trust the others to stay aligned with it.',
    ],
    visualKind: 'sync',
    visualTitle: 'One step, three angles',
    visualBody:
      'The interface is designed to reduce context-switching fatigue by keeping every explanation locked to the same step.',
  },
  {
    id: 'mobile',
    eyebrow: 'Smaller Screens',
    title: 'On smaller screens, the same walkthrough is available through Code, Story, and Scene tabs.',
    body: [
      'Nothing important disappears on mobile. The app simply gives one view more space at a time so it stays readable.',
      'If you are on a phone, Story is usually the easiest place to begin, then you can switch tabs whenever you want more detail.',
    ],
    visualKind: 'mobile',
    visualTitle: 'The same tour, just stacked',
    visualBody:
      'Tabs keep the experience usable on compact screens while preserving the same synchronized walkthrough underneath.',
  },
  {
    id: 'handoff',
    eyebrow: 'Ready',
    title: 'If you ever get lost, Replay intro brings you back here. For now, start with Story and use Next one step at a time.',
    body: [
      'That is the whole interface tour. You now know what the important parts of the app are for before the technical explanation begins.',
      'When you continue, the walkthrough will open on its first step and the three panels will stay in sync as you explore.',
    ],
    visualKind: 'handoff',
    visualTitle: 'You know where to look now',
    visualBody:
      'Start with the plain-language story, glance at code and scene when you are curious, and come back to this intro any time.',
  },
]
