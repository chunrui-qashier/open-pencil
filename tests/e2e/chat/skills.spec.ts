import { strToU8, zipSync } from 'fflate'

import { expect, test } from '#tests/helpers/chat/fixture'

const SKILL =
  '---\nname: grid\ndescription: Lay out pages on an eight-point grid.\n---\n# Grid\n\nSnap every frame to multiples of 8.'

test('the composer starts a message with a skill picked from its menu', async ({
  configuredChat: chat
}) => {
  const { page } = chat
  await page.getByTestId('provider-settings-trigger').click()
  await page.getByRole('tab', { name: 'Skills', exact: true }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Upload skill' }).click()
  await (
    await chooser
  ).setFiles({
    name: 'grid.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(zipSync({ 'grid/SKILL.md': strToU8(SKILL) }))
  })
  await expect(page.getByRole('button', { name: /^grid / })).toBeVisible()
  await page.getByTestId('app-settings-done').click()

  await chat.input.fill('lay out the hero')
  await page.getByRole('button', { name: 'Skills and commands' }).click()
  await page.getByRole('menuitem', { name: /^grid / }).click()
  await expect(chat.input).toHaveValue('/skill:grid lay out the hero')
  await expect(chat.input).toBeFocused()
})
