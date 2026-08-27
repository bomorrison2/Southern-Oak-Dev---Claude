/** New project wizard: name, address, units, orientation and optional plot size. */
import { useState } from 'react';
import { useStudio } from '@/persistence/store';
import { navigate } from '@/app/router';
import { Alert, Button, Panel, SelectField, TextArea, TextField } from '@/ui/primitives';
import { createProject } from '@/domain/defaults';
import { validateNewProject, type NewProjectFields } from '@/domain/validation';
import { displayToMetres } from '@/domain/units';
import type { Units } from '@/domain/types';

const BLANK: NewProjectFields = {
  name: '',
  address: '',
  plotWidth: '',
  plotDepth: '',
  northOffsetDeg: '0',
};

export function NewProjectScreen() {
  const create = useStudio((s) => s.createProject);
  const [fields, setFields] = useState<NewProjectFields>(BLANK);
  const [units, setUnits] = useState<Units>('m');
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const issues = validateNewProject(fields);
  const errorFor = (field: string) =>
    submitted ? issues.find((i) => i.field === field)?.message : undefined;

  const set = (key: keyof NewProjectFields) => (e: { target: { value: string } }) =>
    setFields((f) => ({ ...f, [key]: e.target.value }));

  const submit = () => {
    setSubmitted(true);
    if (issues.length > 0) {
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    const w = fields.plotWidth.trim();
    const d = fields.plotDepth.trim();
    const project = createProject({
      name: fields.name.trim(),
      address: fields.address.trim(),
      units,
      notes: notes.trim(),
      northOffsetDeg: Number(fields.northOffsetDeg) || 0,
      ...(w && d
        ? {
            plotWidthM: displayToMetres(Number(w), units),
            plotDepthM: displayToMetres(Number(d), units),
          }
        : {}),
    });
    create(project);
    navigate({ name: 'studio', projectId: project.id });
  };

  const unitLabel = units === 'ft' ? 'feet' : 'metres';

  return (
    <div className="page form-narrow">
      <div className="page__head">
        <div>
          <h1>New project</h1>
          <p className="page__sub">
            Everything here can be changed later. You only need a name to get started.
          </p>
        </div>
      </div>

      {submitted && issues.length > 0 && (
        <div style={{ marginBottom: 'var(--s4)' }}>
          <Alert kind="error">
            {issues.length} field{issues.length === 1 ? ' needs' : 's need'} attention before you can continue.
          </Alert>
        </div>
      )}

      <Panel title="Project details">
        <TextField
          label="Project name"
          value={fields.name}
          onChange={set('name')}
          error={errorFor('name')}
          placeholder="e.g. Rear garden self-build"
          autoFocus
          required
        />
        <TextField
          label="Address or location"
          value={fields.address}
          onChange={set('address')}
          error={errorFor('address')}
          hint="Optional. Used on the exported pack."
          placeholder="e.g. 14 Meadow Lane, Hailsham"
        />
        <div className="row">
          <SelectField
            label="Units"
            value={units}
            onChange={(e) => setUnits(e.target.value === 'ft' ? 'ft' : 'm')}
            hint="Display only; geometry is stored in metres."
          >
            <option value="m">Metres</option>
            <option value="ft">Feet</option>
          </SelectField>
          <TextField
            label="North bearing"
            type="number"
            min={0}
            max={359}
            value={fields.northOffsetDeg}
            onChange={set('northOffsetDeg')}
            error={errorFor('northOffsetDeg')}
            hint="Degrees clockwise from up. 0 means north is up."
          />
        </div>
      </Panel>

      <div style={{ height: 'var(--s4)' }} />

      <Panel title="Plot size (optional)">
        <p className="muted" style={{ fontSize: 13 }}>
          Enter approximate dimensions to start from a rectangle, or leave blank and trace the plot
          from an uploaded plan.
        </p>
        <div className="row">
          <TextField
            label={`Width (${unitLabel})`}
            type="number"
            min={0}
            value={fields.plotWidth}
            onChange={set('plotWidth')}
            error={errorFor('plotWidth')}
            placeholder="34"
          />
          <TextField
            label={`Depth (${unitLabel})`}
            type="number"
            min={0}
            value={fields.plotDepth}
            onChange={set('plotDepth')}
            error={errorFor('plotDepth')}
            placeholder="26"
          />
        </div>
        <TextArea
          label="Site notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          hint="Anything you already know: levels, access, existing structures."
        />
      </Panel>

      <div style={{ display: 'flex', gap: 'var(--s2)', marginTop: 'var(--s5)' }}>
        <Button variant="primary" onClick={submit}>
          Create project
        </Button>
        <Button variant="ghost" onClick={() => navigate({ name: 'projects' })}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
