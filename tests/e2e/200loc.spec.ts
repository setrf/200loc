import { devices, expect, test, type Locator, type Page } from '@playwright/test'

const iPhone13 = {
  viewport: devices['iPhone 13'].viewport,
  userAgent: devices['iPhone 13'].userAgent,
  deviceScaleFactor: devices['iPhone 13'].deviceScaleFactor,
  isMobile: devices['iPhone 13'].isMobile,
  hasTouch: devices['iPhone 13'].hasTouch,
}

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
  return (await page.locator('.story-panel__badge').textContent())?.trim() ?? ''
}

async function phaseLabel(page: Page) {
  return (await page.locator('.story-panel__phase-chip strong').textContent())?.trim() ?? ''
}

async function transitionLabel(page: Page) {
  return (await page.locator('.story-panel__transition strong').textContent())?.trim() ?? ''
}

async function advanceOnePhase(page: Page) {
  const beforeStep = await stepLabel(page)
  const beforePhase = await phaseLabel(page)
  await page.getByRole('button', { name: 'Next' }).click()
  await page.waitForTimeout(300)
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

test.describe('desktop walkthrough', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'microgpt, one token at a time' })).toBeVisible()
  })

  test('normalizes prefix input immediately and hydrates the expected deterministic state', async ({
    page,
  }) => {
    const issues = collectBrowserIssues(page)
    const prefix = page.getByRole('textbox', { name: 'Prefix' })

    await prefix.fill('Em-12??')
    await expect(prefix).toHaveValue('em')
    await expect(page.getByText('Only lowercase a-z are kept.')).toBeVisible()

    await prefix.fill('abcdefghijklmnopqrstuvwxyz')
    await expect(prefix).toHaveValue('abcdefghijklmno')
    await expect(page.getByText('Prefix was capped at 15 characters.')).toBeVisible()

    await prefix.fill('em')
    await page.getByRole('button', { name: 'Reset' }).click()

    expect(await transitionLabel(page)).toBe('p2:m -> p3:i')
    expect(issues).toEqual([])
  })

  test('keeps story, code, and training appendix highlights synchronized', async ({ page }) => {
    const issues = collectBrowserIssues(page)

    expect(await activeLineNumbers(page)).toEqual([23, 24, 25, 26, 27, 191, 192, 193, 194, 195, 196])

    await advanceOnePhase(page)
    expect(await phaseLabel(page)).toBe('Token Embedding')
    expect(await activeLineNumbers(page)).toEqual([109])

    await page.getByRole('button', { name: 'Show training note' }).click()
    const datasetButton = page.getByRole('button', { name: /Dataset \+ Shuffle/i })
    await datasetButton.hover()
    expect(await activeLineNumbers(page)).toEqual([
      14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27,
    ])

    await page.locator('.story-panel__appendix-body').hover({ position: { x: 4, y: 4 } })
    await page.mouse.move(10, 10)
    expect(await activeLineNumbers(page)).toEqual([109])
    expect(issues).toEqual([])
  })

  test('crosses the token boundary cleanly after the fourteenth phase', async ({ page }) => {
    const issues = collectBrowserIssues(page)
    await page.getByRole('textbox', { name: 'Prefix' }).fill('em')
    await page.getByRole('button', { name: 'Reset' }).click()
    await expect
      .poll(() => transitionLabel(page), { timeout: 5_000 })
      .toBe('p2:m -> p3:i')

    for (let index = 0; index < 13; index += 1) {
      await advanceOnePhase(page)
    }

    expect(await stepLabel(page)).toBe('step 14 / 14')
    expect(await phaseLabel(page)).toBe('Append Or Stop')

    await advanceOnePhase(page)
    expect(await stepLabel(page)).toBe('step 1 / 14')
    expect(await phaseLabel(page)).toBe('Tokenize Prefix')
    expect(await transitionLabel(page)).toMatch(/^p3:i -> p4:/)
    expect(issues).toEqual([])
  })

  test('autoplay advances, pauses cleanly, and stays free of browser errors', async ({ page }) => {
    const issues = collectBrowserIssues(page)

    await page.getByRole('button', { name: 'Play' }).click()
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
    await page.waitForTimeout(1_500)
    expect(await stepLabel(page)).not.toBe('step 1 / 14')

    await page.getByRole('button', { name: 'Pause' }).click()
    const pausedStep = await stepLabel(page)
    const pausedPhase = await phaseLabel(page)
    await page.waitForTimeout(1_400)
    expect(await stepLabel(page)).toBe(pausedStep)
    expect(await phaseLabel(page)).toBe(pausedPhase)
    expect(issues).toEqual([])
  })

  test('supports mouse and keyboard scene interaction without scrolling the page', async ({
    page,
  }) => {
    const issues = collectBrowserIssues(page)
    const scene = page.locator('.scene-panel')
    await scene.scrollIntoViewIfNeeded()
    await expect(page.locator('.scene-panel canvas')).toBeVisible()

    await expectSceneToChange(scene, async () => {
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(500)
    })

    const box = await scene.boundingBox()
    if (!box) {
      throw new Error('Scene bounding box was not available')
    }

    await expectSceneToChange(scene, async () => {
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.55)
      await page.mouse.down()
      await page.waitForTimeout(180)
      await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.62, {
        steps: 8,
      })
      await page.waitForTimeout(180)
      await page.mouse.up()
      await page.waitForTimeout(500)
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
})

test.describe('mobile walkthrough', () => {
  test.use({
    ...iPhone13,
  })

  test('switches between code, story, and scene without overflow or browser errors', async ({
    page,
  }) => {
    const issues = collectBrowserIssues(page)
    await page.goto('/')

    await expect(page.getByRole('tab', { name: 'Code' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Story' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Scene' })).toBeVisible()

    await page.getByRole('tab', { name: 'Scene' }).click()
    await expect(page.locator('.scene-panel')).toBeVisible()
    await expect(page.getByText(/drag to pan/i)).toBeVisible()

    await page.getByRole('tab', { name: 'Code' }).click()
    await expect(page.locator('.code-viewer')).toBeVisible()

    await page.getByRole('tab', { name: 'Story' }).click()
    await expect(page.getByRole('textbox', { name: 'Prefix' })).toBeVisible()

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
    expect(issues).toEqual([])
  })
})
