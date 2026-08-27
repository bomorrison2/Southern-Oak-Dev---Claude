/** Building brief inspector. */
import type { ArchStyle, BudgetBand, BuildingType, OrientationPriority, Project, RoomKind } from '@/domain/types';
import { useStudio } from '@/persistence/store';
import { Alert, SelectField, TextField } from '@/ui/primitives';
import { validateBrief } from '@/domain/validation';
import { roomLabel } from '@/generation/rooms';

const ROOMS: RoomKind[] = ['living', 'kitchen', 'dining', 'bedroom', 'bathroom', 'utility', 'study', 'hall', 'garage'];

export function BriefPanel({ project }: { project: Project }) {
  const updateBrief = useStudio((s) => s.updateBrief);
  const brief = project.brief;
  const issues = validateBrief(brief);
  const errorFor = (field: string) => issues.find((i) => i.field === field)?.message;

  const num = (field: keyof typeof brief) => (e: { target: { value: string } }) => {
    const v = Number(e.target.value);
    if (!Number.isFinite(v)) return;
    updateBrief((b) => ({ ...b, [field]: v }));
  };

  const toggleRoom = (kind: RoomKind) =>
    updateBrief((b) => ({
      ...b,
      requiredRooms: b.requiredRooms.includes(kind)
        ? b.requiredRooms.filter((r) => r !== kind)
        : [...b.requiredRooms, kind],
    }));

  return (
    <>
      <div className="section">
        <div className="section__title">What are you building?</div>
        <SelectField
          label="Building type"
          value={brief.buildingType}
          onChange={(e) => updateBrief((b) => ({ ...b, buildingType: e.target.value as BuildingType }))}
        >
          <option value="detached">Detached house</option>
          <option value="semi-detached">Semi-detached house</option>
          <option value="terrace">Terrace</option>
          <option value="bungalow">Bungalow</option>
          <option value="annexe">Annexe</option>
        </SelectField>
        <div className="row">
          <TextField
            label="Floor area (m2)"
            type="number"
            min={20}
            value={String(brief.floorAreaSqm)}
            onChange={num('floorAreaSqm')}
            error={errorFor('floorAreaSqm')}
            hint="Gross internal, all storeys."
          />
          <TextField
            label="Storeys"
            type="number"
            min={1}
            max={4}
            value={String(brief.storeys)}
            onChange={num('storeys')}
            error={errorFor('storeys')}
          />
        </div>
        <div className="row">
          <TextField
            label="Bedrooms"
            type="number"
            min={0}
            max={12}
            value={String(brief.bedrooms)}
            onChange={num('bedrooms')}
            error={errorFor('bedrooms')}
          />
          <TextField
            label="Parking spaces"
            type="number"
            min={0}
            max={10}
            value={String(brief.parkingSpaces)}
            onChange={num('parkingSpaces')}
            error={errorFor('parkingSpaces')}
          />
        </div>
        <TextField
          label="Private outdoor space (m2)"
          type="number"
          min={0}
          value={String(brief.outdoorSpaceSqm)}
          onChange={num('outdoorSpaceSqm')}
          error={errorFor('outdoorSpaceSqm')}
          hint="Target garden or amenity area."
        />
      </div>

      <div className="section">
        <div className="section__title">Character and priorities</div>
        <SelectField
          label="Style"
          value={brief.style}
          onChange={(e) => updateBrief((b) => ({ ...b, style: e.target.value as ArchStyle }))}
          hint="Drives the material palette in the 3D view."
        >
          <option value="contemporary">Contemporary</option>
          <option value="traditional">Traditional</option>
          <option value="barn">Barn style</option>
          <option value="cottage">Cottage</option>
        </SelectField>
        <SelectField
          label="Budget band"
          value={brief.budgetBand}
          onChange={(e) => updateBrief((b) => ({ ...b, budgetBand: e.target.value as BudgetBand }))}
          hint="Recorded for the export pack. No cost estimate is produced."
        >
          <option value="value">Value</option>
          <option value="mid">Mid</option>
          <option value="premium">Premium</option>
        </SelectField>
        <SelectField
          label="Orientation priority"
          value={brief.orientationPriority}
          onChange={(e) =>
            updateBrief((b) => ({ ...b, orientationPriority: e.target.value as OrientationPriority }))
          }
        >
          <option value="garden-sun">Sunny garden</option>
          <option value="living-sun">Sunny living space</option>
          <option value="street-presence">Street presence</option>
          <option value="privacy">Privacy</option>
        </SelectField>
      </div>

      <div className="section">
        <div className="section__title">Required rooms</div>
        {errorFor('requiredRooms') && (
          <div style={{ marginBottom: 8 }}>
            <Alert kind="error">{errorFor('requiredRooms')}</Alert>
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {ROOMS.map((r) => {
            const on = brief.requiredRooms.includes(r);
            return (
              <button
                key={r}
                type="button"
                className="badge"
                aria-pressed={on}
                onClick={() => toggleRoom(r)}
                style={{
                  cursor: 'pointer',
                  borderColor: on ? 'var(--accent)' : undefined,
                  color: on ? 'var(--accent)' : undefined,
                  background: on ? 'var(--accent-quiet)' : 'transparent',
                }}
              >
                {roomLabel(r)}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
