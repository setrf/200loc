import type { MobileTab } from '../walkthrough/reducer'

export interface LabTourStepDefinition {
  id: string
  targetId: string
  title: string
  description: string
  mobileTab?: MobileTab
}

export const desktopLabTourSteps: LabTourStepDefinition[] = [
  {
    id: 'stage',
    targetId: 'stage',
    title: 'This tells you where you are',
    description:
      'The step title names the exact part of the 34-step prediction you are looking at right now.',
  },
  {
    id: 'controls',
    targetId: 'controls',
    title: 'Use these controls to move step by step',
    description:
      'The controls stay with the explanation so you can move through the same prediction one step at a time.',
  },
  {
    id: 'code',
    targetId: 'code',
    title: 'This pane shows the real code',
    description:
      'The highlighted lines are the exact Python lines behind the current stage.',
  },
  {
    id: 'scene',
    targetId: 'scene',
    title: 'This picture shows the active part of the model',
    description:
      'As you move through the steps, the scene shifts to the part of the network doing the work.',
  },
  {
    id: 'story',
    targetId: 'story',
    title: 'This panel explains the same step in plain English',
    description:
      'Use it as your guide. Tappable words open quick definitions when you want more help.',
  },
]

export const mobileLabTourSteps: LabTourStepDefinition[] = [
  {
    id: 'tabs',
    targetId: 'tabs',
    title: 'Use these tabs to switch views',
    description:
      'On smaller screens, use these tabs to switch the supporting pane between Code and Scene. The explanation stays visible above them.',
  },
  {
    id: 'controls',
    targetId: 'controls',
    title: 'Use these controls to move step by step',
    description:
      'The controls stay with the explanation so you can move through the same prediction one step at a time.',
  },
  {
    id: 'code',
    targetId: 'code',
    title: 'This tab shows the real code',
    description:
      'The highlighted lines are the exact Python lines behind the current stage.',
    mobileTab: 'code',
  },
  {
    id: 'scene',
    targetId: 'scene',
    title: 'This tab shows the active part of the model',
    description:
      'As you move through the steps, the scene shifts to the part of the network doing the work.',
    mobileTab: 'scene',
  },
  {
    id: 'story',
    targetId: 'story',
    title: 'This explanation stays with you',
    description:
      'Use it as your guide while Code and Scene change underneath. Tappable words open quick definitions when you want more help.',
  },
]
