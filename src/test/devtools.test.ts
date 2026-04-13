import { describe, expect, it, vi } from 'vitest'
import { maybeLoadReactGrab } from '../devtools'

describe('maybeLoadReactGrab', () => {
  it('loads react grab in development', async () => {
    const loadReactGrab = vi.fn().mockResolvedValue(undefined)

    await maybeLoadReactGrab(true, loadReactGrab)

    expect(loadReactGrab).toHaveBeenCalledTimes(1)
  })

  it('skips react grab outside development', async () => {
    const loadReactGrab = vi.fn().mockResolvedValue(undefined)

    await maybeLoadReactGrab(false, loadReactGrab)

    expect(loadReactGrab).not.toHaveBeenCalled()
  })
})
