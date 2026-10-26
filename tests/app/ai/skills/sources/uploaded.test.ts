import { describe, expect, test } from 'bun:test'

import { strToU8, zipSync } from 'fflate'

import {
  skillFromArchive,
  skillFromUpload,
  skillsFromUploads
} from '@/app/ai/skills/sources/uploaded'

const SKILL = '---\nname: grid\ndescription: Lay out pages on a grid.\n---\nSnap to 8.'

function archive(files: Record<string, string | Uint8Array>): Uint8Array {
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([path, content]) => [
        path,
        typeof content === 'string' ? strToU8(content) : content
      ])
    )
  )
}

describe('skillFromArchive', () => {
  test('reads a skill folder packed with its files', () => {
    const upload = skillFromArchive(
      archive({
        'grid/SKILL.md': SKILL,
        'grid/references/spacing.md': '8, 16, 24',
        'grid/assets/logo.png': new Uint8Array([0x89, 0x50, 0xff, 0xfe]),
        '__MACOSX/grid/._SKILL.md': 'resource fork',
        'grid/.DS_Store': 'finder'
      }),
      1
    )
    expect(upload).toEqual({
      ok: true,
      skill: {
        name: 'grid',
        skillFile: SKILL,
        files: [{ path: 'references/spacing.md', text: '8, 16, 24' }],
        uploadedAt: 1
      }
    })
  })

  test('reads a skill packed at the archive root', () => {
    const upload = skillFromArchive(archive({ 'SKILL.md': SKILL, 'notes.md': 'n' }), 1)
    expect(upload.ok && upload.skill.files.map((file) => file.path)).toEqual(['notes.md'])
  })

  test('refuses an archive without exactly one skill', () => {
    expect(skillFromArchive(archive({ 'README.md': 'no skill' }), 1)).toMatchObject({
      reason: 'no-skill'
    })
    expect(
      skillFromArchive(archive({ 'a/SKILL.md': SKILL, 'b/SKILL.md': SKILL }), 1)
    ).toMatchObject({ reason: 'several-skills' })
    expect(skillFromArchive(strToU8('not a zip'), 1)).toMatchObject({ reason: 'unreadable' })
    expect(skillFromArchive(archive({ 'grid/SKILL.md': '# no frontmatter' }), 1)).toMatchObject({
      reason: 'invalid'
    })
  })
})

describe('skillFromUpload', () => {
  test('reads a SKILL.md on its own, which must name itself', async () => {
    const upload = await skillFromUpload(new File([SKILL], 'SKILL.md'), 1)
    expect(upload.ok && upload.skill.name).toBe('grid')
    const unnamed = new File(['---\ndescription: Grids.\n---\n'], 'SKILL.md')
    expect(await skillFromUpload(unnamed, 1)).toMatchObject({ reason: 'invalid' })
  })
})

describe('skillsFromUploads', () => {
  test('offers an upload’s files to the chat', async () => {
    const { skills } = skillsFromUploads([
      {
        name: 'grid',
        skillFile: SKILL,
        files: [{ path: 'references/spacing.md', text: '8' }],
        uploadedAt: 1
      }
    ])
    expect(skills.map((skill) => [skill.source, skill.name, skill.files])).toEqual([
      ['openpencil', 'grid', ['references/spacing.md']]
    ])
    expect(await skills[0]?.readFile('references/spacing.md')).toBe('8')
  })
})
