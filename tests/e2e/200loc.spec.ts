import { devices, expect, test, type Locator, type Page } from '@playwright/test'

const iPhone13 = {
  viewport: devices['iPhone 13'].viewport,
  userAgent: devices['iPhone 13'].userAgent,
  deviceScaleFactor: devices['iPhone 13'].deviceScaleFactor,
  isMobile: devices['iPhone 13'].isMobile,
  hasTouch: devices['iPhone 13'].hasTouch,
}

const introSeenStorageKey = '200loc.hasSeenIntro.v1'
const labTourSeenStorageKey = '200loc.hasSeenLabTour.v1'

type BrowserIssue = {
  kind: 'console-error' | 'console-warning' | 'pageerror'
  text: string
}

const ignoredWarningPatterns = [
  /GL Driver Message .*ReadPixels/i,
  /^No available adapters\.$/i,
]

function shouldIgnoreWarning(text: string) {
  return ignoredWarningPatterns.some((pattern) => pattern.test(text))
}

function collectBrowserIssues(page: Page) {
  const issues: BrowserIssue[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') {
      issues.push({ kind: 'console-error', text: message.text() })
    }

    if (message.type() === 'warning') {
      const text = message.text()
      if (!shouldIgnoreWarning(text)) {
        issues.push({ kind: 'console-warning', text })
      }
    }
  })

  page.on('pageerror', (error) => {
    issues.push({ kind: 'pageerror', text: String(error) })
  })

  return issues
}

async function activeLineNumbers(page: Page) {
  return page
    .locator('.code-viewer__line.is-active .code-viewer__line-no')
    .evaluateAll((nodes) =>
      nodes
        .map((node) => Number.parseInt(node.textContent?.trim() ?? '', 10))
        .filter((value) => Number.isFinite(value)),
    )
}

async function stepLabel(page: Page) {
  return (await page.locator('.scene-panel__stage-step').textContent())?.trim() ?? ''
}

async function phaseLabel(page: Page) {
  return (await page.locator('.scene-panel__stage-chip strong').textContent())?.trim() ?? ''
}

async function stepTitleLabel(page: Page) {
  return (await page.locator('.story-panel__summary').textContent())?.trim() ?? ''
}

function firstAnnotationTrigger(page: Page) {
  return page.locator('.annotation-trigger').first()
}

async function advanceOnePhase(page: Page) {
  const beforeStep = await stepLabel(page)
  const beforePhase = await phaseLabel(page)
  await page.getByRole('button', { name: 'Next' }).click()
  await expect
    .poll(async () => `${await stepLabel(page)}|${await phaseLabel(page)}`, {
      timeout: 10_000,
    })
    .not.toBe(`${beforeStep}|${beforePhase}`)
}

async function expectSceneToChange(scene: Locator, action: () => Promise<void>) {
  const before = await scene.screenshot({ animations: 'disabled', timeout: 10_000 })
  await action()
  const after = await scene.screenshot({ animations: 'disabled', timeout: 10_000 })
  expect(after.equals(before)).toBe(false)
  return { before, after }
}

async function findHoverablePoint(page: Page, eventSurface: Locator) {
  await eventSurface.evaluate((element) => {
    element.scrollIntoView({ block: 'center', inline: 'nearest' })
  })
  await page.waitForTimeout(250)
  const box = await eventSurface.boundingBox()
  if (!box) {
    throw new Error('Scene event surface bounding box was not available')
  }

  const xFractions = [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7]
  const yFractions = [0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8]

  for (const yFraction of yFractions) {
    for (const xFraction of xFractions) {
      await page.mouse.move(
        box.x + box.width * xFraction,
        box.y + box.height * yFraction,
      )
      await page.waitForTimeout(120)
      const hoverIdx = await page.evaluate(
        () => window.__microVizDebug?.display.hoverTarget?.mainCube?.idx ?? null,
      )
      if (hoverIdx != null) {
        return { box, xFraction, yFraction }
      }
    }
  }

  throw new Error('Could not find a hoverable point in the current scene framing')
}

test.describe('desktop walkthrough', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 })
    await page.addInitScript(
      ({ introKey, tourKey }: { introKey: string; tourKey: string }) => {
        window.localStorage.setItem(introKey, 'true')
        window.localStorage.setItem(tourKey, 'true')
      },
      { introKey: introSeenStorageKey, tourKey: labTourSeenStorageKey },
    )
    await page.goto('/')
    await expect(
      page.getByRole('heading', { name: 'How LLM systems actually work' }),
    ).toBeVisible()
  })

  test('normalizes prefix input immediately and hydrates the expected deterministic state', async ({
    page,
  }) => {
    const issues = collectBrowserIssues(page)
    const prefix = page.getByRole('textbox', { name: 'Starting text' })

    await prefix.fill('Em-12??')
    await expect(prefix).toHaveValue('em')

    await prefix.fill('abcdefghijklmnopqrstuvwxyz')
    await expect(prefix).toHaveValue('abcdefghijklmno')

    await prefix.fill('em')
    await page.getByRole('button', { name: /Reset|Apply text/ }).click()

    await expect(page.locator('.story-panel__summary')).toContainText(
      'small piece of text it is allowed to use',
    )
    expect(issues).toEqual([])
  })

  test('shows hover previews, supports click-to-pin, and closes cleanly', async ({
    page,
  }) => {
    const issues = collectBrowserIssues(page)
    const trigger = firstAnnotationTrigger(page)

    await expect(trigger).toHaveAttribute('data-glossary-id', 'context')
    await trigger.hover()
    await page.waitForTimeout(320)
    await expect(page.getByRole('dialog')).toContainText('Context')

    await trigger.click()
    await page.mouse.move(12, 12)
    await page.waitForTimeout(220)
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.getByRole('heading', { name: 'How LLM systems actually work' }).click()
    await expect(page.locator('.annotation-popup--floating')).toHaveCount(0)
    expect(issues).toEqual([])
  })

  test('closes annotation previews when the walkthrough state moves', async ({
    page,
  }) => {
    const issues = collectBrowserIssues(page)
    const trigger = firstAnnotationTrigger(page)

    await trigger.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.locator('.annotation-popup--floating')).toHaveCount(0)

    await firstAnnotationTrigger(page).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: /Reset|Apply text/ }).click()
    await expect(page.locator('.annotation-popup--floating')).toHaveCount(0)

    expect(issues).toEqual([])
  })

  test('keeps story and code highlights synchronized', async ({ page }) => {
    const issues = collectBrowserIssues(page)

    expect(await activeLineNumbers(page)).toEqual([23, 24, 25, 26, 27, 191, 192, 193, 194, 195, 196])

    for (let index = 0; index < 3; index += 1) {
      await advanceOnePhase(page)
    }
    expect(await phaseLabel(page)).toBe('Token Embedding')
    expect(await activeLineNumbers(page)).toEqual([109])
    expect(issues).toEqual([])
  })

  test('rebalances the desktop shell so code and the right stack share space more evenly', async ({
    page,
  }) => {
    const issues = collectBrowserIssues(page)
    const layout = await page.evaluate(() => {
      function readRect(selector: string) {
        const element = document.querySelector(selector)
        if (!(element instanceof HTMLElement)) {
          throw new Error(`Missing element for selector: ${selector}`)
        }

        const rect = element.getBoundingClientRect()
        return {
          width: rect.width,
          height: rect.height,
        }
      }

      return {
        main: readRect('.walkthrough-layout'),
        code: readRect('.code-column'),
        rightStack: readRect('.story-scene'),
        story: readRect('.desktop-top-panel__story-body'),
        sceneViewport: readRect('.scene-panel__viewport'),
      }
    })

    const codeShare = layout.code.width / layout.main.width
    expect(codeShare).toBeGreaterThan(0.45)
    expect(codeShare).toBeLessThan(0.55)
    expect(Math.abs(layout.code.width - layout.rightStack.width)).toBeLessThan(120)
    expect(layout.story.height).toBeGreaterThanOrEqual(60)
    expect(layout.sceneViewport.height).toBeGreaterThan(layout.story.height)
    expect(issues).toEqual([])
  })

  test('keeps the scene ready after a fresh load and reload', async ({ page }) => {
    const issues = collectBrowserIssues(page)
    const loadingChip = page.locator('.scene-panel__loading')

    await expect(loadingChip).toHaveCount(0, { timeout: 8000 })
    await expect(page.locator('[data-testid="scene-viewport"]')).toBeVisible()

    await page.reload()

    await expect(loadingChip).toHaveCount(0, { timeout: 8000 })
    await expect(page.locator('[data-testid="scene-viewport"]')).toBeVisible()
    expect(issues).toEqual([])
  })

  test('crosses the token boundary cleanly after the thirty-fourth step', async ({ page }) => {
    const issues = collectBrowserIssues(page)
    await page.getByRole('textbox', { name: 'Starting text' }).fill('em')
    await page.getByRole('button', { name: /Reset|Apply text/ }).click()
    await expect(page.locator('.scene-panel__stage-chip')).toContainText('Tokenize Prefix')

    for (let index = 0; index < 33; index += 1) {
      await advanceOnePhase(page)
    }

    expect(await stepLabel(page)).toBe('step 34 / 34')
    expect(await phaseLabel(page)).toBe('Append Or Stop')

    await advanceOnePhase(page)
    expect(await stepLabel(page)).toBe('step 1 / 34')
    expect(await phaseLabel(page)).toBe('Tokenize Prefix')
    expect(await stepTitleLabel(page)).toBe(
      'The model starts by checking the small piece of text it is allowed to use for this decision.',
    )
    expect(issues).toEqual([])
  })

  test('autoplay advances, pauses cleanly, and stays free of browser errors', async ({ page }) => {
    const issues = collectBrowserIssues(page)
    const initialStep = await stepLabel(page)

    await page.getByRole('button', { name: 'Play' }).click()
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
    await expect
      .poll(async () => await stepLabel(page), { timeout: 8_000 })
      .not.toBe(initialStep)

    await page.getByRole('button', { name: 'Pause' }).click()
    const pausedStep = await stepLabel(page)
    const pausedPhase = await phaseLabel(page)
    await page.waitForTimeout(1_400)
    expect(await stepLabel(page)).toBe(pausedStep)
    expect(await phaseLabel(page)).toBe(pausedPhase)
    expect(issues).toEqual([])
  })

  test('treats edited starting text as a draft until the user applies it', async ({ page }) => {
    const issues = collectBrowserIssues(page)
    const prefix = page.getByRole('textbox', { name: 'Starting text' })
    const currentText = page.getByLabel('Current text')

    await prefix.fill('em')
    await page.getByRole('button', { name: /Reset|Apply text/ }).click()
    await expect(currentText).toContainText('em')

    await page.getByRole('button', { name: 'Play' }).click()
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()

    await prefix.fill('emi')

    await expect(page.getByRole('button', { name: 'Apply text' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Play' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled()
    await expect(currentText).toContainText('em')
    await expect(page.locator('.story-panel__field-note')).toContainText(
      'Apply text to restart from your draft',
    )
    expect(issues).toEqual([])
  })

  test('supports mouse and keyboard scene interaction without scrolling the page', async ({
    page,
  }) => {
    test.slow()
    const issues = collectBrowserIssues(page)
    const scene = page.locator('.scene-panel')
    const eventSurface = page.locator('.scene-panel__event-surface')
    await scene.scrollIntoViewIfNeeded()
    await expect(page.locator('.scene-panel canvas')).toBeVisible()
    await expect(eventSurface).toBeVisible()

    await expectSceneToChange(scene, async () => {
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(500)
    })

    const box = await eventSurface.boundingBox()
    if (!box) {
      throw new Error('Scene event surface bounding box was not available')
    }

    const hoverPoint = await findHoverablePoint(page, eventSurface)
    const hoverLinesBefore = await activeLineNumbers(page)
    await page.mouse.move(
      hoverPoint.box.x + hoverPoint.box.width * hoverPoint.xFraction,
      hoverPoint.box.y + hoverPoint.box.height * hoverPoint.yFraction,
    )
    await page.waitForTimeout(300)
    const hoverIdx = await page.evaluate(
      () => window.__microVizDebug?.display.hoverTarget?.mainCube?.idx ?? null,
    )
    expect(hoverIdx).not.toBeNull()
    expect(await activeLineNumbers(page)).toEqual(hoverLinesBefore)

    await expectSceneToChange(scene, async () => {
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.55)
      await page.mouse.down()
      await page.waitForTimeout(180)
      await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.8, {
        steps: 20,
      })
      await page.waitForTimeout(300)
      await page.mouse.up()
      await page.waitForTimeout(700)
    })

    const scrollBefore = await page.evaluate(() => window.scrollY)
    await expectSceneToChange(scene, async () => {
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.55)
      await page.mouse.wheel(0, 400)
      await page.waitForTimeout(500)
    })
    const scrollAfter = await page.evaluate(() => window.scrollY)
    expect(scrollAfter).toBe(scrollBefore)

    await expectSceneToChange(scene, async () => {
      await page.mouse.dblclick(box.x + box.width * 0.5, box.y + box.height * 0.55)
      await page.waitForTimeout(900)
    })

    expect(issues).toEqual([])
  })

  test('keeps the interactive scene host mounted while stepping through phases', async ({
    page,
  }) => {
    const issues = collectBrowserIssues(page)
    await expect(page.locator('.scene-panel__event-surface')).toBeVisible()

    await page.evaluate(() => {
      const viewport = document.querySelector('.scene-panel__viewport')
      if (!viewport) {
        throw new Error('Scene viewport not found')
      }
      const counts = { added: 0, removed: 0 }
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          mutation.addedNodes.forEach((node) => {
            if (
              node instanceof HTMLElement &&
              node.classList.contains('scene-panel__event-surface')
            ) {
              counts.added += 1
            }
          })
          mutation.removedNodes.forEach((node) => {
            if (
              node instanceof HTMLElement &&
              node.classList.contains('scene-panel__event-surface')
            ) {
              counts.removed += 1
            }
          })
        }
      })
      observer.observe(viewport, { childList: true, subtree: true })
      ;(window as Window & {
        __sceneHostObserver?: MutationObserver
        __sceneHostCounts?: typeof counts
      }).__sceneHostObserver = observer
      ;(window as Window & {
        __sceneHostCounts?: typeof counts
      }).__sceneHostCounts = counts
    })

    for (let index = 0; index < 6; index += 1) {
      await advanceOnePhase(page)
    }

    const hostCounts = await page.evaluate(() => {
      const win = window as Window & {
        __sceneHostObserver?: MutationObserver
        __sceneHostCounts?: { added: number; removed: number }
      }
      win.__sceneHostObserver?.disconnect()
      return win.__sceneHostCounts ?? { added: -1, removed: -1 }
    })

    expect(hostCounts).toEqual({ added: 0, removed: 0 })
    expect(issues).toEqual([])
  })

  test('clears scene hover state when the pointer leaves the interactive surface', async ({
    page,
  }) => {
    const issues = collectBrowserIssues(page)
    const eventSurface = page.locator('.scene-panel__event-surface')
    await eventSurface.scrollIntoViewIfNeeded()
    await expect(page.locator('.scene-panel canvas')).toBeVisible()

    const box = await eventSurface.boundingBox()
    if (!box) {
      throw new Error('Scene event surface bounding box was not available')
    }

    const hoverPoint = await findHoverablePoint(page, eventSurface)
    await page.mouse.move(
      hoverPoint.box.x + hoverPoint.box.width * hoverPoint.xFraction,
      hoverPoint.box.y + hoverPoint.box.height * hoverPoint.yFraction,
    )
    await page.waitForTimeout(300)
    const hovered = await page.evaluate(
      () => window.__microVizDebug?.display.hoverTarget?.mainCube?.idx ?? null,
    )
    expect(hovered).not.toBeNull()

    await page.mouse.move(box.x + box.width + 140, box.y - 40)
    await page.waitForTimeout(300)
    const clearedHover = await page.evaluate(
      () => window.__microVizDebug?.display.hoverTarget?.mainCube?.idx ?? null,
    )
    expect(clearedHover).toBeNull()
    expect(issues).toEqual([])
  })

  test('walks all thirty-four steps without remounting or browser errors', async ({
    page,
  }) => {
    const issues = collectBrowserIssues(page)
    const seenSteps = new Set<string>()

    seenSteps.add(await stepTitleLabel(page))
    for (let index = 0; index < 33; index += 1) {
      await advanceOnePhase(page)
      seenSteps.add(await stepTitleLabel(page))
    }

    expect(await stepLabel(page)).toBe('step 34 / 34')
    expect(seenSteps.size).toBe(34)
    expect(issues).toEqual([])
  })

  test('preserves manual zoom across same-region phase advances', async ({ page }) => {
    const issues = collectBrowserIssues(page)
    const scene = page.locator('.scene-panel')
    const eventSurface = page.locator('.scene-panel__event-surface')
    await scene.scrollIntoViewIfNeeded()
    await expect(page.locator('.scene-panel canvas')).toBeVisible()

    const box = await eventSurface.boundingBox()
    if (!box) {
      throw new Error('Scene event surface bounding box was not available')
    }

    const readCameraZoom = () =>
      page.evaluate(() => {
        const win = window as Window & {
          __microVizDebug?: { camera?: { angle?: { z?: number } } }
        }
        return win.__microVizDebug?.camera?.angle?.z ?? null
      })
    const readCameraPoseId = () =>
      page.evaluate(() => {
        const win = window as Window & {
          __microVizDebug?: { microViz?: { phaseState?: { cameraPoseId?: string } } }
        }
        return win.__microVizDebug?.microViz?.phaseState?.cameraPoseId ?? null
      })

    for (let index = 0; index < 9; index += 1) {
      await advanceOnePhase(page)
    }

    expect(await readCameraPoseId()).toBe('attention')

    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.55)
    await page.mouse.wheel(0, 900)
    await page.waitForTimeout(500)

    const zoomed = await readCameraZoom()
    expect(zoomed).not.toBeNull()

    await advanceOnePhase(page)
    const afterFirstStep = await readCameraZoom()
    expect(await readCameraPoseId()).toBe('attention')
    await advanceOnePhase(page)
    const afterSecondStep = await readCameraZoom()
    expect(await readCameraPoseId()).toBe('attention')

    expect(afterFirstStep).not.toBeNull()
    expect(afterSecondStep).not.toBeNull()
    expect(Math.abs((afterFirstStep ?? 0) - (zoomed ?? 0))).toBeLessThan(0.25)
    expect(Math.abs((afterSecondStep ?? 0) - (zoomed ?? 0))).toBeLessThan(0.25)
    expect(issues).toEqual([])
  })

  test('keeps the lower output phases usable at 1440x1100 without page scroll', async ({
    page,
  }) => {
    const issues = collectBrowserIssues(page)
    await expect(page.locator('.scene-panel canvas')).toBeVisible()
    expect(await page.evaluate(() => window.scrollY)).toBe(0)

    for (let index = 0; index < 26; index += 1) {
      await advanceOnePhase(page)
    }

    const bounds = await page.evaluate(() => {
      const viewport = document
        .querySelector('.scene-panel__viewport')
        ?.getBoundingClientRect()
      return {
        scrollY: window.scrollY,
        innerHeight: window.innerHeight,
        viewportBottom: viewport?.bottom ?? null,
      }
    })

    expect(bounds.scrollY).toBe(0)
    expect(bounds.viewportBottom).not.toBeNull()
    expect((bounds.viewportBottom ?? 0) <= bounds.innerHeight).toBe(true)

    const eventSurface = page.locator('.scene-panel__event-surface')
    const box = await eventSurface.boundingBox()
    if (!box) {
      throw new Error('Scene event surface bounding box was not available')
    }

    let hoverHits = 0
    for (let y = 0.18; y <= 0.82; y += 0.16) {
      for (let x = 0.18; x <= 0.82; x += 0.16) {
        await page.mouse.move(box.x + box.width * x, box.y + box.height * y)
        await page.waitForTimeout(25)
        const hit = await page.evaluate(
          () => window.__microVizDebug?.display.hoverTarget?.mainCube?.idx ?? null,
        )
        if (hit != null) {
          hoverHits += 1
        }
      }
    }

    expect(hoverHits).toBeGreaterThan(0)
    expect(issues).toEqual([])
  })

  test('shows in-scene hover readouts for access-backed matrices', async ({
    page,
  }) => {
    const issues = collectBrowserIssues(page)
    const scene = page.locator('.scene-panel')
    const eventSurface = page.locator('.scene-panel__event-surface')
    await scene.scrollIntoViewIfNeeded()
    await expect(page.locator('.scene-panel canvas')).toBeVisible()

    for (let index = 0; index < 9; index += 1) {
      await advanceOnePhase(page)
    }
    await expect(page.locator('.scene-panel__stage-chip')).toContainText('Q / K / V')
    await page.waitForTimeout(500)

    const hoverPoint = await findHoverablePoint(page, eventSurface)

    await page.mouse.move(
      hoverPoint.box.x + hoverPoint.box.width * 0.85,
      hoverPoint.box.y + hoverPoint.box.height * 0.08,
    )
    await page.waitForTimeout(150)
    await page.mouse.move(
      hoverPoint.box.x + hoverPoint.box.width * hoverPoint.xFraction,
      hoverPoint.box.y + hoverPoint.box.height * hoverPoint.yFraction,
    )
    await page.waitForTimeout(300)

    const hoverIdx = await page.evaluate(
      () => window.__microVizDebug?.display.hoverTarget?.mainCube?.idx ?? null,
    )
    expect(hoverIdx).not.toBeNull()

    expect(issues).toEqual([])
  })

  test('survives repeated matrix hover without crashing or emitting browser errors', async ({
    page,
  }) => {
    const issues = collectBrowserIssues(page)
    const eventSurface = page.locator('.scene-panel__event-surface')
    await eventSurface.scrollIntoViewIfNeeded()
    await expect(page.locator('.scene-panel canvas')).toBeVisible()

    const box = await eventSurface.boundingBox()
    if (!box) {
      throw new Error('Scene event surface bounding box was not available')
    }

    for (let step = 0; step < 40; step += 1) {
      const x = box.x + box.width * (0.34 + (step % 6) * 0.05)
      const y = box.y + box.height * (0.48 + ((step / 6) % 4) * 0.04)
      await page.mouse.move(x, y)
      await page.waitForTimeout(40)
    }

    await page.waitForTimeout(400)
    await expect(page.locator('.scene-panel canvas')).toBeVisible()
    expect(issues).toEqual([])
  })

  test('survives a long mixed interaction session without scene corruption', async ({
    page,
  }) => {
    const issues = collectBrowserIssues(page)
    const scene = page.locator('.scene-panel')
    const eventSurface = page.locator('.scene-panel__event-surface')
    await eventSurface.scrollIntoViewIfNeeded()
    await expect(page.locator('.scene-panel canvas')).toBeVisible()

    const box = await eventSurface.boundingBox()
    if (!box) {
      throw new Error('Scene event surface bounding box was not available')
    }

    for (let cycle = 0; cycle < 2; cycle += 1) {
      for (let step = 0; step < 6; step += 1) {
        await page.getByRole('button', { name: 'Next' }).click()
        await page.waitForTimeout(100)
      }

      for (let move = 0; move < 18; move += 1) {
        const x = box.x + box.width * (0.28 + (move % 8) * 0.055)
        const y = box.y + box.height * (0.42 + ((move / 8) % 3) * 0.06)
        await page.mouse.move(x, y)
        await page.waitForTimeout(20)
      }

      await expectSceneToChange(scene, async () => {
        await page.mouse.move(box.x + box.width * 0.46, box.y + box.height * 0.54)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width * 0.68, box.y + box.height * 0.7, {
          steps: 12,
        })
        await page.mouse.up()
        await page.waitForTimeout(180)
      })

      await page.getByRole('button', { name: 'Prev' }).click()
      await page.waitForTimeout(100)
    }

    await expect(page.locator('.scene-panel canvas')).toBeVisible()
    expect(issues).toEqual([])
  })
})

test.describe('intro walkthrough', () => {
  test('opens on first visit, advances simply, and can skip into the lab', async ({
    page,
  }) => {
    const issues = collectBrowserIssues(page)
    await page.setViewportSize({ width: 1280, height: 920 })
    await page.goto('/')

    await expect(
      page.getByText('A language model keeps guessing what should come next.'),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Next' }).click()
    await expect(
      page.getByText('The model cannot work with raw text directly.'),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Skip' }).click()
    await expect(page.getByRole('dialog', { name: 'Lab tour' })).toBeVisible()
    await expect(
      page.getByText(
        'The stage badge shows which part of the 34-step loop you are looking at right now.',
      ),
    ).toBeVisible()
    const tour = page.getByRole('dialog', { name: 'Lab tour' })
    for (let index = 0; index < 4; index += 1) {
      await tour.getByRole('button', { name: 'Next' }).click()
    }
    await tour.getByRole('button', { name: 'Start exploring' }).click()
    await expect(
      page.getByRole('heading', { name: 'How LLM systems actually work' }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start intro again' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Show lab tour' })).toBeVisible()
    expect(issues).toEqual([])
  })

  test('remembers completion on reload and can replay the intro', async ({ page }) => {
    const issues = collectBrowserIssues(page)
    await page.setViewportSize({ width: 1280, height: 920 })
    await page.goto('/')

    for (let index = 0; index < 9; index += 1) {
      await page.getByRole('button', { name: 'Next' }).click()
    }

    await expect(
      page.getByText('Next you can open the live walkthrough.'),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Open live walkthrough' }).click()
    const tour = page.getByRole('dialog', { name: 'Lab tour' })
    await expect(tour).toBeVisible()
    for (let index = 0; index < 4; index += 1) {
      await tour.getByRole('button', { name: 'Next' }).click()
    }
    await tour.getByRole('button', { name: 'Start exploring' }).click()
    await expect(
      page.getByRole('heading', { name: 'How LLM systems actually work' }),
    ).toBeVisible()

    await page.reload()
    await expect(page.getByText('Step 1 of 10')).toHaveCount(0)
    await expect(
      page.getByRole('heading', { name: 'How LLM systems actually work' }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Start intro again' }).click()
    await expect(
      page.getByText('A language model keeps guessing what should come next.'),
    ).toBeVisible()
    expect(issues).toEqual([])
  })

  test('can replay the lab tour from the main app header', async ({ page }) => {
    const issues = collectBrowserIssues(page)
    await page.setViewportSize({ width: 1280, height: 920 })
    await page.addInitScript(
      ({ introKey, tourKey }: { introKey: string; tourKey: string }) => {
        window.localStorage.setItem(introKey, 'true')
        window.localStorage.setItem(tourKey, 'true')
      },
      { introKey: introSeenStorageKey, tourKey: labTourSeenStorageKey },
    )
    await page.goto('/')

    await page.getByRole('button', { name: 'Show lab tour' }).click()
    const tour = page.getByRole('dialog', { name: 'Lab tour' })
    await expect(tour).toBeVisible()
    await tour.getByRole('button', { name: 'Next' }).click()
    await expect(
      tour.getByText('This is how you drive the walkthrough'),
    ).toBeVisible()
    expect(issues).toEqual([])
  })

  test('supports the same glossary popups inside the intro copy', async ({ page }) => {
    const issues = collectBrowserIssues(page)
    await page.setViewportSize({ width: 1280, height: 920 })
    await page.goto('/')

    const tokenTrigger = page.getByRole('button', { name: 'token' })
    await expect(tokenTrigger).toBeVisible()

    await tokenTrigger.click()
    await expect(page.getByRole('dialog')).toContainText('Token')
    await expect(page.getByRole('dialog')).toContainText(
      'One small text piece the model can read or write in a single step.',
    )

    await page.getByRole('heading', { name: 'How LLM systems actually work' }).click()
    await expect(page.locator('.annotation-popup--floating')).toHaveCount(0)
    expect(issues).toEqual([])
  })
})

test.describe('mobile walkthrough', () => {
  test.use({
    ...iPhone13,
  })

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      ({ introKey, tourKey }: { introKey: string; tourKey: string }) => {
        window.localStorage.setItem(introKey, 'true')
        window.localStorage.setItem(tourKey, 'true')
      },
      { introKey: introSeenStorageKey, tourKey: labTourSeenStorageKey },
    )
  })

  test('keeps the intro simple on mobile with no horizontal overflow', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      ...iPhone13,
    })
    const page = await context.newPage()
    const issues = collectBrowserIssues(page)

    await page.goto('/')
    await expect(
      page.getByText('A language model keeps guessing what should come next.'),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Skip' })).toBeVisible()

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
    expect(issues).toEqual([])
    await context.close()
  })

  test('uses full-width tabs and only mounts the active compact pane without overflow', async ({
    page,
  }) => {
    const issues = collectBrowserIssues(page)
    await page.goto('/')

    await expect(page.getByRole('button', { name: 'Code', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Story', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Scene', exact: true })).toBeVisible()

    const initialMetrics = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll<HTMLElement>('.segment-tabs button')]
      const tabWidths = tabs.map((tab) => tab.getBoundingClientRect().width)
      const tabsWidth =
        document.querySelector('.segment-tabs')?.getBoundingClientRect().width ?? 0

      return {
        tabWidths,
        tabsWidth,
        codeCount: document.querySelectorAll('.code-column').length,
        sceneCount: document.querySelectorAll('.scene-panel').length,
        storyCount: document.querySelectorAll('.story-scene__story').length,
      }
    })

    expect(initialMetrics.tabsWidth).toBeGreaterThan(330)
    expect(Math.max(...initialMetrics.tabWidths) - Math.min(...initialMetrics.tabWidths)).toBeLessThanOrEqual(2)
    expect(initialMetrics.codeCount).toBe(0)
    expect(initialMetrics.sceneCount).toBe(0)
    expect(initialMetrics.storyCount).toBe(1)

    await page.getByRole('button', { name: 'Scene', exact: true }).click()
    await expect(page.locator('.scene-panel')).toBeVisible()
    await expect(page.getByText(/drag to pan/i)).toBeVisible()
    await expect(page.locator('.story-scene__story')).toHaveCount(0)
    await expect(page.locator('.code-column')).toHaveCount(0)

    await page.getByRole('button', { name: 'Code', exact: true }).click()
    await expect(page.locator('.code-viewer')).toBeVisible()
    await expect(page.locator('.story-scene')).toHaveCount(0)
    await expect(page.locator('.scene-panel')).toHaveCount(0)

    await page.getByRole('button', { name: 'Story', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'Starting text' })).toBeVisible()
    await expect(page.locator('.story-scene__story')).toHaveCount(1)
    await expect(page.locator('.scene-panel')).toHaveCount(0)

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
    expect(issues).toEqual([])
  })

  test('opens inline glossary popins on Story and closes them when tabs change', async ({
    page,
  }) => {
    const issues = collectBrowserIssues(page)
    await page.goto('/')

    await page.getByRole('button', { name: 'Story', exact: true }).click()
    const trigger = firstAnnotationTrigger(page)
    await trigger.click()
    await expect(page.locator('.annotation-popup--inline')).toBeVisible()
    await expect(page.locator('.annotation-popup--floating')).toHaveCount(0)

    await page.getByRole('button', { name: 'Scene', exact: true }).click()
    await expect(page.locator('.annotation-popup--inline')).toHaveCount(0)
    expect(issues).toEqual([])
  })
})
