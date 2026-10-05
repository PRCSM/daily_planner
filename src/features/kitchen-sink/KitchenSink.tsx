import { useState } from 'react'
import { Button, Card, CardList, Chip, Empty, IconButton, NotEnoughData, Note, Pill, Row, Screen, ScreenTitle, SectionLabel } from '@/ui/primitives'
import { Checkbox, ChipGroup, Field, Stepper, TextArea, TextField, Toggle, TriState } from '@/ui/controls'
import { Sheet } from '@/ui/Sheet'
import { ICON_NAMES, Icon } from '@/ui/Icon'
import { useTheme } from '@/ui/theme'
import { MOTION, springCss } from '@/ui/motion'

const SWATCHES = ['bg', 'surface', 'raised', 'hairline', 'ink', 'ink-2', 'ink-3', 'danger', 'success', 'warning', 'accent'] as const

export function KitchenSink() {
  const { choice, setChoice } = useTheme()
  const [checked, setChecked] = useState(false)
  const [toggle, setToggle] = useState(true)
  const [tri, setTri] = useState<boolean | null>(null)
  const [mins, setMins] = useState<number>(60)
  const [steps, setSteps] = useState(7)
  const [sheet, setSheet] = useState(false)

  return (
    <Screen>
      <ScreenTitle sub="every primitive, both themes" right={<Pill tone="outline">v1</Pill>}>
        kitchen sink
      </ScreenTitle>

      <SectionLabel>Theme</SectionLabel>
      <ChipGroup label="Theme" options={['dark', 'light', 'system'] as const} value={choice} onChange={setChoice} />

      <SectionLabel>Colour tokens</SectionLabel>
      <div className="grid grid-cols-4 gap-2">
        {SWATCHES.map((s) => (
          <div key={s} className="rounded-[14px] p-2 ring-1 ring-hairline" style={{ background: `var(--${s})` }}>
            <div className="h-8" />
            <div className="t-meta rounded bg-bg/80 px-1 text-ink">{s}</div>
          </div>
        ))}
      </div>

      <SectionLabel>Type scale</SectionLabel>
      <Card>
        <p className="t-display">display 32/800</p>
        <p className="t-title mt-2">title 22/700</p>
        <p className="t-heading mt-2">heading 20/700</p>
        <p className="t-body mt-2">body 15/400</p>
        <p className="t-body-strong mt-2">bodyStrong 15/700</p>
        <p className="t-label mt-2">label 13/500</p>
        <p className="t-meta mt-2 text-ink-2">meta 11/500</p>
        <p className="t-reader mt-3">readerBody — Source Serif 4, 18/1.6. A closure is a function bundled with its surrounding scope.</p>
      </Card>

      <SectionLabel>Rows & pills</SectionLabel>
      <CardList>
        <Row prefix="DSA deep block:" right={<Pill>120m</Pill>} leading={<Checkbox label="done" checked={checked} onChange={setChecked} />}>
          two pointers, 3 problems
        </Row>
        <Row prefix="Behind target:" right={<Pill tone="danger">−4</Pill>}>
          week 12 DSA
        </Row>
        <Row prefix="AI used in a learning block:" right={<Pill tone="warning">amber</Pill>}>
          factual, not shaming
        </Row>
        <Row prefix="Complete:" right={<Pill tone="success">done</Pill>}>
          used sparingly
        </Row>
        <Row prefix="On track:" right={<Pill tone="outline">uncoloured</Pill>}>
          the good case spends no colour
        </Row>
        <Row prefix="Now:" right={<Pill tone="accent">active</Pill>} dim>
          dimmed (CLOSED sinks but never disappears)
        </Row>
      </CardList>

      <SectionLabel>Controls</SectionLabel>
      <CardList>
        <Card>
          <Note className="mb-2">Chips</Note>
          <ChipGroup label="Minutes" options={[30, 60, 90] as const} value={mins} onChange={setMins} render={(m) => `${m}m`} />
        </Card>
        <Card className="flex items-center justify-between">
          <span className="t-body">AI used</span>
          <Toggle label="AI used" checked={toggle} onChange={setToggle} />
        </Card>
        <Card>
          <Note className="mb-2">Tri-state (unanswered by default; tap the selected chip to clear) → {String(tri)}</Note>
          <TriState label="Fuel ok" value={tri} onChange={setTri} />
        </Card>
        <Card className="flex items-center justify-between">
          <span className="t-body">Stepper</span>
          <Stepper label="Sleep" value={steps} onChange={setSteps} min={0} max={14} step={0.5} format={(v) => `${v}h`} />
        </Card>
        <Card className="space-y-3">
          <Field label="Topic">
            <TextField placeholder="what did you work on?" />
          </Field>
          <Field label="Notes">
            <TextArea placeholder="optional" />
          </Field>
        </Card>
        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger" icon="trash">
            Danger
          </Button>
          <Button variant="secondary" onClick={() => setSheet(true)}>
            Open sheet
          </Button>
        </div>
      </CardList>

      <SectionLabel>Empty & honest states</SectionLabel>
      <CardList>
        <Empty>Nothing here yet.</Empty>
        <Card>
          <NotEnoughData />
        </Card>
      </CardList>

      <SectionLabel>Motion springs</SectionLabel>
      <Card className="space-y-1 font-mono text-[12px]">
        {Object.entries(MOTION).map(([name, spec]) => (
          <div key={name} className="flex justify-between">
            <span>{name}</span>
            <span className="text-ink-2">
              {spec.duration}ms · ζ{spec.dampingRatio} · settles {springCss(spec).ms}ms
            </span>
          </div>
        ))}
      </Card>

      <SectionLabel>Icons</SectionLabel>
      <Card className="grid grid-cols-8 gap-3">
        {ICON_NAMES.map((n) => (
          <span key={n} title={n} className="flex justify-center text-ink-2">
            <Icon name={n} size={20} />
          </span>
        ))}
      </Card>
      <div className="mt-2 flex gap-2">
        <IconButton icon="plus" label="Add" />
        <Chip selected>Selected chip</Chip>
        <Chip>Chip</Chip>
      </div>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Pre-mounted sheet">
        <Note>Spring {'{350ms, 0.88}'}. Drag the grabber down, press Esc, or tap the scrim to dismiss.</Note>
      </Sheet>
    </Screen>
  )
}
