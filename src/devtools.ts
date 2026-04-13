export async function maybeLoadReactGrab(
  isDev: boolean,
  loadReactGrab: () => Promise<unknown> = () => import('react-grab'),
) {
  if (isDev) {
    await loadReactGrab()
  }
}
